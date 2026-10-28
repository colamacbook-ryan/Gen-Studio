// © 2026 Gen Labs — All rights reserved.
// Gói P0b — móc của pipeline (SPEC-0.2.0 §2.5, §5.5, §6.10, §13.2): ffmpegPath → renderPlan, plan v2 qua hook plan.input/plan.after, cổng theo loại bài (G-THUMB qua write.ext.gates),
// outputs.thumbs chỉ phương án đạt, thumb_fail, rights_missing trước khi dựng, brand_hash, approved_version, export.after + ảnh bìa theo phương án.
// Dựng hình/mix/ffmpeg là stub (ghi lại tham số); timeline THẬT; cổng giọng THẬT.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const pipeline = require('../server/pipeline.js');
const events = require('../server/events.js');
const { createWriter } = require('../server/write');
const { basics, lessonBody, owner } = require('./a-helpers');
const realGates = require('../media/gates/index.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>');

// module op giả làm gói T: ext thumbnail + cổng G-THUMB (kết quả điều khiển bằng biến) + hook plan.after + export.after
const T_MODULE = `
exports.register = (op, ctx) => {
  const st = global.__t = global.__t || { hookLog: [], exportLog: [], variants: [], gate: 'pass' };
  ctx.ext.lessonExt.register({ name: 'thumbnail', columns: ['thumbnail'] });
  ctx.ext.hooks.on('plan.input', ({ input }) => { st.hookLog.push('input:' + input.kind); input.persona = { 'CM-0001': { role: 'host_lead' } }; });
  ctx.ext.hooks.on('plan.after', ({ B, plan }) => { st.hookLog.push('after:' + plan.kind); if (B.lv.thumbnail) plan.thumbs = B.lv.thumbnail.variants; });
  ctx.ext.hooks.on('export.after', (e) => st.exportLog.push({ actor: e.actor && e.actor.type, entry: e.entry, files: e.files }));
  if (st.gate !== 'none') ctx.ext.gates.register('G-THUMB', async () => ({ gate: 'G-THUMB', result: st.gate, measure: { variants: st.variants } }));
};`;

function env({ tModule = T_MODULE, config = {}, t = {} } = {}) {
  global.__t = Object.assign({ hookLog: [], exportLog: [], variants: [], gate: 'pass' }, t);   // trạng thái module T giả, đặt TRƯỚC khi nạp op
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-p0b-'));
  const opsDir = path.join(dir, 'ops'); fs.mkdirSync(opsDir);
  if (tModule) fs.writeFileSync(path.join(opsDir, 't.js'), tModule);
  const db = dbm.open(path.join(dir, 'data'), { masterKey: 'a'.repeat(64) });
  const write = createWriter(db, { opsDirs: [opsDir] });
  const calls = { renderPlan: [] };
  const deps = {
    render: { async renderPlan(o) {
      calls.renderPlan.push({ ffmpegPath: o.ffmpegPath, assetRoot: o.assetRoot, thumbs: o.plan.thumbs, assetRefs: o.plan.assetRefs, brand: o.plan.style.brand, kind: o.plan.kind, persona: o.plan.persona, cast: o.plan.cast });
      fs.mkdirSync(o.outDir, { recursive: true });
      const cover = path.join(o.outDir, 'cover.png'); fs.writeFileSync(cover, PNG);
      const thumbs = (o.plan.thumbs || []).map((s, i) => { const a = path.join(o.outDir, `t${i}.1280.jpg`), b = path.join(o.outDir, `t${i}.1920.jpg`); fs.writeFileSync(a, Buffer.concat([JPG, Buffer.from([i])])); fs.writeFileSync(b, Buffer.concat([JPG, Buffer.from([i, i])])); return { index: i, spec: s, measures: {}, jpg1280: a, jpg1920: b }; });
      return { framesPattern: path.join(o.outDir, 'f%05d.png'), frames: Math.ceil(o.plan.duration_ms / 1000 * 30), fps: 30, errors: [], sfx: {}, cover, thumbs };
    } },
    mix: { async mix({ out }) { fs.writeFileSync(out, 'RIFFfake-mix'); return out; }, async mux({ out }) { fs.writeFileSync(out, 'fake-mp4'); return out; } },
    gates: { gateWavB: async () => ({ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }), voiceGates: realGates.voiceGates, tailSig: realGates.tailSig, summarize: realGates.summarize,
      async renderGates() { return ['G-LOUD', 'G-SYNC', 'G-MOTION', 'G-FRAMES', 'G-MUX'].map(g => ({ gate: g, result: 'pass', measure: {} })).concat([{ gate: 'G-WAV', result: 'pass', measure: { tier: 'b' } }]); } },
  };
  const ctx = { db, write, events: events.create(), config: Object.assign({ dataDir: path.join(dir, 'data'), fakeProviders: true, ffmpegPath: 'ffmpeg-test', chromiumPath: null, version: 'test' }, config), deps, pipelineOpts: { backoffMs: 1 } };
  return { dir, db, write, ctx, calls, clean: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); delete global.__t; } };
}
async function run(e, body) {
  const r = e.write(owner(e.db), 'lesson.submit', body);
  const w = pipeline.startWorkers(e.ctx, { pollMs: 20 });
  try { await w.idle(60000); } finally { w.stop(); }
  return e.db.json(e.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id));
}
const gateRows = (e, r) => e.db.all("SELECT gate, result FROM gate_results WHERE subject_kind='render' AND subject_id=? ORDER BY rowid", r.id);
const THUMBS = { thumbnail: { variants: [{ template: 'a', headline: 'Một' }, { template: 'b', headline: 'Hai' }] } };

