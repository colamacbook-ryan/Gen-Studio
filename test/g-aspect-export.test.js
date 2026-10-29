// © 2026 Gen Labs — All rights reserved.
// Gói A1 (SPEC-0.2.0-F7 §3.2, §6.1, §7): pipeline truyền aspect ĐÃ PHÂN GIẢI vào buildPlan, manifest lấy aspect/size từ plan (+ safe_ref khi ≠ 16:9), size cho G-MUX, outputs.cover_frame_ms,
// gói xuất: tên tệp 16:9 GIỮ NGUYÊN, tỉ lệ khác chèn token; manifest.json có platforms[] (fit). Pipeline chạy với stub dựng hình/ffmpeg (như d-pipeline) — dựng 9:16 thật là việc của A2/A-INT.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { tmpDb, basics, lessonBody } = require('./a-helpers.js');
const pipeline = require('../server/pipeline.js');
const state = require('../server/state.js');
const events = require('../server/events.js');
const A = require('../render/aspects.js');
const realGates = require('../media/gates/index.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const SPY = { planInputs: [], muxSizes: [] };
function stubDeps() {
  return {
    timeline: { buildPlan(input) {
      SPY.planInputs.push({ aspect: input.aspect, kind: input.kind });
      const asp = input.aspect || '16:9', g = A.get(asp);
      let t = 500; const lines = input.lesson.lines.map((l) => { const a = t; t += input.clips[l.id].duration_ms; const o = { id: l.id, who: l.who, say: l.say, terms: l.terms, a_ms: a, b_ms: t }; t += 300; return o; });
      // khối tự thêm (không neo tác giả) lúc 2600 ms ⇒ khung bìa = min(duration − 1, 2600 + 1500)
      return Object.assign({ fps: 30, aspect: asp, size: g.size, duration_ms: t + 6000, lines, beats: [{ id: 'AUTO-title', block: 'title', t_in: 2600, t_anchor: 2600, t_out: 5000 }], camera: [], cues: [] },
        asp === '16:9' ? {} : { layout: { safe: g.safe } });
    } },
    render: { async renderPlan({ plan, outDir }) {
      fs.mkdirSync(outDir, { recursive: true });
      const cover = path.join(outDir, 'cover.png'); fs.writeFileSync(cover, PNG);
      const out = { framesPattern: path.join(outDir, 'f%05d.png'), frames: Math.ceil(plan.duration_ms / 1000 * 30), fps: 30, errors: [], sfx: {}, cover };
      // như renderPlan thật (gói A2): tỉ lệ không legacy ⇒ trả measures (G-SAFE đo) + cover_frame_ms; 16:9 không có hai khoá này
      if (plan.layout) Object.assign(out, { cover_frame_ms: A.coverFrameMs(plan), measures: { duration_s: plan.duration_ms / 1000, samples: [
        { t_ms: 1000, kind: 'line', line: plan.lines[0].id, els: [{ role: 'subtitle', line: plan.lines[0].id, box: [72, 860, 808, 144] }, { role: 'logo', box: [816, 300, 72, 72] }] }] } });
      return out;
    } },
    mix: { async mix({ out }) { fs.writeFileSync(out, 'RIFFfake-mix'); return out; }, async mux({ out }) { fs.writeFileSync(out, 'fake-mp4'); return out; } },
    gates: { gateWavB: async () => ({ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }), voiceGates: realGates.voiceGates, tailSig: realGates.tailSig, summarize: realGates.summarize,
      async renderGates(a) { SPY.muxSizes.push(a.size); return ['G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'].map((g) => ({ gate: g, result: 'pass', measure: {} })).concat([{ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }]); } },
  };
}
const mkctx = (t) => ({ db: t.db, write: t.write, events: events.create(), config: { dataDir: t.dir, fakeProviders: true, ffmpegPath: 'ffmpeg', chromiumPath: null, version: 'test' }, deps: stubDeps(), pipelineOpts: { backoffMs: 1 } });
async function submitAndRun(t, ctx, b, body) {
  const r = t.write(b.o, 'lesson.submit', body);
  const w = pipeline.startWorkers(ctx, { pollMs: 20 });
  try { await w.idle(60000); } finally { w.stop(); }
  return { sub: r, render: t.db.json(t.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id)) };
}
const approve = (t, id) => { const u = t.db.get('SELECT id FROM users LIMIT 1'); state.review(t.db, { user: { id: u.id, role: 'owner' }, renderId: id, decision: 'approved', notes: [], reviewSeconds: 5, entry: 'ui' }); return t.db.json(t.db.get('SELECT * FROM renders WHERE id=?', id)); };
const files = (dir) => fs.readdirSync(dir).sort();

