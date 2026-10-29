// © 2026 Gen Labs — All rights reserved.
// Provider "offline": gọi sidecar `voice` (VieNeu-TTS + faster-whisper) qua HTTP trong mạng compose. Không khoá, không hạn mức.
// Sidecar chỉ sinh giọng và nghe-chép; phần chấm (khớp kịch bản, thuật ngữ) nằm ở đây để cùng ngôn ngữ, có test, và giám khảo nghe "mù".
// Hợp đồng HTTP: docs/ARCHITECTURE.md §13.
'use strict';
const crypto = require('node:crypto');
const wav = require('../wav');
const { ProviderError } = require('./index');
const { normText, dist } = require('../gates/voice');

const DEFAULT_URL = 'http://voice:7491';
const TTS_TIMEOUT_MS = 190000;    // sidecar tự cắt ở 180 s (GS_VOICE_TIMEOUT_S); chờ dư 10 s để nhận 504 rõ ràng
const JUDGE_TIMEOUT_MS = 130000;
const PROBE_TIMEOUT_MS = 10000;
const MAX_MATCH_DIST = 0.15;      // cùng ngưỡng G-SCRIPT (media/gates/voice.js scriptMaxDist)
const NEXT_STEP = 'Chạy trên máy chủ: genstudio voice pull (tải model, bật dịch vụ giọng offline), rồi bấm Quét lại ở màn Nhà cung cấp.';

// Danh sách giọng dựng sẵn (SDK vieneu 3.8.3) — CHỈ là dự phòng khi chưa quét; nguồn thật là /health (STD-10).
const VOICES = ['DoanTrang', 'PhamTuyen', 'TrucLy', 'HaiDang', 'NgocHuyen', 'ThienMinh', 'MaiAnh', 'ThuyDung', 'ThienTamDuc', 'QuangSon',
  'NgocTran', 'MinhDuc', 'ThaiSon', 'XuanVinh', 'ThanhBinh', 'NgocLinh', 'ThucDoan', 'MinhTriet', 'MyDuyen', 'QuynhAnh', 'DucTri',
  'KimThanh', 'Adam', 'QuocTuan', 'AdamBua'];
const PREFERRED = { tts: ['vieneu-v3-turbo-fp32', 'vieneu-v3-turbo-int8'], judge: ['faster-whisper-small', 'faster-whisper-medium'] };

