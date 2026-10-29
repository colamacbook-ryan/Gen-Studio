// © 2026 Gen Labs — All rights reserved.
// Gói L: provider giọng offline qua HTTP thật tới sidecar GIẢ (http.createServer) — shape tts/judge giống gemini, lỗi map sang ProviderError,
// pipeline vendor offline chạy hết tới awaiting_review (dựng hình/ffmpeg stub như d-pipeline), manifest ghi đúng nhà cung cấp + align.method.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { tmpDb, basics, lessonBody } = require('./a-helpers.js');
const pipeline = require('../server/pipeline.js');
const events = require('../server/events.js');
const providers = require('../media/providers/index.js');
const offline = require('../media/providers/offline.js');
const fake = require('../media/providers/fake.js');
const wav = require('../media/wav.js');
const realGates = require('../media/gates/index.js');
const { gatesFor } = realGates;
const { validateRecipe } = require('../render/cast/validate.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const VOICES = [{ id: 'DoanTrang', name: 'Đoan Trang', gender: 'female' }, { id: 'PhamTuyen', name: 'Phạm Tuyên', gender: 'male' },
  { id: 'NgocHuyen', name: 'Ngọc Huyền', gender: 'female' }, { id: 'HaiDang', name: 'Hải Đăng', gender: 'male' }];

// Sidecar giả đúng hợp đồng §13: /health, /tts (WAV 48 kHz), /judge (nghe-chép: tra lời theo băm âm thanh đã sinh).
function fakeSidecar(opts = {}) {
  const said = new Map();
  const calls = { tts: [], judge: [] };
  const state = { ready: opts.ready !== false, state: opts.ready === false ? 'missing' : 'ready', mode: opts.mode || 'ok' };
  const srv = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, body, type = 'application/json') => { const b = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)); res.writeHead(status, { 'Content-Type': type, 'Content-Length': b.length }); res.end(b); };
      if (req.method === 'GET' && req.url === '/health') {
        return send(200, { ok: true, service: 'gen-studio-voice', version: '1', state: state.state, ready: state.ready, precision: 'fp32',
          models: [{ kind: 'tts', model: 'vieneu-v3-turbo-fp32', ready: state.ready }, { kind: 'codec', model: 'moss-audio-tokenizer-nano', ready: state.ready }, { kind: 'judge', model: 'faster-whisper-small', ready: state.ready }],
          voices: state.ready ? VOICES : [], detail: state.ready ? null : 'Thiếu tệp model — chạy: genstudio voice pull' });
      }
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: { code: 'bad_request', message: 'json' } }); }
      if (!state.ready) return send(503, { error: { code: 'not_ready', message: 'chưa tải model' } });
      if (req.url === '/tts') {
        calls.tts.push(body);
        if (state.mode === 'garbage') return send(200, Buffer.from('ID3\x04not a wav at all'), 'audio/wav');
        if (state.mode === 'slow') return setTimeout(() => send(504, { error: { code: 'timeout', message: 'chậm' } }), 400);
        if (!VOICES.some((v) => v.id === body.voice)) return send(404, { error: { code: 'unknown_voice', message: body.voice } });
        const p = wav.parse(fake.wrapWithC2pa(fake.synth(body.text, body.voice + calls.tts.length), body.text));   // mỗi lần sinh một "take" khác
        const out = wav.encode({ rate: p.rate, channels: 1, pcm: p.pcm });
        said.set(crypto.createHash('sha1').update(out).digest('hex'), body.text);
        return send(200, out, 'audio/wav');
      }
      if (req.url === '/judge') {
        calls.judge.push(body);
        const text = said.get(crypto.createHash('sha1').update(Buffer.from(body.wav_b64, 'base64')).digest('hex')) || '';
        const heard = opts.mishear ? opts.mishear(text) : text;
        const ws = heard.split(/\s+/).filter(Boolean);
        return send(200, { model: 'faster-whisper-small', transcript: heard, language: 'vi', duration_ms: 1000,
          words: ws.map((w, i) => ({ w, t0: i * 200, t1: i * 200 + 180, p: 0.9 })) });
      }
      send(404, { error: { code: 'not_found', message: 'x' } });
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + srv.address().port, calls, state, close: () => new Promise((c) => srv.close(c)) })));
}

