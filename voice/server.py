# © 2026 Gen Labs — All rights reserved.
"""Gen-Studio voice sidecar: giọng offline (VieNeu-TTS v3 Turbo) + giám khảo nghe-chép (faster-whisper).

Chạy:  python server.py serve | pull | verify
- Chỉ dùng thư viện chuẩn cho HTTP (http.server), không framework.
- Model ghim revision + sha256 trong models.json, tải vào GS_VOICE_MODELS (mặc định /models); lệch ⇒ từ chối nạp.
- Mỗi lần xử lý một request (lock); có giới hạn body, độ dài text/âm thanh và thời gian.
Hợp đồng HTTP: docs/ARCHITECTURE.md §13 (repo gen-studio).
"""
import base64
import hashlib
import io
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE = 'gen-studio-voice'
VERSION = '1'
MAX_BODY = 20 * 1024 * 1024          # 20 MB
MAX_TEXT = 1000                      # ký tự mỗi câu
MAX_JUDGE_SEC = 120                  # độ dài âm thanh tối đa cho giám khảo
SOCKET_TIMEOUT = 30                  # đọc request chậm quá ⇒ đóng
TTS_RATE = 48000
ASR_RATE = 16000
PAD_SEC = 0.5                        # đệm lặng hai đầu trước khi nghe-chép (như bake-off)
FADE_MS = 10                         # làm mềm biên câu (G-WAV đầu/cuối câu)
MODEL_ID = re.compile(r'^[a-z0-9][a-z0-9.-]{1,63}$')
VOICE_ID = re.compile(r'^[A-Za-z][A-Za-z0-9_-]{1,39}$')
HEX40 = re.compile(r'^[0-9a-f]{40}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')


def env(name, default):
    v = os.environ.get(name)
    return v if v not in (None, '') else default


def env_int(name, default, lo, hi):
    try:
        return max(lo, min(hi, int(env(name, default))))
    except ValueError:
        return default


# ---------------------------------------------------------------- model manifest + kiểm sha256
def load_manifest(path=None):
    with open(path or os.path.join(HERE, 'models.json'), encoding='utf-8') as f:
        m = json.load(f)
    for mid, spec in m['models'].items():
        if not MODEL_ID.match(mid) or not HEX40.match(spec['revision']) or not re.match(r'^[\w.-]+/[\w.-]+$', spec['repo']):
            raise ValueError('models.json: mục không hợp lệ ' + mid)
        for f in spec['files']:
            p = f['path']
            if p.startswith('/') or '..' in p.split('/') or not HEX64.match(f['sha256']) or int(f['size']) <= 0:
                raise ValueError('models.json: tệp không hợp lệ %s/%s' % (mid, p))
    return m


def selection(manifest, precision=None, judge=None):
    """Bộ model đang dùng theo cấu hình: tts (fp32|int8), codec, judge (small|medium)."""
    precision = precision or env('GS_VOICE_PRECISION', 'fp32')
    judge = judge or env('GS_VOICE_JUDGE', 'small')
    want = {'tts': 'vieneu-v3-turbo-' + precision, 'codec': 'moss-audio-tokenizer-nano', 'judge': 'faster-whisper-' + judge}
    for k, mid in want.items():
        if mid not in manifest['models']:
            raise ValueError('Cấu hình model không có trong models.json: %s=%s' % (k, mid))
    return want


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def model_dir(root, spec):
    return os.path.join(root, spec['dir'])


def verify_model(root, spec):
    """→ (ok, lý do). Thiếu tệp ⇒ 'missing'; lệch ⇒ 'mismatch'."""
    base = model_dir(root, spec)
    for f in spec['files']:
        p = os.path.join(base, f['path'])
        if not os.path.isfile(p):
            return False, 'missing', f['path']
        if os.path.islink(p) or os.path.getsize(p) != int(f['size']) or sha256_file(p) != f['sha256']:
            return False, 'mismatch', f['path']
    return True, 'ok', None


