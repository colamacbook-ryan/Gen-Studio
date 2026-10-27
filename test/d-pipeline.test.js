// © 2026 Gen Labs — All rights reserved.
// Gói D: pipeline với stub cho dựng hình/ffmpeg (provider giả + cổng giọng thật của gói B): đệm giọng, G-PRON fail → blocked, quota → waiting_quota, export.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpDb, basics, lessonBody } = require('./a-helpers.js');
const pipeline = require('../server/pipeline.js');
const state = require('../server/state.js');
const events = require('../server/events.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const realGates = require('../media/gates/index.js');
function stubDeps(tmp) {
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
function mkctx(t) {
  return { db: t.db, write: t.write, events: events.create(), config: { dataDir: t.dir, fakeProviders: true, ffmpegPath: 'ffmpeg', chromiumPath: null, version: 'test' }, deps: stubDeps(), pipelineOpts: { backoffMs: 1 } };
}
async function submitAndRun(t, ctx, b, body) {
  const r = t.write(b.o, 'lesson.submit', body || lessonBody(b));
  const w = pipeline.startWorkers(ctx, { pollMs: 20 });
  try { await w.idle(60000); } finally { w.stop(); }
  return t.db.json(t.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id));
}

test('d-pipeline: extractTerms', () => {
  assert.deepEqual(pipeline.extractTerms('Vì A.I., cụ thể là Large Language Model, không tra cứu. Gọi là next token prediction.'), ['A.I.', 'Language', 'prediction']);
  assert.deepEqual(pipeline.extractTerms('Anh Gen ơi, sao nói sai mà vẫn tự tin thế ạ?'), [], 'tiếng Việt không dấu không bị nhầm là tiếng Anh');
  assert.deepEqual(pipeline.extractTerms('Nó rất hay.'), []);
});

test('d-pipeline: render qua đủ bước → awaiting_review, 8 cổng pass, đệm giọng theo content_hash, export sau khi duyệt', async () => {
  const t = tmpDb(); delete process.env.GS_FAKE_FAIL;
  try {
    const b = basics(t.write, t.db);
    const ctx = mkctx(t);
    const r = await submitAndRun(t, ctx, b);
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.ok(r.manifest && r.manifest.plan && r.manifest.lines);
    assert.ok(r.outputs.mp4 && r.outputs.srt_vi && r.outputs.cover && r.outputs.mix);
    const gates = t.db.all("SELECT gate, result FROM gate_results WHERE subject_kind='render' AND subject_id=?", r.id);
    assert.equal(gates.length, 8); assert.ok(gates.every(g => g.result === 'pass'), JSON.stringify(gates));
    assert.deepEqual(gates.map(g => g.gate).sort(), ['G-FRAMES', 'G-LOUD', 'G-MOTION', 'G-MUX', 'G-PRON', 'G-SCRIPT', 'G-SYNC', 'G-WAV']);
    const clips = t.db.all('SELECT * FROM voice_clips');
    assert.equal(clips.length, 2); assert.ok(clips.every(c => c.word_times && c.envelope && c.raw_asset_id && c.asset_id));
    assert.equal(t.db.all("SELECT * FROM gate_results WHERE subject_kind='voice_clip'").length, 6);
    // bài thứ hai cùng lời → dùng lại giọng, không tạo clip mới
    const l2 = lessonBody(b, { title: 'Bài thử 2' });
    const r2 = await submitAndRun(t, ctx, b, l2);
    assert.equal(r2.state, 'awaiting_review');
    assert.equal(t.db.all('SELECT * FROM voice_clips').length, 2, 'đệm theo content_hash');
    // duyệt (chỉ qua state.review) rồi export
    const u = t.db.get('SELECT id FROM users LIMIT 1');
    state.review(t.db, { user: { id: u.id, role: 'owner' }, renderId: r2.id, decision: 'approved', notes: [], reviewSeconds: 5, entry: 'ui' });
    const ex = pipeline.exportRender(ctx, t.db.get('SELECT * FROM renders WHERE id=?', r2.id));
    assert.ok(ex.files.includes(r2.display_id + '.mp4') && ex.files.includes(r2.display_id + '.vi.srt') && ex.files.includes('manifest.json'));
    assert.ok(fs.existsSync(path.join(ex.dir, r2.display_id + '.mp4')));
    assert.throws(() => pipeline.exportRender(ctx, t.db.get('SELECT * FROM renders WHERE id=?', r.id)), e => e.code === 'conflict');
  } finally { t.clean(); }
});

test('d-pipeline: G-PRON fail → tạo lại ≤2 lần → blocked + WO gỡ chặn', async () => {
  const t = tmpDb();
  process.env.GS_FAKE_FAIL = 'pron';
  try {
    const b = basics(t.write, t.db);
    const ctx = mkctx(t);
    const r = await submitAndRun(t, ctx, b);
    assert.equal(r.state, 'blocked');
    assert.equal(r.blocked_reason.code, 'gate_fail'); assert.match(r.blocked_reason.text_human, /G-PRON/);
    const fails = t.db.all("SELECT * FROM gate_results WHERE subject_kind='render' AND gate='G-PRON' AND result='fail'");
    assert.equal(fails.length, 3, '1 lần đầu + 2 lần tạo lại');
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM work_orders WHERE kind='unblock'").n, 1);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM voice_clips').n, 1, 'chỉ câu không có thuật ngữ được lưu; câu trượt G-PRON không lưu clip');
    const run = t.db.get("SELECT state, error FROM runs WHERE render_id=?", r.id);
    assert.equal(run.state, 'failed');
  } finally { delete process.env.GS_FAKE_FAIL; t.clean(); }
});

test('d-pipeline: ProviderError quota → waiting_quota có waiting_until, run waiting_quota', async () => {
  const t = tmpDb();
  process.env.GS_FAKE_FAIL = 'quota';
  try {
    const b = basics(t.write, t.db);
    const ctx = mkctx(t);
    const r = await submitAndRun(t, ctx, b);
    assert.equal(r.state, 'waiting_quota');
    assert.ok(Date.parse(r.waiting_until) > Date.now());
    const run = t.db.get('SELECT state, waiting_until FROM runs WHERE render_id=?', r.id);
    assert.equal(run.state, 'waiting_quota'); assert.equal(run.waiting_until, r.waiting_until);
    // hết hạn chờ → lease nhặt lại và chạy tiếp tới xong
    delete process.env.GS_FAKE_FAIL;
    t.db.run("UPDATE runs SET waiting_until=? WHERE render_id=?", new Date(Date.now() - 1000).toISOString(), r.id);
    const w = pipeline.startWorkers(ctx, { pollMs: 20 });
    try { await w.idle(60000); } finally { w.stop(); }
    assert.equal(t.db.get('SELECT state FROM renders WHERE id=?', r.id).state, 'awaiting_review');
  } finally { delete process.env.GS_FAKE_FAIL; t.clean(); }
});

test('d-pipeline: bài mới khi render cũ chưa duyệt → render cũ superseded, worker bỏ qua', async () => {
  const t = tmpDb(); delete process.env.GS_FAKE_FAIL;
  try {
    const b = basics(t.write, t.db);
    const ctx = mkctx(t);
    const first = t.write(b.o, 'lesson.submit', lessonBody(b));
    t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: first.lesson.display_id, title: 'Sửa' }));
    const w = pipeline.startWorkers(ctx, { pollMs: 20 });
    try { await w.idle(60000); } finally { w.stop(); }
    assert.equal(t.db.get('SELECT state FROM renders WHERE display_id=?', first.render.display_id).state, 'superseded');
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM renders WHERE state='awaiting_review'").n, 1);
  } finally { t.clean(); }
});