test('pipeline 9:16: input.aspect = giá trị đã phân giải; manifest.aspect/size từ plan + safe_ref; size cho G-MUX; outputs.cover_frame_ms; 16:9 không có khoá mới', async () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), ctx = mkctx(t);
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const v = await submitAndRun(t, ctx, b, lessonBody(b, { beats: [], work_order: wo.display_id }));   // bài KHÔNG gửi aspect
    assert.equal(v.render.state, 'awaiting_review', JSON.stringify(v.render.blocked_reason));
    assert.deepEqual(SPY.planInputs.at(-1), { aspect: '9:16', kind: 'lesson' });
    assert.deepEqual(SPY.muxSizes.at(-1), [1080, 1920], 'G-MUX nhận plan.size');
    const m = v.render.manifest;
    assert.equal(m.aspect, '9:16'); assert.deepEqual(m.size, [1080, 1920]); assert.equal(m.safe_ref, 'vertical-v1');
    assert.equal(v.render.outputs.cover_frame_ms, 4100, 'min(duration − 1, beats[0].t_in + 1500)');
    assert.equal(A.coverFrameMs({ duration_ms: 3000, beats: [{ t_in: 2600 }] }), 2999);
    // 16:9: không safe_ref, không cover_frame_ms; aspect truyền '16:9' (bài cũ NULL cũng thế)
    const h = await submitAndRun(t, ctx, b, lessonBody(b, { title: 'Bài ngang', beats: [] }));
    assert.deepEqual(SPY.planInputs.at(-1), { aspect: '16:9', kind: 'lesson' });
    assert.equal(h.render.manifest.aspect, '16:9'); assert.deepEqual(h.render.manifest.size, [1920, 1080]);
    assert.ok(!('safe_ref' in h.render.manifest)); assert.ok(!('cover_frame_ms' in h.render.outputs));
    // bài cũ: lesson_versions.aspect NULL ⇒ cùng đường 16:9
    const trg = t.db.get("SELECT sql FROM sqlite_master WHERE name='tr_lv_immutable'").sql;
    t.db.raw.exec('DROP TRIGGER tr_lv_immutable'); t.db.run('UPDATE lesson_versions SET aspect=NULL WHERE id=?', t.db.get('SELECT lesson_version_id id FROM renders WHERE id=?', h.render.id).id); t.db.raw.exec(trg);
    const rq = pipeline.requeueRender(ctx, h.render, { actor: b.o });
    assert.ok(rq);
  } finally { t.clean(); }
});