def pull_model(root, spec, log=print, opener=None):
    """Tải từng tệp ở đúng revision qua HTTPS, kiểm sha256 + size trước khi đổi tên (.part → tên thật)."""
    base = model_dir(root, spec)
    for f in spec['files']:
        dst = os.path.join(base, f['path'])
        if os.path.isfile(dst) and os.path.getsize(dst) == int(f['size']) and sha256_file(dst) == f['sha256']:
            log('  ✓ %s (đã có)' % f['path'])
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        url = 'https://huggingface.co/%s/resolve/%s/%s' % (spec['repo'], spec['revision'], f['path'])
        part = dst + '.part'
        h, n, t0 = hashlib.sha256(), 0, time.time()
        req = urllib.request.Request(url, headers={'User-Agent': 'gen-studio-voice/' + VERSION})
        with (opener or urllib.request.urlopen)(req, timeout=60) as r, open(part, 'wb') as out:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                n += len(b)
                if n > int(f['size']):
                    break
                h.update(b)
                out.write(b)
        if n != int(f['size']) or h.hexdigest() != f['sha256']:
            os.remove(part)
            raise RuntimeError('Tệp %s/%s sai kích thước hoặc sha256 — từ chối.' % (spec['repo'], f['path']))
        os.replace(part, dst)
        log('  ✓ %s (%.1f MB, %.0f s)' % (f['path'], n / 1e6, time.time() - t0))


# ---------------------------------------------------------------- âm thanh — thư viện chuẩn `wave` (không PyAV; L-101: kiểm magic bytes, giải bằng parser định dạng)
def read_wav(buf):
    """WAV PCM 16-bit → (pcm bytes LE, channels, rate, frames). Sai magic/định dạng ⇒ ValueError. Chunk lạ (vd C2PA) được bỏ qua."""
    if len(buf) < 44 or buf[0:4] != b'RIFF' or buf[8:12] != b'WAVE':
        raise ValueError('Không phải RIFF/WAVE (magic bytes sai)')
    try:
        with wave.open(io.BytesIO(buf), 'rb') as w:
            if w.getsampwidth() != 2:
                raise ValueError('Chỉ nhận PCM 16-bit')
            ch, rate, n = w.getnchannels(), w.getframerate(), w.getnframes()
            if ch < 1 or ch > 8 or rate < 8000 or rate > 192000:
                raise ValueError('Tham số WAV không hợp lệ')
            data = w.readframes(n)
    except (wave.Error, EOFError) as e:
        raise ValueError('WAV hỏng: %s' % e)
    return data, ch, rate, len(data) // (2 * ch)


def write_wav(pcm16, rate):
    """PCM 16-bit LE mono (bytes) → WAV chuẩn 44 byte đầu, không chunk thừa."""
    bio = io.BytesIO()
    with wave.open(bio, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm16)
    return bio.getvalue()


# ---------------------------------------------------------------- giọng preset
# Chỉ mở preset mà model card (commit đã ghim trong models.json) xác nhận người nói ĐỒNG Ý cho tổng hợp giọng thương mại
# (bảng "Preset Voices (23)"). SDK đổi tên vài giọng — so cả tên lẫn aliases. Preset SDK thêm mà model card chưa nêu ⇒ ẩn.
CONSENTED_PRESETS = frozenset([
    'Anh Khôi', 'Mai Anh', 'Minh Quân', 'Minh Đức', 'Mạnh Dũng', 'Ngọc Huyền', 'Ngọc Linh', 'Phạm Tuyên', 'Quỳnh Anh',
    'Thanh Bình', 'Trúc Ly', 'Xuân Vĩnh', 'Đoan Trang', 'Ngọc Trân', 'Quang Sơn', 'Adam', 'Kim Thanh', 'Minh Triết',
    'Mỹ Duyên', 'Thái Sơn', 'Thùy Dung', 'Thục Đoan', 'Đức Trí'])


def consented(name, aliases=()):
    return any(unicodedata.normalize('NFC', n) in CONSENTED_PRESETS for n in [name, *(aliases or [])])