function stubDeps() {
  return {
    timeline: { buildPlan({ lesson, clips }) {
      let t = 500; const lines = lesson.lines.map(l => { const a = t; t += clips[l.id].duration_ms; const o = { id: l.id, who: l.who, say: l.say, terms: l.terms, a_ms: a, b_ms: t }; t += 300; return o; });
      const beats = lesson.beats.map(b => { const ln = lines.find(x => x.id === b.anchor.line); return { id: b.id, block: b.block, t_in: ln.a_ms, t_anchor: ln.a_ms, t_out: ln.b_ms }; });
      return { fps: 30, size: [1920, 1080], duration_ms: t, lines, beats, camera: [], cues: [] };
    } },
    render: { async renderPlan({ plan, outDir }) {
      fs.mkdirSync(outDir, { recursive: true });
      const cover = path.join(outDir, 'cover.png'); fs.writeFileSync(cover, PNG);
      return { framesPattern: path.join(outDir, 'f%05d.png'), frames: Math.ceil(plan.duration_ms / 1000 * 30), fps: 30, errors: [], sfx: {}, cover };
    } },
    mix: { async mix({ out }) { fs.writeFileSync(out, 'RIFFfake-mix'); return out; }, async mux({ out }) { fs.writeFileSync(out, 'fake-mp4'); return out; } },
    gates: { gateWavB: async () => ({ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }), voiceGates: realGates.voiceGates, tailSig: realGates.tailSig, summarize: realGates.summarize,
      async renderGates() { return ['G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'].map(g => ({ gate: g, result: 'pass', measure: {} })).concat([{ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }]); } },
  };
}
// provider THẬT (không tiêm deps.providers, fakeProviders tắt) ⇒ đi qua media/providers/index.js → offline.js → HTTP
const mkctx = (t, url, extra = {}) => ({ db: t.db, write: t.write, events: events.create(),
  config: Object.assign({ dataDir: t.dir, fakeProviders: false, voiceUrl: url, ffmpegPath: 'ffmpeg', chromiumPath: null, version: 'test' }, extra),
  deps: stubDeps(), pipelineOpts: { backoffMs: 1 } });
async function runAll(t, ctx, b, body) {
  const r = t.write(b.o, 'lesson.submit', body || lessonBody(b));
  const w = pipeline.startWorkers(ctx, { pollMs: 20 });
  try { await w.idle(60000); } finally { w.stop(); }
  return t.db.json(t.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id));
}
function addOffline(t, b) {
  t.db.run('DELETE FROM providers');
  return ['tts', 'judge'].map((kind) => t.write(b.o, 'provider.save', { vendor: 'offline', kind }));
}