test('buildManifest: lv.aspect thiếu / NULL / "16:9" ⇒ cùng manifest (không khoá mới); plan 9:16 ⇒ aspect/size/safe_ref', () => {
  const file = path.join(__dirname, '..', 'server', 'pipeline.js');
  const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file, 'utf8') + '\n;module.exports.__bm = buildManifest;\n', file);
  const bm = m.exports.__bm;
  const ctx = { config: { version: '0', chromiumPath: null, ffmpegPath: 'ffmpeg' }, _ffv: 'ff' };
  const mk = (lv, plan) => bm(ctx, { lesson: { display_id: 'LS-0001' }, lv: Object.assign({ version: 1, kind: 'lesson' }, lv), channel: { display_id: 'CH-0001', current_version: 1 }, lines: [], beats: [] }, [], plan, { vendor: 'x', model: 'y' }, { vendor: 'x', model: 'z' }, null, {});
  const plan = (o) => Object.assign({ fps: 30, size: [1920, 1080], duration_ms: 1000, lines: [], beats: [], cues: [], camera: [] }, o);
  const strip = (x) => JSON.stringify(Object.assign({}, x, { engine: undefined }));
  const base = strip(mk({}, plan({ aspect: '16:9' })));
  for (const lv of [{}, { aspect: null }, { aspect: '16:9' }]) assert.equal(strip(mk(lv, plan())), base, JSON.stringify(lv));
  assert.equal(strip(mk({}, plan({ aspect: '16:9' }))), base);
  assert.ok(!base.includes('safe_ref'));
  const v = mk({ aspect: '9:16' }, plan({ aspect: '9:16', size: [1080, 1920] }));
  assert.equal(v.aspect, '9:16'); assert.deepEqual(v.size, [1080, 1920]); assert.equal(v.safe_ref, 'vertical-v1');
  assert.equal(mk({ aspect: '9:16' }, plan({ size: [1080, 1920] })).aspect, '9:16', 'plan cũ không có aspect ⇒ theo lv');
});

test('xuất gói: 16:9 giữ NGUYÊN tên cũ + manifest.json không thêm khoá; 9:16 chèn token + {aspect,size,duration_s,cover_frame_ms,platforms[]} (fit từ aspects.fit)', async () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), ctx = mkctx(t);
    // 16:9
    const h = await submitAndRun(t, ctx, b, lessonBody(b, { title: 'Ngang', beats: [] }));
    const hr = approve(t, h.render.id), hid = hr.display_id;
    const ex = pipeline.exportRender(ctx, hr);
    assert.deepEqual(files(ex.dir), [`${hid}.cover.png`, `${hid}.mp4`, `${hid}.vi.srt`, 'manifest.json'].sort(), 'tên cũ: không token');
    const mj = JSON.parse(fs.readFileSync(path.join(ex.dir, 'manifest.json'), 'utf8'));
    for (const k of ['aspect', 'size', 'duration_s', 'cover_frame_ms', 'platforms']) assert.ok(!(k in mj), 'gói 16:9 không thêm ' + k);
    assert.deepEqual(Object.keys(mj), ['render', 'lesson', 'title', 'version', 'manifest', 'gates', 'files', 'exported_at']);
    // 9:16 (lệnh của owner), có thêm srt_en do kênh khai 2 ngôn ngữ phụ đề
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const v = await submitAndRun(t, ctx, b, lessonBody(b, { title: 'Dọc', beats: [], work_order: wo.display_id }));
    const vr = approve(t, v.render.id), vid = vr.display_id;
    const ev = pipeline.exportRender(ctx, vr);
    assert.deepEqual(files(ev.dir), [`${vid}.9x16.cover.png`, `${vid}.9x16.mp4`, `${vid}.9x16.vi.srt`, 'manifest.json'].sort());
    const vm = JSON.parse(fs.readFileSync(path.join(ev.dir, 'manifest.json'), 'utf8'));
    assert.equal(vm.aspect, '9:16'); assert.deepEqual(vm.size, [1080, 1920]); assert.equal(vm.cover_frame_ms, 4100);
    assert.equal(vm.duration_s, Math.round(vr.duration_ms / 100) / 10);
    assert.deepEqual(vm.platforms.map((p) => p.preset), ['yt_shorts', 'fb_reels', 'tiktok']);
    assert.ok(vm.platforms.every((p) => p.fit === true), 'clip ngắn: vừa mọi nền tảng');
    const ys = vm.platforms[0];
    assert.deepEqual(ys, { preset: 'yt_shorts', fit: true, max_s: 180, cover: 'upload_desktop|frame', verified: true, source: 'https://support.google.com/youtube/answer/15424877' });
    assert.deepEqual(vm.platforms[2], { preset: 'tiktok', fit: true, max_s: 1800, cover: 'frame', verified: false, source: 'https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok' });
    assert.equal(vm.platforms[1].max_s, null);
    assert.equal(vm.manifest.aspect, '9:16'); assert.deepEqual(vm.files.slice().sort(), files(ev.dir).filter((f) => f !== 'manifest.json'));
  } finally { t.clean(); }
});