def voice_id(name):
    """'Đoan Trang' → 'DoanTrang' (ASCII, hợp lệ với VOICE_NAME của lược đồ nhân vật)."""
    s = unicodedata.normalize('NFD', name.replace('Đ', 'D').replace('đ', 'd'))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return ''.join(p[:1].upper() + p[1:] for p in re.split(r'[^A-Za-z0-9]+', s) if p)


def accent_of(desc):
    for k, v in (('Bắc', 'north'), ('Trung', 'central'), ('Nam ·', 'south'), ('· Nam', 'south')):
        if k in (desc or ''):
            return v
    return None


# ---------------------------------------------------------------- engine thật (VieNeu + faster-whisper)
class Engine:
    def __init__(self, root, manifest, sel, threads):
        self.root, self.manifest, self.sel, self.threads = root, manifest, sel, threads
        self.tts = self.asr = None
        self.voices = []           # [{id,name,gender,accent,style}]
        self._by_id = {}

    def load(self):
        os.environ['HF_HUB_OFFLINE'] = '1'      # không gọi mạng lúc phục vụ
        os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
        from vieneu import Vieneu
        from faster_whisper import WhisperModel
        tts_spec = self.manifest['models'][self.sel['tts']]
        codec_spec = self.manifest['models'][self.sel['codec']]
        judge_spec = self.manifest['models'][self.sel['judge']]
        vdir = model_dir(self.root, tts_spec)
        # SDK 3.8.3 không chuyển codec_dir xuống engine ONNX mà tự tải codec qua huggingface_hub. Chặn mọi lần tải
        # lúc phục vụ: _fetch chỉ trả thư mục codec đã kiểm sha256, repo khác ⇒ lỗi (không gọi mạng).
        from pathlib import Path
        from vieneu._v3_turbo_engine import onnx_runtime_lite as orl
        local = {codec_spec['repo']: model_dir(self.root, codec_spec)}

        def _fetch(repo, files, subfolder):
            if repo in local and not subfolder:
                return Path(local[repo])
            raise RuntimeError('Không tải model lúc phục vụ: ' + str(repo))
        orl.OnnxV3LiteEngine._fetch = staticmethod(_fetch)
        self.tts = Vieneu(mode='v3turbo', backbone_repo=vdir, backend='onnx', device='cpu',
                          onnx_dir=os.path.join(vdir, tts_spec['onnx_subdir']), threads=self.threads)
        self.asr = WhisperModel(model_dir(self.root, judge_spec), device='cpu', compute_type='int8',
                                cpu_threads=self.threads, local_files_only=True)
        voices = []
        for label, name in self.tts.list_preset_voices():
            p = self.tts.get_preset_voice(name)
            if not consented(name, p.get('aliases') if isinstance(p, dict) else ()):
                continue
            vid = voice_id(name)
            if not VOICE_ID.match(vid) or vid in self._by_id:
                continue
            self._by_id[vid] = name
            voices.append({'id': vid, 'name': name, 'gender': p.get('gender') or None,
                           'accent': accent_of(p.get('description')), 'style': p.get('description') or None})
        self.voices = voices

    def synth(self, voice, text, seed=None):
        """→ (PCM 16-bit LE mono bytes, rate). Có fade ngắn hai đầu (G-WAV đầu/cuối câu)."""
        import numpy as np
        name = self._by_id[voice]
        if seed is not None:
            np.random.seed(seed)                # VieNeu lấy mẫu bằng np.random toàn cục
        a = self.tts.infer(text, voice=self.tts.get_preset_voice(name), temperature=0.8)
        a = np.clip(np.asarray(a, dtype=np.float32).reshape(-1), -1.0, 1.0)
        rate = int(getattr(self.tts, 'sample_rate', TTS_RATE))
        k = min(len(a) // 2, int(rate * FADE_MS / 1000))
        if k > 0:
            ramp = np.linspace(0.0, 1.0, k, dtype=np.float32)
            a[:k] *= ramp
            a[-k:] *= ramp[::-1]
        return (a * 32767.0).astype('<i2').tobytes(), rate

    def transcribe(self, pcm, ch, rate, lang='vi'):
        import numpy as np
        import soxr
        x = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
        if ch > 1:
            x = x[: len(x) - len(x) % ch].reshape(-1, ch).mean(axis=1)
        x = soxr.resample(x, rate, ASR_RATE) if rate != ASR_RATE else x
        pad = np.zeros(int(ASR_RATE * PAD_SEC), dtype=np.float32)
        x = np.concatenate([pad, x.astype(np.float32), pad])
        segs, info = self.asr.transcribe(x, language=lang, beam_size=5, word_timestamps=True,
                                         condition_on_previous_text=False, vad_filter=False)
        words, texts = [], []
        for s in segs:
            texts.append(s.text.strip())
            for w in s.words or []:
                words.append({'w': w.word.strip(), 't0': (w.start - PAD_SEC) * 1000.0, 't1': (w.end - PAD_SEC) * 1000.0,
                              'p': round(float(w.probability), 3)})
        return ' '.join(t for t in texts if t), [w for w in words if w['w']], info.language


# ---------------------------------------------------------------- trạng thái dịch vụ
class Service:
    def __init__(self, root, manifest, sel, engine_factory, job_timeout=180):
        self.root, self.manifest, self.sel = root, manifest, sel
        self.engine_factory = engine_factory
        self.state, self.detail, self.engine = 'verifying', None, None
        self.lock = threading.Lock()           # MỘT request nặng mỗi lúc
        self.job_timeout = job_timeout

    def start(self, background=True):
        t = threading.Thread(target=self._boot, daemon=True)
        t.start()
        if not background:
            t.join()

    def _boot(self):
        try:
            self.state = 'verifying'
            for kind, mid in self.sel.items():
                ok, why, f = verify_model(self.root, self.manifest['models'][mid])
                if not ok:
                    self.state = 'missing' if why == 'missing' else 'error'
                    self.detail = ('Thiếu tệp model %s/%s — chạy: genstudio voice pull' if why == 'missing'
                                   else 'Tệp model %s/%s sai sha256/kích thước — từ chối nạp; chạy lại: genstudio voice pull') % (mid, f)
                    return
            self.state = 'loading'
            eng = self.engine_factory(self)
            eng.load()
            self.engine, self.state, self.detail = eng, 'ready', None
        except Exception as e:  # nạp hỏng: báo trạng thái, không làm sập tiến trình
            self.state, self.detail = 'error', 'Nạp model lỗi: %s' % type(e).__name__
            print('[voice] nạp model lỗi: %r' % (e,), file=sys.stderr, flush=True)

    def health(self):
        ready = self.state == 'ready'
        models = [{'kind': k, 'model': mid, 'ready': ready,
                   'revision': self.manifest['models'][mid]['revision']} for k, mid in self.sel.items()]
        return {'ok': True, 'service': SERVICE, 'version': VERSION, 'state': self.state, 'ready': ready,
                'precision': self.sel['tts'].rsplit('-', 1)[-1], 'models': models,
                'voices': self.engine.voices if ready else [], 'detail': self.detail}

    def run_locked(self, fn):
        """Chạy fn trong lock với hạn giờ. Bận ⇒ ('busy'); quá giờ ⇒ ('timeout') (việc dở vẫn giữ lock tới khi xong)."""
        if not self.lock.acquire(timeout=1.0):
            return 'busy', None
        box, done = {}, threading.Event()

        def work():
            try:
                box['v'] = fn()
            except Exception as e:
                box['e'] = e
            finally:
                self.lock.release()
                done.set()
        threading.Thread(target=work, daemon=True).start()
        if not done.wait(self.job_timeout):
            return 'timeout', None
        if 'e' in box:
            raise box['e']
        return 'ok', box['v']


class ApiError(Exception):
    def __init__(self, status, code, message, headers=None):
        super().__init__(message)
        self.status, self.code, self.message, self.headers = status, code, message, headers or {}


def make_handler(svc):
    class H(BaseHTTPRequestHandler):
        server_version = 'gen-studio-voice/' + VERSION
        sys_version = ''
        timeout = SOCKET_TIMEOUT
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *args):   # không ghi nội dung request vào log
            sys.stderr.write('[voice] %s %s\n' % (self.command, self.path.split('?')[0]))

        def _send(self, status, body, ctype, headers=None):
            self.send_response(status)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status, obj, headers=None):
            self._send(status, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8', headers)

        def _err(self, e):
            self._json(e.status, {'error': {'code': e.code, 'message': e.message}}, e.headers)

        def _body(self):
            ct = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
            if ct != 'application/json':
                raise ApiError(415, 'unsupported_media_type', 'Chỉ nhận application/json.')
            if self.headers.get('Transfer-Encoding'):
                raise ApiError(400, 'bad_request', 'Cần Content-Length, không nhận chunked.')
            try:
                n = int(self.headers.get('Content-Length') or '-1')
            except ValueError:
                n = -1
            if n < 0:
                raise ApiError(400, 'bad_request', 'Thiếu Content-Length.')
            if n > MAX_BODY:
                raise ApiError(413, 'too_large', 'Request quá %d MB.' % (MAX_BODY // (1024 * 1024)))
            raw = self.rfile.read(n)
            try:
                obj = json.loads(raw.decode('utf-8'))
            except Exception:
                raise ApiError(400, 'bad_request', 'Body không phải JSON hợp lệ.')
            if not isinstance(obj, dict):
                raise ApiError(400, 'bad_request', 'Body phải là object JSON.')
            return obj

        def _ready(self, obj, kind):
            if svc.state != 'ready':
                raise ApiError(503, 'not_ready', svc.detail or 'Dịch vụ giọng offline đang khởi động (%s).' % svc.state, {'Retry-After': '10'})
            m = obj.get('model')
            if m is not None and m != svc.sel[kind]:
                raise ApiError(404, 'unknown_model', 'Model %r không chạy ở đây (đang chạy %s).' % (str(m)[:64], svc.sel[kind]))

        def _locked(self, fn):
            st, v = svc.run_locked(fn)
            if st == 'busy':
                raise ApiError(503, 'busy', 'Đang xử lý một yêu cầu khác.', {'Retry-After': '5'})
            if st == 'timeout':
                raise ApiError(504, 'timeout', 'Xử lý quá %d giây.' % svc.job_timeout)
            return v

        def do_GET(self):
            if self.path.split('?')[0] == '/health':
                return self._json(200, svc.health())
            self._err(ApiError(404, 'not_found', 'Không có đường này.'))

        def do_POST(self):
            path = self.path.split('?')[0]
            try:
                if path == '/tts':
                    return self._tts(self._body())
                if path == '/judge':
                    return self._judge(self._body())
                raise ApiError(404, 'not_found', 'Không có đường này.')
            except ApiError as e:
                self._err(e)
            except Exception as e:
                print('[voice] lỗi nội bộ: %s' % type(e).__name__, file=sys.stderr, flush=True)
                self._err(ApiError(500, 'internal', 'Lỗi nội bộ dịch vụ giọng.'))

        def _tts(self, o):
            self._ready(o, 'tts')
            voice, text, seed, style = o.get('voice'), o.get('text'), o.get('seed'), o.get('style')
            if not isinstance(voice, str) or not VOICE_ID.match(voice):
                raise ApiError(400, 'bad_request', 'voice phải là id giọng ASCII.')
            if not isinstance(text, str) or not text.strip():
                raise ApiError(400, 'bad_request', 'text rỗng.')
            if len(text) > MAX_TEXT:
                raise ApiError(413, 'too_large', 'text quá %d ký tự.' % MAX_TEXT)
            if seed is not None and (not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed < 2 ** 32):
                raise ApiError(400, 'bad_request', 'seed là số nguyên 0…2^32-1.')
            if style is not None and (not isinstance(style, str) or len(style) > 160):
                raise ApiError(400, 'bad_request', 'style là chuỗi ≤ 160 ký tự.')
            if voice not in {v['id'] for v in svc.engine.voices}:
                raise ApiError(404, 'unknown_voice', 'Không có giọng %s.' % voice)

            def job():
                t0 = time.time()
                pcm, rate = svc.engine.synth(voice, text.strip(), seed)
                return pcm, rate, time.time() - t0
            pcm, rate, dt = self._locked(job)
            if not pcm:
                raise ApiError(500, 'internal', 'Model không sinh được âm thanh.')
            body = write_wav(pcm, rate)
            dur = int(round(len(pcm) / 2 * 1000 / rate))
            self._send(200, body, 'audio/wav', {'X-Duration-Ms': str(dur), 'X-Model': svc.sel['tts'],
                                                'X-Gen-Seconds': '%.3f' % dt})

        def _judge(self, o):
            self._ready(o, 'judge')
            b64, lang = o.get('wav_b64'), o.get('lang', 'vi')
            if not isinstance(lang, str) or not re.match(r'^[a-z]{2}$', lang):
                raise ApiError(400, 'bad_request', 'lang là mã 2 chữ.')
            if not isinstance(b64, str) or not b64:
                raise ApiError(400, 'bad_request', 'Thiếu wav_b64.')
            try:
                buf = base64.b64decode(b64, validate=True)
            except Exception:
                raise ApiError(400, 'bad_audio', 'wav_b64 không phải base64.')
            try:
                pcm, ch, rate, frames = read_wav(buf)
            except ValueError as e:
                raise ApiError(400, 'bad_audio', 'Âm thanh không hợp lệ: %s' % e)
            dur = frames / rate
            if dur <= 0.05:
                raise ApiError(400, 'bad_audio', 'Âm thanh rỗng.')
            if dur > MAX_JUDGE_SEC:
                raise ApiError(413, 'too_large', 'Âm thanh quá %d giây.' % MAX_JUDGE_SEC)
            text, words, language = self._locked(lambda: svc.engine.transcribe(pcm, ch, rate, lang))
            dms = dur * 1000.0
            words = [{'w': w['w'], 't0': int(round(max(0.0, min(dms, w['t0'])))), 't1': int(round(max(0.0, min(dms, w['t1'])))), 'p': w['p']} for w in words]
            self._json(200, {'model': svc.sel['judge'], 'transcript': text, 'words': words, 'language': language,
                             'duration_ms': int(round(dms))})
    return H


def serve(svc, host, port):
    httpd = ThreadingHTTPServer((host, port), make_handler(svc))
    httpd.daemon_threads = True
    print('[voice] nghe %s:%d · model: %s' % (host, port, ', '.join(svc.sel.values())), flush=True)
    httpd.serve_forever()


def main(argv):
    cmd = argv[1] if len(argv) > 1 else 'serve'
    root = env('GS_VOICE_MODELS', '/models')
    manifest = load_manifest(env('GS_VOICE_MANIFEST', None))
    sel = selection(manifest)
    if cmd == 'pull':
        for kind, mid in sel.items():
            spec = manifest['models'][mid]
            print('◐ %s (%s @ %s, %s)' % (mid, spec['repo'], spec['revision'][:12], spec['license']), flush=True)
            pull_model(root, spec, log=lambda s: print(s, flush=True))
        print('✓ Đã tải đủ model vào %s' % root)
        return 0
    if cmd == 'verify':
        bad = 0
        for kind, mid in sel.items():
            ok, why, f = verify_model(root, manifest['models'][mid])
            print(('✓ %s' % mid) if ok else ('✗ %s: %s %s' % (mid, why, f)))
            bad += 0 if ok else 1
        return 1 if bad else 0
    if cmd == 'serve':
        threads = env_int('GS_VOICE_THREADS', 4, 1, 64)
        svc = Service(root, manifest, sel, lambda s: Engine(s.root, s.manifest, s.sel, threads),
                      job_timeout=env_int('GS_VOICE_TIMEOUT_S', 180, 5, 3600))
        svc.start()
        serve(svc, env('GS_VOICE_HOST', '127.0.0.1'), env_int('GS_VOICE_PORT', 7491, 1, 65535))
        return 0
    print('Dùng: server.py serve | pull | verify', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