// ---------- adapter ----------
test('offline.judge trả ĐÚNG bộ khoá của gemini.judge; thuật ngữ thấy chính tả Latin ⇒ english, không thấy ⇒ vietnamese', () => {
  const j = offline.scoreAsr({ transcript: 'Mô hình GPT dùng token và attention để đoán chữ kế tiếp.', words: [{ w: 'Mô', t0: 0, t1: 200, p: 0.9 }] },
    { script: 'Mô hình GPT dùng token và attention để đoán chữ kế tiếp.', terms: ['GPT', 'token', 'attention', 'Large Language Model'] });
  assert.deepEqual(Object.keys(j).sort(), ['asr', 'detected_terms', 'extra_speech', 'matches', 'terms', 'transcript', 'word_times']); assert.equal(j.asr, true);
  assert.equal(j.matches, true); assert.equal(j.extra_speech, false);
  assert.deepEqual(j.terms, { GPT: 'english', token: 'english', attention: 'english', 'Large Language Model': 'vietnamese' });
  assert.deepEqual(j.detected_terms, ['GPT', 'token', 'attention']);
  assert.deepEqual(j.word_times, [{ w: 'Mô', t0: 0, t1: 200 }], 'bỏ trường p, giữ {w,t0,t1} cho media/align.js');
  // đọc kiểu Việt: whisper viết thành âm tiết Việt
  const v = offline.scoreAsr({ transcript: 'Mô hình gờ pê tê dùng tô cần', words: [] }, { script: 'Mô hình GPT dùng token', terms: ['GPT', 'token'] });
  assert.deepEqual(v.terms, { GPT: 'vietnamese', token: 'vietnamese' }); assert.equal(v.word_times, null);
  // viết tắt phải in hoa: "ai" (đại từ tiếng Việt) không tính là "AI"; "A.I." khớp "AI"
  assert.equal(offline.scoreAsr({ transcript: 'sao ai hay bịa', words: [] }, { script: 'sao AI hay bịa', terms: ['AI'] }).terms.AI, 'vietnamese');
  assert.equal(offline.scoreAsr({ transcript: 'học về AI nhé', words: [] }, { script: 'học về A.I. nhé', terms: ['A.I.'] }).terms['A.I.'], 'english');
  assert.equal(offline.scoreAsr({ transcript: 'học về Large Language Model nhé', words: [] }, { script: 'x', terms: ['Large Language Model'] }).terms['Large Language Model'], 'english');
  // lệch kịch bản / nói thừa
  assert.equal(offline.scoreAsr({ transcript: 'một câu hoàn toàn khác hẳn', words: [] }, { script: 'xin chào các bạn', terms: [] }).matches, false);
  assert.equal(offline.scoreAsr({ transcript: 'xin chào các bạn và thêm rất nhiều lời thừa nữa nha', words: [] }, { script: 'xin chào các bạn', terms: [] }).extra_speech, true);
});

test('offline.resolveVoice: giọng Gemini cũ → preset offline cùng giới theo danh sách QUÉT; id offline giữ nguyên; ổn định', () => {
  assert.equal(offline.resolveVoice('Charon', VOICES), 'PhamTuyen');
  assert.equal(offline.resolveVoice('Leda', VOICES), 'DoanTrang');
  assert.equal(offline.resolveVoice('HaiDang', VOICES), 'HaiDang');
  // đích ưu tiên không có trong danh sách quét ⇒ chọn trong danh sách cùng giới, lần nào cũng như nhau
  const live = VOICES.filter((v) => v.id !== 'PhamTuyen');
  const a = offline.resolveVoice('Charon', live), b2 = offline.resolveVoice('Charon', live);
  assert.equal(a, b2); assert.equal(live.find((v) => v.id === a).gender, 'male');
  assert.ok(VOICES.some((v) => v.id === offline.resolveVoice('TenLa', VOICES)));
});

test('providers.get chọn adapter theo vendor (bảng tĩnh); vendor lạ ⇒ ProviderError, không nạp module theo chuỗi', () => {
  assert.equal(providers.get({}, 'gemini'), require('../media/providers/gemini.js'));
  const o = providers.get({ voiceUrl: 'http://x:1' }, 'offline');
  assert.equal(typeof o.tts, 'function'); assert.equal(typeof o.judge, 'function'); assert.equal(typeof o.probe, 'function');
  assert.throws(() => providers.get({}, '../../etc/passwd'), (e) => e.name === 'ProviderError');
  assert.equal(providers.get({ fakeProviders: true }, 'offline'), require('../media/providers/fake.js'), 'GS_FAKE_PROVIDERS vẫn thắng (test/e2e cũ)');
});