test('pipeline: ffmpegPath đi vào renderPlan; plan v2 (kind, brand null, persona do hook); không thumbnail ⇒ 8 cổng, cover.jpg kiểu cũ, không outputs.thumbs', async () => {
  const e = env(); const st = global.__t;
  try {
    const b = basics(e.write, e.db);
    const r = await run(e, lessonBody(b));
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.equal(e.calls.renderPlan[0].ffmpegPath, 'ffmpeg-test');
    assert.equal(e.calls.renderPlan[0].kind, 'lesson'); assert.equal(e.calls.renderPlan[0].brand, null);
    assert.deepEqual(e.calls.renderPlan[0].persona, { 'CM-0001': { role: 'host_lead' } }, 'hook plan.input sửa được input buildPlan');
    assert.deepEqual(st.hookLog, ['input:lesson', 'after:lesson']);
    assert.deepEqual(gateRows(e, r).map(g => g.gate), realGates.gatesFor('lesson', {}));
    assert.equal(r.outputs.thumbs, undefined); assert.ok(r.outputs.cover);
    assert.equal(r.manifest.brand_hash, undefined, 'kênh không brand ⇒ manifest không đổi so với 0.1.x'); assert.equal(r.manifest.kind, undefined);
    assert.match(r.awaiting_review_at, /^\d{4}-/);
  } finally { e.clean(); }
});

