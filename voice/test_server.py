# © 2026 Gen Labs — All rights reserved.
"""Test hợp đồng HTTP của sidecar giọng offline — KHÔNG cần model, numpy hay mạng (engine giả). Chạy: python3 -m unittest discover -s voice"""
import base64
import hashlib
import http.client
import io
import json
import os
import struct
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402

VOICES = [{'id': 'DoanTrang', 'name': 'Đoan Trang', 'gender': 'female', 'accent': 'north', 'style': None},
          {'id': 'PhamTuyen', 'name': 'Phạm Tuyên', 'gender': 'male', 'accent': 'north', 'style': None}]


class FakeEngine:
    def __init__(self, delay=0.0):
        self.voices, self.delay, self.calls = VOICES, delay, []

    def load(self):
        pass

    def synth(self, voice, text, seed=None):
        self.calls.append(('tts', voice, text, seed))
        time.sleep(self.delay)
        return struct.pack('<%dh' % 2400, *([0, 1000] * 1200)), 24000

    def transcribe(self, pcm, ch, rate, lang='vi'):
        self.calls.append(('judge', len(pcm), ch, rate, lang))
        time.sleep(self.delay)
        return 'xin chào', [{'w': 'xin', 't0': 0.0, 't1': 200.0, 'p': 0.9}, {'w': 'chào', 't0': 200.0, 't1': 999999.0, 'p': 0.8}], 'vi'


def wav_bytes(seconds=0.5, rate=16000, junk=False):
    b = server.write_wav(b'\x00\x00' * int(seconds * rate), rate)
    if junk:   # chunk C2PA thừa ở đuôi như blob thật (L-101)
        b = b + b'C2PA' + struct.pack('<I', 8) + b'\x01' * 8
        b = b[:4] + struct.pack('<I', len(b) - 8) + b[8:]
    return b


def manifest_for(root, content=b'model-bytes'):
    spec = {'kind': 'tts', 'repo': 'org/repo', 'revision': 'a' * 40, 'license': 'MIT', 'dir': 'm',
            'files': [{'path': 'w.bin', 'sha256': hashlib.sha256(content).hexdigest(), 'size': len(content)}]}
    return {'schema': 1, 'models': {'vieneu-v3-turbo-fp32': dict(spec, onnx_subdir='x'), 'moss-audio-tokenizer-nano': spec, 'faster-whisper-small': spec}}