test('xuất gói 9:16: clip dài 200 s ⇒ yt_shorts fit=false (tiktok/reels vẫn fit); ảnh bìa theo phương án đặt tên có token (.cover.jpg / .cover-1920.jpg)', async () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), ctx = mkctx(t);
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const v = await submitAndRun(t, ctx, b, lessonBody(b, { beats: [], work_order: wo.display_id }));
    // phương án ảnh bìa đã qua cổng: thêm vào outputs khi còn ở pipeline là việc của pipeline; ở đây dựng hai asset JPEG rồi gắn thẳng (render chưa duyệt vẫn trong trạng thái cho phép UPDATE? không — dùng bản gating mới)
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 7)]);
    const SYS = { type: 'system', id: 'pipeline', entry: 'system' };
    const a1 = t.write(SYS, 'asset.put', { kind: 'cover', bytes: jpg, mime: 'image/jpeg', source: 'system' }), a2 = t.write(SYS, 'asset.put', { kind: 'cover', bytes: Buffer.concat([jpg, Buffer.from('x')]), mime: 'image/jpeg', source: 'system' });
    // chuyển render về gating giả lập: dựng một render mới đi từ queued (trigger outputs-once chỉ khoá sau khi rời pipeline)
    const wo2 = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const r2 = t.write(b.o, 'lesson.submit', lessonBody(b, { title: 'Dọc 2', beats: [], work_order: wo2.display_id }));
    const id = r2.render.id;
    const mp4 = t.write(SYS, 'asset.put', { kind: 'video', bytes: Buffer.from('mp4'), mime: 'video/mp4', source: 'system' });
    const srt = t.write(SYS, 'asset.put', { kind: 'subtitle', bytes: Buffer.from('1\n'), mime: 'application/x-subrip', source: 'system' });
    for (const s of ['voicing', 'judging', 'aligning']) state.transitionRender(t.db, id, s);
    state.transitionRender(t.db, id, 'rendering', { manifest: { aspect: '9:16', size: [1080, 1920], plan: { duration_ms: 200000 } } });
    state.transitionRender(t.db, id, 'mixing');
    state.transitionRender(t.db, id, 'gating', { outputs: { mp4: mp4.display_id, srt_vi: srt.display_id, cover_frame_ms: 2600 }, duration_ms: 200000 });
    state.transitionRender(t.db, id, 'awaiting_review', { outputs: { thumbs: [{ variant: 0, w1280: a1.display_id, w1920: a2.display_id, pass: true, score: 0.9 }] } });
    const r = approve(t, id), ex = pipeline.exportRender(ctx, r);
    assert.deepEqual(files(ex.dir), [`${r.display_id}.9x16.cover-1920.jpg`, `${r.display_id}.9x16.cover.jpg`, `${r.display_id}.9x16.mp4`, `${r.display_id}.9x16.vi.srt`, 'manifest.json'].sort());
    const mj = JSON.parse(fs.readFileSync(path.join(ex.dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(mj.platforms.map((p) => [p.preset, p.fit]), [['yt_shorts', false], ['fb_reels', true], ['tiktok', true]]);
    assert.equal(mj.duration_s, 200); assert.equal(mj.cover_frame_ms, 2600);
    void v;
  } finally { t.clean(); }
});