test('offline: lỗi map sang ProviderError — sidecar tắt ⇒ transient, chưa tải model ⇒ transient + lệnh, WAV hỏng ⇒ bad_output, chậm ⇒ transient', async () => {
  // sidecar tắt: cổng đã đóng
  const dead = await fakeSidecar(); const deadUrl = dead.url; await dead.close();
  await assert.rejects(offline.tts({ url: deadUrl, model: 'vieneu-v3-turbo-fp32', voice: 'DoanTrang', text: 'xin chào' }),
    (e) => e.name === 'ProviderError' && e.code === 'transient' && /genstudio voice pull/.test(e.text_human) && !!e.detail);
  await assert.rejects(offline.probe({ url: deadUrl }), (e) => e.code === 'transient');
  // chưa tải model
  const miss = await fakeSidecar({ ready: false });
  try {
    await assert.rejects(offline.tts({ url: miss.url, model: 'm', voice: 'DoanTrang', text: 'x' }), (e) => e.code === 'transient' && /genstudio voice pull/.test(e.text_human));
    await assert.rejects(offline.judge({ url: miss.url, model: 'm', wav: wav.encode({ rate: 16000, pcm: new Int16Array(160) }), script: 'x' }), (e) => e.code === 'transient');
    const p = await offline.probe({ url: miss.url });
    assert.equal(p.service.state, 'missing'); assert.ok(p.models.every((m) => m.available === false));
  } finally { await miss.close(); }
  // trả byte không phải WAV (magic bytes sai — L-101)
  const bad = await fakeSidecar({ mode: 'garbage' });
  try { await assert.rejects(offline.tts({ url: bad.url, model: 'm', voice: 'DoanTrang', text: 'x' }), (e) => e.code === 'bad_output' && /magic/.test(e.detail)); } finally { await bad.close(); }
  // chậm hơn hạn chờ của adapter ⇒ transient (pipeline tự thử lại)
  const slow = await fakeSidecar({ mode: 'slow' });
  try { await assert.rejects(offline.tts({ url: slow.url, model: 'm', voice: 'DoanTrang', text: 'x', timeoutMs: 100 }), (e) => e.code === 'transient' && /quá lâu/.test(e.text_human)); } finally { await slow.close(); }
  // giọng không có ⇒ 404 ⇒ bad_output; đưa giám khảo thứ không phải WAV ⇒ bad_output (không gửi đi)
  const ok = await fakeSidecar();
  try {
    await assert.rejects(offline.judge({ url: ok.url, model: 'm', wav: Buffer.from('not wav'), script: 'x' }), (e) => e.code === 'bad_output');
    assert.equal(ok.calls.judge.length, 0);
  } finally { await ok.close(); }
});

test('offline.probe: model + giọng quét lúc chạy, không hạn mức; scanProvider lưu service vào scan qua write()', async () => {
  const sc = await fakeSidecar(); const t = tmpDb();
  try {
    const b = basics(t.write, t.db); const [pv] = addOffline(t, b);
    const ctx = mkctx(t, sc.url);
    const out = await pipeline.scanProvider(ctx, t.db.get('SELECT * FROM providers WHERE display_id=?', pv.display_id), b.o);
    assert.deepEqual(out.models.map((m) => [m.kind, m.model, m.available]), [['tts', 'vieneu-v3-turbo-fp32', true], ['judge', 'faster-whisper-small', true]], 'codec không phải kind của pipeline');
    assert.deepEqual(out.voices, VOICES.map((v) => v.id));
    const row = t.db.json(t.db.get('SELECT scan FROM providers WHERE display_id=?', pv.display_id));
    assert.equal(row.scan.service.state, 'ready'); assert.equal(row.scan.quota.source, 'local'); assert.equal(row.scan.available, true);
  } finally { t.clean(); await sc.close(); }
});

// ---------- dữ liệu / quyền ----------
test('provider.save vendor offline: không khoá, chỉ tts/judge; agent không lưu được nhà cung cấp', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const pv = t.write(b.o, 'provider.save', { vendor: 'offline', kind: 'tts' });
    assert.equal(t.db.get('SELECT secret_name FROM providers WHERE id=?', pv.id).secret_name, null);
    assert.throws(() => t.write(b.o, 'provider.save', { vendor: 'offline', kind: 'tts', key: 'k' }), (e) => e.code === 'invalid');
    assert.throws(() => t.write(b.o, 'provider.save', { vendor: 'offline', kind: 'align' }), (e) => e.code === 'invalid');
    assert.throws(() => t.write({ type: 'agent', id: 'AG-X', scopes: ['read', 'compose', 'run'], entry: 'mcp' }, 'provider.save', { vendor: 'offline', kind: 'judge' }), (e) => e.code === 'forbidden' || e.code === 'unauthorized' || /quyền|owner/i.test(e.message));
  } finally { t.clean(); }
});