// Giọng Gemini → giọng offline ưu tiên (cùng giới). Cặp clip B: Charon (Anh Gen) → PhamTuyen, Leda (Bé Hỏi) → DoanTrang.
// Đích không còn trong danh sách quét ⇒ chọn ổn định trong danh sách quét cùng giới (CNS-204).
const GEMINI_FEMALE = ['Leda', 'Kore', 'Zephyr', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'];
const GEMINI_MALE = ['Charon', 'Puck', 'Orus', 'Fenrir', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Algenib', 'Rasalgethi', 'Alnilam', 'Schedar', 'Achird', 'Zubenelgenubi', 'Sadachbia', 'Sadaltager'];
const OFF_FEMALE = ['DoanTrang', 'NgocHuyen', 'TrucLy', 'MaiAnh', 'NgocLinh', 'QuynhAnh', 'ThuyDung', 'NgocTran', 'ThucDoan', 'MyDuyen', 'KimThanh'];
const OFF_MALE = ['PhamTuyen', 'HaiDang', 'ThienMinh', 'QuangSon', 'XuanVinh', 'MinhDuc', 'ThanhBinh', 'QuocTuan', 'ThaiSon', 'MinhTriet', 'DucTri', 'Adam', 'ThienTamDuc', 'AdamBua'];
const GEMINI_MAP = {};
GEMINI_FEMALE.forEach((g, i) => { GEMINI_MAP[g] = { to: OFF_FEMALE[i % OFF_FEMALE.length], gender: 'female' }; });
GEMINI_MALE.forEach((g, i) => { GEMINI_MAP[g] = { to: OFF_MALE[i % OFF_MALE.length], gender: 'male' }; });

const baseOf = (url) => String(url || DEFAULT_URL).replace(/\/+$/, '');
const pickStable = (list, key) => list[crypto.createHash('sha256').update(String(key)).digest().readUInt32BE(0) % list.length];

// voice (id offline hoặc tên Gemini cũ) → id offline có trong danh sách quét `live` [{id, gender}]
function resolveVoice(voice, live) {
  const ids = live.map((v) => v.id);
  if (ids.includes(voice)) return voice;
  const m = Object.hasOwn(GEMINI_MAP, voice) ? GEMINI_MAP[voice] : null;
  if (m && ids.includes(m.to)) return m.to;
  const same = m ? live.filter((v) => v.gender === m.gender).map((v) => v.id) : [];
  const pool = same.length ? same : ids;
  if (!pool.length) throw new ProviderError('bad_output', 'Dịch vụ giọng offline không có giọng nào.', { detail: 'voices=[]' });
  return pickStable(pool, voice);
}

async function call(base, method, path, { body, timeoutMs, expect = 'json' } = {}) {
  let res;
  try {
    res = await fetch(baseOf(base) + path, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new ProviderError('transient', timeout ? 'Dịch vụ giọng offline trả lời quá lâu.' : 'Chưa gọi được dịch vụ giọng offline (chưa chạy hoặc đang khởi động). ' + NEXT_STEP,
      { detail: `${method} ${path}: ${String((e && e.cause && e.cause.code) || (e && e.message) || e)}` });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    let j = null;
    try { j = JSON.parse(buf.toString('utf8')); } catch { /* thân lỗi không phải JSON */ }
    const code = (j && j.error && j.error.code) || 'http_' + res.status;
    const msg = (j && j.error && typeof j.error.message === 'string' ? j.error.message : buf.toString('utf8', 0, 200)).slice(0, 300);
    const detail = `HTTP ${res.status} ${code}: ${msg}`;
    if (res.status === 503 && code === 'not_ready') throw new ProviderError('transient', 'Dịch vụ giọng offline chưa sẵn sàng (model chưa tải hoặc đang nạp). ' + NEXT_STEP, { detail, retryAfterSec: parseInt(res.headers.get('retry-after'), 10) || null });
    if (res.status === 503 || res.status === 504 || res.status >= 500) throw new ProviderError('transient', 'Dịch vụ giọng offline đang bận hoặc lỗi tạm thời.', { detail, retryAfterSec: parseInt(res.headers.get('retry-after'), 10) || null });
    if (code === 'unknown_model') throw new ProviderError('bad_output', 'Model giọng offline đã đổi. Mở Nhà cung cấp, bấm Quét lại.', { detail });
    throw new ProviderError('bad_output', 'Dịch vụ giọng offline từ chối yêu cầu.', { detail });
  }
  if (expect === 'wav') return { buf, headers: res.headers };
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new ProviderError('bad_output', 'Dịch vụ giọng offline trả dữ liệu không phải JSON.', { detail: buf.toString('utf8', 0, 200) }); }
}

async function health(base, timeoutMs = PROBE_TIMEOUT_MS) {
  const h = await call(base, 'GET', '/health', { timeoutMs: Math.min(timeoutMs, PROBE_TIMEOUT_MS) });
  if (!h || typeof h !== 'object' || h.service !== 'gen-studio-voice' || !Array.isArray(h.models)) throw new ProviderError('bad_output', 'Địa chỉ GS_VOICE_URL không phải dịch vụ giọng của Gen-Studio.', { detail: JSON.stringify(h).slice(0, 200) });
  return h;
}
const liveVoices = (h) => (Array.isArray(h.voices) ? h.voices : []).filter((v) => v && typeof v.id === 'string').map((v) => ({ id: v.id, gender: v.gender === 'female' || v.gender === 'male' ? v.gender : null }));

async function tts({ url, model, voice, text, style, timeoutMs = TTS_TIMEOUT_MS }) {
  const h = await health(url, timeoutMs);
  if (!h.ready) throw new ProviderError('transient', 'Dịch vụ giọng offline chưa sẵn sàng (' + String(h.state) + '). ' + NEXT_STEP, { detail: String(h.detail || h.state).slice(0, 300) });
  const id = resolveVoice(voice, liveVoices(h));
  const r = await call(url, 'POST', '/tts', { body: { model, voice: id, text, ...(style ? { style: String(style).slice(0, 160) } : {}) }, timeoutMs, expect: 'wav' });
  const raw = r.buf;
  let parsed;
  try {
    if (!wav.isRiff(raw)) throw new Error('magic bytes lạ: ' + raw.subarray(0, 4).toString('hex'));   // L-101: kiểm magic, giải bằng parser định dạng
    parsed = wav.parse(raw);
  } catch (e) {
    throw new ProviderError('bad_output', 'Âm thanh từ dịch vụ giọng offline không giải được.', { detail: e.message });
  }
  if (!parsed.pcm.length) throw new ProviderError('bad_output', 'Âm thanh từ dịch vụ giọng offline rỗng.');
  return { raw, wav: wav.encode(parsed), duration_ms: Math.round((parsed.pcm.length / parsed.channels / parsed.rate) * 1000) };
}

// ---------- chấm từ lời chép (giám khảo nghe "mù": sidecar không thấy kịch bản) ----------
const tok = (s) => String(s || '').normalize('NFC').split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
const compact = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const isAcronym = (t) => /^(?:[A-Z]{2,}[0-9]*|(?:[A-Za-z]\.){2,}[A-Za-z]?\.?)$/.test(t);

// thuật ngữ có trong lời chép theo đúng chính tả Latin? (cửa sổ 1–4 token; viết tắt phải in hoa) → chuỗi khớp hoặc null
function findTerm(term, toks) {
  const want = compact(term);
  if (!want) return null;
  const acr = isAcronym(term);
  for (let i = 0; i < toks.length; i++) {
    let acc = '', raw = [];
    for (let k = 0; k < 4 && i + k < toks.length; k++) {
      acc += compact(toks[i + k]); raw.push(toks[i + k]);
      if (acc === want) {
        const s = raw.join(' ');
        if (acr && s.replace(/[^A-Za-z]/g, '') !== s.replace(/[^A-Za-z]/g, '').toUpperCase()) return null;
        return s;
      }
      if (acc.length >= want.length) break;
    }
  }
  return null;
}

function scoreAsr({ transcript, words }, { script, terms }) {
  const text = typeof transcript === 'string' ? transcript : '';
  const d = dist(normText(script || ''), normText(text));
  const nScript = tok(script).length, nHeard = tok(text).length;
  const toks = tok(text);
  const tm = {}, det = [];
  for (const t of terms || []) {
    const hit = findTerm(t, toks);
    tm[t] = hit ? 'english' : 'vietnamese';   // không thấy chính tả Latin ⇒ coi như đọc kiểu Việt (chặt: tạo lại, không cho qua)
    if (hit && !det.includes(hit)) det.push(hit);
  }
  const wt = Array.isArray(words) ? words.filter((x) => x && typeof x.w === 'string' && Number.isFinite(x.t0) && Number.isFinite(x.t1)).map((x) => ({ w: x.w, t0: x.t0, t1: x.t1 })) : [];
  return {
    transcript: text, matches: d <= MAX_MATCH_DIST, extra_speech: nHeard > nScript + Math.max(2, Math.ceil(nScript * 0.25)),
    terms: tm, detected_terms: det, word_times: wt.length ? wt : null,
  };
}

async function judge({ url, model, wav: wavBuf, script, terms = [], timeoutMs = JUDGE_TIMEOUT_MS }) {
  const b = Buffer.from(wavBuf);
  if (!wav.isRiff(b)) throw new ProviderError('bad_output', 'Âm thanh đưa giám khảo không phải WAV.');
  const r = await call(url, 'POST', '/judge', { body: { model, wav_b64: b.toString('base64'), lang: 'vi' }, timeoutMs });
  if (!r || typeof r.transcript !== 'string' || !Array.isArray(r.words)) throw new ProviderError('bad_output', 'Giám khảo offline trả sai hình dạng.', { detail: JSON.stringify(r).slice(0, 200) });
  return scoreAsr(r, { script, terms });
}

async function probe({ url }) {
  const h = await health(url);
  const quota = { value: null, source: 'local' };   // chạy trên máy: không có hạn mức lượt gọi
  const models = h.models.filter((m) => m && (m.kind === 'tts' || m.kind === 'judge') && typeof m.model === 'string')
    .map((m) => ({ kind: m.kind, model: m.model, available: !!(h.ready && m.ready), quota: { ...quota } }));
  const voices = liveVoices(h).map((v) => v.id);
  const meta = (Array.isArray(h.voices) ? h.voices : []).filter((v) => v && typeof v.id === 'string')
    .map((v) => ({ id: v.id, name: typeof v.name === 'string' ? v.name : v.id, gender: typeof v.gender === 'string' ? v.gender : null, accent: typeof v.accent === 'string' ? v.accent : null }));
  return { models, voices, voices_source: 'runtime_scan',
    service: { state: String(h.state || 'unknown'), ready: !!h.ready, detail: h.detail ? String(h.detail).slice(0, 300) : null, precision: h.precision || null, voices: meta } };
}

// gắn URL từ cấu hình (GS_VOICE_URL) — pipeline gọi như gemini: prov.tts({model, voice, text, style})
function bind(config = {}) {
  const url = config.voiceUrl || DEFAULT_URL;
  const lim = Number(config.voiceTimeoutMs) > 0 ? { timeoutMs: Number(config.voiceTimeoutMs) } : {};   // test/máy rất chậm mới đặt
  return {
    tts: (a) => tts(Object.assign({}, a, { url }, lim)), judge: (a) => judge(Object.assign({}, a, { url }, lim)), probe: (a) => probe(Object.assign({}, a, { url })),
    VOICES, PREFERRED,
  };
}

module.exports = { bind, tts, judge, probe, scoreAsr, resolveVoice, findTerm, VOICES, PREFERRED, GEMINI_MAP, DEFAULT_URL };