test('pipeline: bài có thumbnail ⇒ 9 cổng; CHỈ phương án đạt thành asset; outputs.thumbs + awaiting_review; export chọn bìa theo score/pick + hook export.after (CNS-119)', async () => {
  const e = env({ t: { variants: [{ index: 0, pass: false, score: 0.2 }, { index: 1, pass: true, score: 0.9 }] } }); const st = global.__t;
  try {
    const b = basics(e.write, e.db);
    const r = await run(e, lessonBody(b, THUMBS));
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.deepEqual(gateRows(e, r).map(g => g.gate), realGates.gatesFor('lesson', THUMBS).slice(0, 9)); assert.equal(gateRows(e, r).length, 9);
    assert.equal(gateRows(e, r).at(-1).gate, 'G-THUMB');
    assert.equal(r.outputs.thumbs.length, 1, 'phương án trượt bị bỏ');
    assert.equal(r.outputs.thumbs[0].variant, 1); assert.equal(r.outputs.thumbs[0].score, 0.9); assert.equal(r.outputs.thumbs[0].pass, true);
    assert.ok(r.outputs.mp4 && r.outputs.srt_vi && r.outputs.cover, 'gộp dần: thumbs không làm mất các output cũ');
    assert.match(r.outputs.thumbs[0].w1280, /^AS-/);
    assert.equal(e.db.get("SELECT COUNT(*) AS n FROM assets WHERE json_extract(meta,'$.role')='thumb'").n, 2, 'chỉ 1280 + 1920 của phương án đạt');
    assert.throws(() => e.db.run('UPDATE renders SET outputs=? WHERE id=?', '{}', r.id), /bất biến/);
    assert.equal(e.calls.renderPlan[0].thumbs.length, 2, 'plan.thumbs do hook plan.after đặt');
    // API: gates + media.thumbs theo loại bài
    const api = require('../server/api.js');
    const view = api.renderView(e.db, r);
    assert.equal(view.gates.length, 9); assert.match(view.media.thumbs[0].w1280, /^\/media\/AS-/); assert.equal(view.render.kind, 'lesson');
    // duyệt → xuất: ảnh bìa = phương án đạt có score cao nhất, 1280 + 1920; hook export.after nhận người xuất
    const u = e.db.get('SELECT id FROM users LIMIT 1');
    require('../server/state.js').review(e.db, { user: { id: u.id, role: 'owner' }, renderId: r.id, decision: 'approved', notes: [], reviewSeconds: 1, entry: 'ui' });
    const ex = pipeline.exportRender(e.ctx, e.db.get('SELECT * FROM renders WHERE id=?', r.id), { actor: owner(e.db), entry: 'ui' });
    assert.ok(ex.files.includes(r.display_id + '.cover.jpg') && ex.files.includes(r.display_id + '.cover-1920.jpg') && !ex.files.some(f => /cover\.png/.test(f)));
    assert.deepEqual(st.exportLog.map(x => [x.actor, x.entry]), [['user', 'ui']]);
    pipeline.exportRender(e.ctx, e.db.get('SELECT * FROM renders WHERE id=?', r.id), { actor: { type: 'agent' }, entry: 'mcp' });
    assert.deepEqual(st.exportLog.map(x => x.entry), ['ui', 'mcp'], 'hook phân biệt owner UI và agent MCP');
  } finally { e.clean(); }
});

test('pipeline: cả bộ ảnh bìa trượt ⇒ blocked thumb_fail kèm số đo; thiếu cài đặt G-THUMB ⇒ unknown ⇒ chặn (INT-08)', async () => {
  let e = env({ t: { variants: [{ index: 0, pass: false, score: 0.1 }, { index: 1, pass: false, score: 0.2 }], gate: 'fail' } });
  try {
    const r = await run(e, lessonBody(basics(e.write, e.db), THUMBS));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'thumb_fail');
    assert.equal(r.blocked_reason.detail.gates[0].measure.variants.length, 2, 'kèm số đo từng phương án');
    assert.equal(e.db.get("SELECT COUNT(*) AS n FROM assets WHERE json_extract(meta,'$.role')='thumb'").n, 0, 'không có asset ảnh bìa');
    assert.equal(e.db.get("SELECT COUNT(*) AS n FROM work_orders WHERE kind='unblock'").n, 1, 'WO gỡ chặn cho agent');
  } finally { e.clean(); }
  e = env({ t: { gate: 'none' } });   // 'none' ⇒ module không đăng ký G-THUMB
  try {
    const r = await run(e, lessonBody(basics(e.write, e.db), THUMBS));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'gate_unknown'); assert.match(r.blocked_reason.text_human, /G-THUMB/);
  } finally { e.clean(); }
});