test('lược đồ nhân vật: voice.provider=offline — tên giọng theo danh sách quét; chưa quét ⇒ chỉ cảnh báo', () => {
  const base = { voice: { provider: 'offline', model: null, voice: 'DoanTrang' } };
  const pick = (r, code) => r.errors.concat(r.warnings).filter((x) => x.code === code);
  assert.equal(pick(validateRecipe(base, { allowLight: true, voices: { offline: ['DoanTrang', 'PhamTuyen'] } }), 'unknown_voice').length, 0);
  assert.equal(pick(validateRecipe(base, { allowLight: true, voices: { offline: ['PhamTuyen'] } }), 'unknown_voice').length, 1);
  assert.equal(pick(validateRecipe(base, { allowLight: true }), 'voice_unscanned').length, 1);
  assert.equal(pick(validateRecipe({ voice: { provider: 'gemini', model: null, voice: 'Kore' } }, { allowLight: true }), 'bad_enum').length, 0);
});

// ---------- pipeline ----------
test('pipeline vendor offline (HTTP thật tới sidecar giả) → awaiting_review; manifest ghi offline + align asr; take trượt được sinh lại', async () => {
  // lần nghe đầu của câu có thuật ngữ bị "nghe" thành âm tiết Việt ⇒ G-PRON fail ⇒ pipeline tự sinh take khác (vòng có sẵn) ⇒ đạt
  let n = 0;
  const sc = await fakeSidecar({ mishear: (s) => (/A\.I\./.test(s) && n++ === 0 ? s.replace('A.I.', 'ây ai') : s) });
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db); addOffline(t, b);
    const ctx = mkctx(t, sc.url);
    const r = await runAll(t, ctx, b);
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.deepEqual(r.manifest.providers, { tts: { vendor: 'offline', model: 'vieneu-v3-turbo-fp32' }, judge: { vendor: 'offline', model: 'faster-whisper-small' }, align: { method: 'asr_word_times|chars' } });
    const gates = t.db.all("SELECT gate, result FROM gate_results WHERE subject_kind='render' AND subject_id=? AND COALESCE(json_extract(measure,'$.phase'),'')<>'voice_attempt'", r.id);
    assert.deepEqual(gates.map((g) => g.gate).sort(), gatesFor('lesson', {}).slice().sort(), 'đủ 8/8 cổng của bản dựng');
    assert.ok(gates.every((g) => g.result === 'pass'), JSON.stringify(gates));
    // giọng cast cũ (không đặt ⇒ 'Kore') được đổi sang preset offline cùng giới
    assert.ok(sc.calls.tts.every((c) => c.model === 'vieneu-v3-turbo-fp32' && VOICES.some((v) => v.id === c.voice) && c.seed === undefined));
    assert.equal(sc.calls.tts.length, 3, '2 câu + 1 take sinh lại');
    const fails = t.db.all("SELECT * FROM gate_results WHERE subject_kind='render' AND gate='G-PRON' AND result='fail' AND json_extract(measure,'$.phase')='voice_attempt'");
    assert.equal(fails.length, 1, 'take trượt được ghi lại');
    const clips = t.db.all('SELECT * FROM voice_clips');
    assert.equal(clips.length, 2);
    for (const c of clips.map((x) => t.db.json(x))) {
      assert.ok(Array.isArray(c.word_times) && c.word_times.length > 0 && c.envelope);
      const head = fs.readFileSync(pipeline.assetFile(t.db, c.raw_asset_id).file).subarray(0, 12);
      assert.equal(head.toString('latin1', 0, 4) + head.toString('latin1', 8, 12), 'RIFFWAVE');
    }
    assert.ok(t.db.json(clips[1]).terms_detected.includes('A.I'), 'detected_terms theo chính tả lời chép');
    // dựng lại cùng lời ⇒ dùng clip đã lưu (không gọi sidecar sinh lại)
    const before = sc.calls.tts.length;
    const r2 = await runAll(t, ctx, b, lessonBody(b, { title: 'Bài thử 2' }));
    assert.equal(r2.state, 'awaiting_review'); assert.equal(sc.calls.tts.length, before, 'đệm theo content_hash');
  } finally { t.clean(); await sc.close(); }
});