class Base(unittest.TestCase):
    engine_delay = 0.0
    job_timeout = 5

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.manifest = manifest_for(self.root)
        os.makedirs(os.path.join(self.root, 'm'))
        with open(os.path.join(self.root, 'm', 'w.bin'), 'wb') as f:
            f.write(b'model-bytes')
        self.engine = FakeEngine(self.engine_delay)
        self.sel = server.selection(self.manifest, 'fp32', 'small')
        self.svc = server.Service(self.root, self.manifest, self.sel, lambda s: self.engine, job_timeout=self.job_timeout)
        self.svc.start(background=False)
        self.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.make_handler(self.svc))
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.port = self.httpd.server_address[1]

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def req(self, method, path, body=None, ctype='application/json', headers=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
        h = dict(headers or {})
        if data is not None:
            h.setdefault('Content-Type', ctype)
            h.setdefault('Content-Length', str(len(data)))
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        raw = r.read()
        c.close()
        try:
            j = json.loads(raw)
        except Exception:
            j = None
        return r.status, dict(r.getheaders()), raw, j


class TestContract(Base):
    def test_health(self):
        st, h, _, j = self.req('GET', '/health')
        self.assertEqual(st, 200)
        self.assertEqual((j['service'], j['state'], j['ready'], j['precision']), ('gen-studio-voice', 'ready', True, 'fp32'))
        self.assertEqual([m['kind'] for m in j['models']], ['tts', 'codec', 'judge'])
        self.assertEqual([v['id'] for v in j['voices']], ['DoanTrang', 'PhamTuyen'])

    def test_tts_ok_returns_wav_with_magic(self):
        st, h, raw, _ = self.req('POST', '/tts', {'model': 'vieneu-v3-turbo-fp32', 'voice': 'DoanTrang', 'text': ' Xin chào ', 'seed': 7, 'style': 'vui'})
        self.assertEqual(st, 200)
        self.assertEqual(h['Content-Type'], 'audio/wav')
        self.assertEqual((raw[:4], raw[8:12]), (b'RIFF', b'WAVE'))
        self.assertEqual(len(raw), 44 + 4800, 'WAV chuẩn, không chunk thừa')
        self.assertEqual(h['X-Duration-Ms'], '100')
        self.assertEqual(self.engine.calls[-1], ('tts', 'DoanTrang', 'Xin chào', 7))

    def test_tts_validation(self):
        cases = [({'voice': 'Đoan', 'text': 'x'}, 400, 'bad_request'), ({'voice': 'DoanTrang', 'text': '  '}, 400, 'bad_request'),
                 ({'voice': 'DoanTrang', 'text': 'x' * 1001}, 413, 'too_large'), ({'voice': 'KhongCo', 'text': 'x'}, 404, 'unknown_voice'),
                 ({'voice': 'DoanTrang', 'text': 'x', 'seed': -1}, 400, 'bad_request'), ({'voice': 'DoanTrang', 'text': 'x', 'seed': True}, 400, 'bad_request'),
                 ({'model': 'vieneu-v3-turbo-int8', 'voice': 'DoanTrang', 'text': 'x'}, 404, 'unknown_model'),
                 ({'voice': 'DoanTrang', 'text': 'x', 'style': 'y' * 161}, 400, 'bad_request')]
        for body, status, code in cases:
            st, _, _, j = self.req('POST', '/tts', body)
            self.assertEqual((st, j['error']['code']), (status, code), body)
            self.assertNotIn('Traceback', j['error']['message'])

    def test_body_limits_and_types(self):
        st, _, _, j = self.req('POST', '/tts', b'voice=x', ctype='text/plain')
        self.assertEqual((st, j['error']['code']), (415, 'unsupported_media_type'))
        st, _, _, j = self.req('POST', '/tts', b'{not json')
        self.assertEqual((st, j['error']['code']), (400, 'bad_request'))
        st, _, _, j = self.req('POST', '/tts', b'[]')
        self.assertEqual(st, 400)
        # khai Content-Length > 20 MB ⇒ từ chối trước khi đọc body
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        c.putrequest('POST', '/judge')
        c.putheader('Content-Type', 'application/json')
        c.putheader('Content-Length', str(server.MAX_BODY + 1))
        c.endheaders()
        r = c.getresponse()
        self.assertEqual((r.status, json.loads(r.read())['error']['code']), (413, 'too_large'))
        c.close()
        st, _, _, j = self.req('GET', '/etc/passwd')
        self.assertEqual(st, 404)

    def test_judge_ok_clamps_word_times(self):
        st, _, _, j = self.req('POST', '/judge', {'model': 'faster-whisper-small', 'wav_b64': base64.b64encode(wav_bytes(0.5, junk=True)).decode()})
        self.assertEqual(st, 200)
        self.assertEqual(set(j), {'model', 'transcript', 'words', 'language', 'duration_ms'})
        self.assertEqual(j['duration_ms'], 500)
        self.assertEqual(j['words'][1], {'w': 'chào', 't0': 200, 't1': 500, 'p': 0.8}, 'mốc từ kẹp trong độ dài clip, số nguyên ms')
        self.assertEqual(self.engine.calls[-1], ('judge', 16000, 1, 16000, 'vi'))

    def test_judge_rejects_bad_audio(self):
        for b64, code in [('***', 'bad_audio'), (base64.b64encode(b'ID3' + b'\x00' * 100).decode(), 'bad_audio'),
                          (base64.b64encode(b'RIFF\x00\x00\x00\x00WAVEjunk' + b'\x00' * 40).decode(), 'bad_audio')]:
            st, _, _, j = self.req('POST', '/judge', {'wav_b64': b64})
            self.assertEqual((st, j['error']['code']), (400, code))
        st, _, _, j = self.req('POST', '/judge', {'wav_b64': base64.b64encode(wav_bytes(121, rate=8000)).decode()})
        self.assertEqual((st, j['error']['code']), (413, 'too_large'))
        st, _, _, j = self.req('POST', '/judge', {'wav_b64': base64.b64encode(wav_bytes(0.5)).decode(), 'lang': 'vie'})
        self.assertEqual(st, 400)

    def test_one_request_at_a_time(self):
        self.svc.lock.acquire()
        try:
            st, h, _, j = self.req('POST', '/tts', {'voice': 'DoanTrang', 'text': 'x'})
            self.assertEqual((st, j['error']['code'], h.get('Retry-After')), (503, 'busy', '5'))
        finally:
            self.svc.lock.release()

    def test_voice_id(self):
        self.assertEqual(server.voice_id('Đoan Trang'), 'DoanTrang')
        self.assertEqual(server.voice_id('Adam bựa'), 'AdamBua')
        self.assertEqual(server.voice_id('Thiền Tâm Đức'), 'ThienTamDuc')


class TestTimeout(Base):
    engine_delay = 0.6
    job_timeout = 0.2

    def test_slow_job_504(self):
        st, _, _, j = self.req('POST', '/tts', {'voice': 'DoanTrang', 'text': 'x'})
        self.assertEqual((st, j['error']['code']), (504, 'timeout'))


class TestModels(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.manifest = manifest_for(self.root)
        self.sel = server.selection(self.manifest, 'fp32', 'small')

    def boot(self):
        made = []
        svc = server.Service(self.root, self.manifest, self.sel, lambda s: made.append(1) or FakeEngine())
        svc.start(background=False)
        return svc, made

    def test_missing_files_not_ready(self):
        svc, made = self.boot()
        self.assertEqual((svc.state, svc.health()['ready'], made), ('missing', False, []))
        self.assertIn('genstudio voice pull', svc.detail)

    def test_sha_mismatch_refuses_to_load(self):
        os.makedirs(os.path.join(self.root, 'm'))
        with open(os.path.join(self.root, 'm', 'w.bin'), 'wb') as f:
            f.write(b'model-bytez')    # cùng kích thước, khác nội dung
        svc, made = self.boot()
        self.assertEqual((svc.state, made), ('error', []), 'lệch sha256 ⇒ không gọi engine')

    def test_symlink_refused(self):
        os.makedirs(os.path.join(self.root, 'm'))
        real = os.path.join(self.root, 'real.bin')
        with open(real, 'wb') as f:
            f.write(b'model-bytes')
        os.symlink(real, os.path.join(self.root, 'm', 'w.bin'))
        svc, made = self.boot()
        self.assertEqual(svc.state, 'error')

    def test_not_ready_503(self):
        svc, _ = self.boot()
        httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.make_handler(svc))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            c = http.client.HTTPConnection('127.0.0.1', httpd.server_address[1], timeout=5)
            body = json.dumps({'voice': 'DoanTrang', 'text': 'x'})
            c.request('POST', '/tts', body=body, headers={'Content-Type': 'application/json'})
            r = c.getresponse()
            self.assertEqual((r.status, json.loads(r.read())['error']['code']), (503, 'not_ready'))
            c.close()
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_pull_verifies_sha_before_rename(self):
        spec = self.manifest['models']['faster-whisper-small']
        urls = []

        def opener(good):
            def op(req, timeout=None):
                urls.append(req.full_url)
                return io.BytesIO(b'model-bytes' if good else b'evil-bytes!')
            return op
        with self.assertRaises(RuntimeError):
            server.pull_model(self.root, spec, log=lambda s: None, opener=opener(False))
        self.assertFalse(os.path.exists(os.path.join(self.root, 'm', 'w.bin')))
        self.assertFalse(os.path.exists(os.path.join(self.root, 'm', 'w.bin.part')))
        server.pull_model(self.root, spec, log=lambda s: None, opener=opener(True))
        self.assertEqual(server.verify_model(self.root, spec)[0], True)
        self.assertEqual(urls[-1], 'https://huggingface.co/org/repo/resolve/' + 'a' * 40 + '/w.bin', 'tải đúng revision ghim')

    def test_manifest_rejects_traversal(self):
        bad = manifest_for(self.root)
        bad['models']['faster-whisper-small'] = dict(bad['models']['faster-whisper-small'], files=[{'path': '../x', 'sha256': 'a' * 64, 'size': 1}])
        p = os.path.join(self.root, 'models.json')
        with open(p, 'w') as f:
            json.dump(bad, f)
        with self.assertRaises(ValueError):
            server.load_manifest(p)

    def test_shipped_manifest_valid(self):
        m = server.load_manifest()
        sel = server.selection(m, 'fp32', 'small')
        self.assertEqual(sel, {'tts': 'vieneu-v3-turbo-fp32', 'codec': 'moss-audio-tokenizer-nano', 'judge': 'faster-whisper-small'})
        for mid, spec in m['models'].items():
            self.assertIn(spec['license'], ('Apache-2.0', 'MIT'), mid)


if __name__ == '__main__':
    unittest.main()