test('pipeline: rights_missing — raster do agent tải lên chặn TRƯỚC khi dựng; owner xác nhận ⇒ chạy tiếp; SVG không cần', async () => {
  const e = env({ tModule: null });
  try {
    const b = basics(e.write, e.db);
    const agentA = { type: 'agent', id: 'AG-X', scopes: ['compose'], entry: 'mcp' };
    const png = e.write(agentA, 'asset.put', { kind: 'image', mime: 'image/png', bytes: PNG });
    const beat = (asset) => ({ block: 'illustration', anchor: { line: 0, word: 'chào' }, params: { asset } });
    let r = await run(e, lessonBody(b, { beats: [beat(png.display_id)] }));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'rights_missing');
    assert.deepEqual(r.blocked_reason.detail.assets, [png.display_id]); assert.match(r.blocked_reason.text_human, /xác nhận quyền/);
    assert.equal(e.calls.renderPlan.length, 0, 'không đốt công dựng');
    // owner xác nhận (op asset.attest của gói U; ở đây ghi hàng như op đó sẽ ghi) ⇒ chạy lại
    const asset = e.db.get('SELECT id FROM assets WHERE display_id=?', png.display_id);
    e.db.insertRow('asset_rights', { asset_id: asset.id, action: 'attest', basis: 'owner_responsibility', pii_redacted: 1, by: owner(e.db).id, at: e.db.now() });
    pipeline.requeueRender(e.ctx, r, { actor: owner(e.db) });
    const w = pipeline.startWorkers(e.ctx, { pollMs: 20 }); try { await w.idle(60000); } finally { w.stop(); }
    r = e.db.json(e.db.get('SELECT * FROM renders WHERE id=?', r.id));
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.ok(e.calls.renderPlan[0].assetRefs.some(a => /^media\//.test(a.asset) && /illustration/.test(a.label)), 'illustration vào plan.assetRefs');
    // SVG agent vẽ: không cần xác nhận
    const svg = e.write(agentA, 'asset.put', { kind: 'svg', mime: 'image/svg+xml', bytes: SVG });
    const r2 = await run(e, lessonBody(b, { title: 'B2', beats: [beat(svg.display_id)] }));
    assert.equal(r2.state, 'awaiting_review', JSON.stringify(r2.blocked_reason));
  } finally { e.clean(); }
});

test('pipeline: brand → plan.style.brand + manifest.brand_hash (đổi brand ⇒ đổi hash); nhân vật approved dùng approved_version', async () => {
  const e = env({ tModule: null });
  try {
    const b = basics(e.write, e.db);
    const o = owner(e.db);
    e.write(o, 'channel.update', { channel: b.ch.display_id, data: { brand: { tokens: { paper: '#FFFFFF' } } } });
    const r1 = await run(e, lessonBody(b));
    assert.equal(r1.state, 'awaiting_review', JSON.stringify(r1.blocked_reason));
    assert.match(r1.manifest.brand_hash, /^[0-9a-f]{16}$/); assert.deepEqual(e.calls.renderPlan[0].brand.tokens, { paper: '#FFFFFF' });
    e.write(o, 'channel.update', { channel: b.ch.display_id, data: { brand: { tokens: { paper: '#000000' } } } });
    const r2 = await run(e, lessonBody(b, { title: 'B2' }));
    assert.notEqual(r2.manifest.brand_hash, r1.manifest.brand_hash);
    // approved_version: v1 chốt, v2 là bản nháp mới ⇒ bản dựng dùng v1; chưa chốt ⇒ bản hiện hành
    const m = e.db.get('SELECT * FROM cast_members WHERE display_id=?', b.m1.display_id);
    e.write(o, 'cast.save', { id: b.m1.display_id, data: { look: { v: 2 } } });
    e.db.update('cast_members', m.id, { status: 'approved', approved_version: 1, approved_by: o.id, approved_at: e.db.now() });
    const r3 = await run(e, lessonBody(b, { title: 'B3' }));
    assert.equal(r3.manifest.cast[b.m1.display_id].version, 1, 'dùng approved_version');
    assert.equal(r3.manifest.cast[b.m2.display_id].version, 1);
    e.db.update('cast_members', m.id, { status: 'candidate' });
    const r4 = await run(e, lessonBody(b, { title: 'B4' }));
    assert.equal(r4.manifest.cast[b.m1.display_id].version, 2, 'chưa chốt ⇒ bản hiện hành (hành vi 0.1.x)');
  } finally { e.clean(); }
});

test('pipeline: kind tutorial chưa cài ⇒ PlanError tutorial_unsupported ⇒ blocked có chữ người đọc được (F4 bị cắt không làm sập)', async () => {
  const e = env({ tModule: `exports.register = (op, ctx) => { ctx.ext.lessonExt.register({ name: 'tutorial', columns: ['kind'], kinds: ['tutorial'] }); };` });
  try {
    const r = await run(e, lessonBody(basics(e.write, e.db), { kind: 'tutorial' }));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'tutorial_unsupported');
    assert.deepEqual(realGates.gatesFor('tutorial', {}).slice(-2), ['G-THUMB', 'G-CURSOR']);
  } finally { e.clean(); }
});