test('pipeline: trộn nhà cung cấp theo kind — giọng offline + giám khảo khác vendor gọi đúng adapter từng kind', async () => {
  const sc = await fakeSidecar(); const t = tmpDb();
  try {
    const b = basics(t.write, t.db); addOffline(t, b);
    const judged = [];
    const ctx = mkctx(t, sc.url);
    // tiêm providers: tts thật (offline qua HTTP), judge "gemini" giả — kiểm pipeline gọi get(config, vendor) theo TỪNG kind
    ctx.deps.providers = { get: (config, vendor) => (vendor === 'offline' ? providers.get(config, 'offline') : { judge: async (a) => { judged.push(a.model); return fake.judge(a); } }) };
    t.db.run("UPDATE providers SET vendor='gemini', model='gemini-3.5-flash' WHERE kind='judge'");
    const r = await runAll(t, ctx, b);
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.equal(sc.calls.judge.length, 0); assert.ok(judged.length >= 2 && judged.every((m) => m === 'gemini-3.5-flash'));
    assert.deepEqual(r.manifest.providers.judge, { vendor: 'gemini', model: 'gemini-3.5-flash' });
    assert.equal(r.manifest.providers.align.method, 'judge_word_times|chars', 'Gemini giữ chuỗi cũ (manifest bản dở không lệch)');
  } finally { t.clean(); await sc.close(); }
});

test('pipeline: sidecar chưa chạy ⇒ thử lại rồi blocked provider_transient, chữ nói rõ lệnh cần chạy + Chi tiết kỹ thuật', async () => {
  const dead = await fakeSidecar(); const url = dead.url; await dead.close();
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db); addOffline(t, b);
    const r = await runAll(t, mkctx(t, url), b);
    assert.equal(r.state, 'blocked');
    assert.equal(r.blocked_reason.code, 'provider_transient');
    assert.match(r.blocked_reason.text_human, /genstudio voice pull/);
    assert.equal(r.blocked_reason.detail.vendor, 'offline'); assert.ok(r.blocked_reason.detail.detail, 'chi tiết kỹ thuật cho người cần');
    assert.equal(typeof r.blocked_reason.text_human, 'string');
  } finally { t.clean(); }
});

// câu cực ngắn + giám khảo ASR: nới ngưỡng ≈ 1 âm tiết; lời khác hẳn vẫn trượt; giám khảo LLM (không asr) giữ ngưỡng gốc
test('G-SCRIPT: câu ≤ 3 từ với giám khảo ASR nới ngưỡng (xa vậy ≈ ra vậy), lời khác hẳn vẫn trượt; Gemini giữ ngưỡng 0,15', () => {
  const V = require('../media/gates/voice.js'), s = 'À, ra vậy!';
  const r = (transcript, asr = true) => V.gateScript({ judge: { asr, matches: false, transcript }, script: s });
  assert.equal(r('xa vậy').result, 'pass'); assert.equal(r('xa vậy').measure.short_asr, true);
  assert.equal(r('Hẹn gặp lại').result, 'fail'); assert.equal(r('dạ vội').result, 'fail');
  assert.equal(r('xa vậy', false).result, 'fail', 'giám khảo LLM: ngưỡng gốc');
  const long = V.gateScript({ judge: { asr: true, matches: false, transcript: 'Nên luôn kiểm tra nguồn nha' }, script: 'Nên luôn kiểm tra nguồn nhé, nhé các bạn.' });
  assert.equal(long.measure.short_asr, false); assert.equal(long.result, 'fail');
});
