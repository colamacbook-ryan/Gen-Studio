// © 2026 Gen Labs — All rights reserved.
// Sửa finding review G-BE gói tỉ lệ khung (F7): (1) render_still mode thumb mẫu dọc tự lấy 9:16 · (2) route preview mặc định theo spec.template.aspect · (3) schedule.mix per_run > 20 bị từ chối ·
// (4) chromium.close() lần hai sau 'exit' vẫn resolve; renderPlan quá hạn không đặt lại đồng hồ treo · (5) render_still gỡ size/layout agent gửi · (6) aspect_mismatch ở update_lesson (test ở g-aspect-data / h-aspect-contract).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auth = require('../server/auth.js');
const { createMcp } = require('../server/mcp.js');
const T = require('../render/thumb.js');
const G = require('../media/gates/thumb.js');
const still = require('../render/still');
const chromium = require('../render/chromium');
const cast = require('../render/cast');
const A = require('../render/aspects.js');
const { tmpDb, basics, owner } = require('./a-helpers');
const H = require('./g-thumb-helpers');

const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
function mcpKit(deps) {
  const t = tmpDb(), b = basics(t.write, t.db);
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't', dataDir: t.dir, ffmpegPath: H.FFMPEG || 'ffmpeg', chromiumPath: null }, deps });
  const mk = (scopes) => auth.verifyAgentToken(t.db, t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }).token);
  const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result;
  return { t, b, mk, call };
}
const stub = (seen) => ({ async renderStill(o) { seen.push(o); return { buffer: Buffer.from('\xff\xd8\xffX', 'latin1'), measures: {}, errors: [], elapsed_ms: 1 }; } });

test('1. render_still mode thumb: mẫu dọc không kèm aspect ⇒ 9:16 (không rơi về 16:9); agent gửi aspect / plan.aspect thắng; mẫu 16:9 và mode khác giữ 16:9', async () => {
  const seen = [], k = mcpKit({ still: stub(seen) });
  try {
    const c = k.mk(['compose']), vt = T.template('v-host-top');
    assert.equal(vt.aspect, '9:16');
    const r = await k.call(c, 'render_still', { mode: 'thumb', payload: { template: vt, headline: 'x' } });
    assert.ok(!r.isError, r.content[0].text);
    assert.equal(seen.at(-1).aspect, '9:16'); assert.deepEqual(seen.at(-1).size, [720, 1280]); assert.equal(r.structuredContent.aspect, '9:16');
    await k.call(c, 'render_still', { mode: 'thumb', payload: { template: vt }, size: [1080, 1920] });
    assert.deepEqual([seen.at(-1).aspect, seen.at(-1).size], ['9:16', [1080, 1920]]);
    await k.call(c, 'render_still', { mode: 'thumb', payload: { template: T.template('big-visual') } });
    assert.deepEqual([seen.at(-1).aspect, seen.at(-1).size], ['16:9', [1280, 720]]);
    await k.call(c, 'render_still', { mode: 'cast', payload: { template: vt } });
    assert.equal(seen.at(-1).aspect, '16:9', 'chỉ mode thumb đọc template.aspect');
    await k.call(c, 'render_still', { mode: 'thumb', payload: { template: vt }, aspect: '16:9' });
    assert.equal(seen.at(-1).aspect, '16:9', 'agent gửi aspect thắng');
    await k.call(c, 'render_still', { mode: 'thumb', payload: { template: T.template('big-visual'), plan: { aspect: '9:16' } } });
    assert.equal(seen.at(-1).aspect, '9:16', 'plan.aspect đứng trước template.aspect');
  } finally { k.t.clean(); }
});

test('1b. render_still mode thumb mẫu v-host-top qua MCP dựng THẬT ra 1080×1920', { skip: H.NO_BROWSER_OR_FFMPEG, timeout: 180000 }, async () => {
  const k = mcpKit();
  try {
    const plan = H.fixturePlan(); plan.duration_ms = 600;
    const FACE = 'data:image/png;base64,' + H.ownerFacePng({ alpha: true }).toString('base64');
    const [spec] = T.resolveThumbs({ variants: [{ template: 'v-host-top', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, visual: { beat: 1 } }] }, plan,
      { beatOrder: H.BEAT_ORDER, faces: [{ asset: FACE, mood: 'shock' }], channelName: 'Lớp AI Bình Dân' });
    const c = k.mk(['compose']);
    const r = await k.call(c, 'render_still', { mode: 'thumb', payload: spec, size: [1080, 1920] });
    assert.ok(!r.isError, r.content[0].text);
    assert.equal(r.structuredContent.aspect, '9:16'); assert.deepEqual(G.jpegSize(Buffer.from(r.content[1].data, 'base64')), [1080, 1920]);
    assert.deepEqual(r.structuredContent.measures.size, [1080, 1920]); assert.deepEqual(r.structuredContent.errors, []);
  } finally { await still.closeStill(); k.t.clean(); }
});

test('2. route /api/preview/still mode=thumb: mặc định tỉ lệ theo spec.template.aspect (spec.aspect không tồn tại) ⇒ mẫu dọc ra JPEG 9:16', { skip: H.NO_BROWSER_OR_FFMPEG, timeout: 180000 }, async () => {
  const { bootTmp, request, setupOwner } = require('./d-helpers.js');
  const t = await bootTmp();
  try {
    const s = await setupOwner(t.app, t.base), { write, db } = t.app.ctx;
    const o = db.json(db.get("SELECT id FROM users WHERE username='owner'")), ow = { type: 'user', id: o.id, role: 'owner', entry: 'ui' }, hosts = cast.samples();
    const ch = write(ow, 'channel.create', { name: 'K' });
    const m1 = write(ow, 'cast.save', { channel: ch.display_id, name: 'A', data: hosts[0] }), m2 = write(ow, 'cast.save', { channel: ch.display_id, name: 'B', data: hosts[1] });
    const v = (template, headline) => ({ template, headline, face: { cast: m1.display_id, mood: 'shock' }, visual: { beat: 0 } });
    const sub = write(ow, 'lesson.submit', { channel: ch.display_id, title: 'T', thumbnail: { variants: [v('big-visual', 'Chào bạn'), v('duo-versus', 'Đoán chữ')] },
      lines: [{ who: m2.display_id, say: 'Sao vậy ạ?' }], beats: [{ block: 'title', anchor: { line: 0, word: 'Sao' }, params: { text: 'Hi' } }] });
    const post = (body) => request(t.base, 'POST', '/api/preview/still', { cookie: s.cookie, csrf: s.csrf, origin: t.base, body: Object.assign({ mode: 'thumb', lesson: sub.lesson.display_id, w: 480 }, body) });
    const p = await post({ spec: v('v-host-top', 'Nháp dọc') });
    assert.equal(p.status, 200, (p.text || '').slice(0, 400) + ' | ' + String(p.buf).slice(0, 400)); assert.deepEqual(G.jpegSize(p.buf), [480, 853]);
    const p2 = await post({ spec: v('big-visual', 'Nháp ngang') });
    assert.equal(p2.status, 200); assert.deepEqual(G.jpegSize(p2.buf), [480, 270]);
  } finally { await still.closeStill(); await t.clean(); }
});

test('3. schedule.mix với per_run > 20 ⇒ schedule_per_run_max (tiếng Việt); per_run = 20 hợp lệ; không mix thì per_run lớn không bị chặn ở đây', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), ch = b.ch.display_id;
    const upd = (schedule) => t.write(b.o, 'channel.update', { channel: ch, data: { schedule } });
    assert.throws(() => upd({ time: '06:00', per_run: 21, mix: [{ aspect: '9:16', n: 1 }, { aspect: '16:9', n: 20 }] }), (e) => code('schedule_per_run_max')(e) && /per_run tối đa 20/.test(e.text_human));
    assert.throws(() => upd({ time: '06:00', per_run: 100, mix: [{ aspect: '9:16', n: 100 }] }), code('schedule_per_run_max'));
    assert.ok(upd({ time: '06:00', per_run: 20, mix: [{ aspect: '9:16', n: 5 }, { aspect: '16:9', n: 15 }] }).version >= 2);
  } finally { t.clean(); }
});

test('4a. chromium.close(): gọi lần hai SAU sự kiện exit vẫn resolve (kể cả bị tín hiệu: exitCode null, signalCode đặt)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-fakechrome-'));
  const bin = path.join(dir, 'chrome');
  fs.writeFileSync(bin, '#!/bin/sh\necho "DevTools listening on ws://127.0.0.1:1/devtools/browser/x" >&2\nexec sleep 30\n', { mode: 0o755 });
  try {
    const ch = await chromium.launch({ path: bin });
    await ch.close();
    await new Promise((r) => setTimeout(r, 100));   // exit đã phát xong
    const t = setTimeout(() => assert.fail('close() lần hai treo'), 3000);
    await ch.close(); clearTimeout(t);
    // chủ động: tiến trình tự chết (exit 0) rồi close()
    fs.writeFileSync(bin, '#!/bin/sh\necho "DevTools listening on ws://127.0.0.1:1/devtools/browser/x" >&2\nsleep 0.2\n', { mode: 0o755 });
    const c2 = await chromium.launch({ path: bin });
    await new Promise((r) => setTimeout(r, 800));
    await Promise.race([c2.close(), new Promise((_, rej) => setTimeout(() => rej(new Error('close() sau exit tự nhiên treo')), 3000))]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('4b. renderPlan quá hạn tổng: render_timeout, đồng hồ treo không được đặt lại sau khi đã quá hạn (không còn timer treo giữ tiến trình)', { skip: H.NO_CHROMIUM, timeout: 60000 }, async () => {
  const { renderPlan } = require('../render/render');
  const plan = H.fixturePlan(); plan.duration_ms = 600;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-rp-'));
  try {
    await assert.rejects(renderPlan({ plan, outDir: dir, assetRoot: dir, deadlineMs: 30, stallMs: 400 }), { code: 'render_timeout' });
    await new Promise((r) => setTimeout(r, 900));   // quá stallMs: nếu alive() còn đặt lại đồng hồ thì kill() chạy lần hai (không lỗi, nhưng timer rò) — chốt hợp đồng: không ném unhandled
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('5. render_still gỡ size/layout agent gửi (payload và payload.plan) rồi lấy lại từ aspects.get(aspect); 16:9 legacy không thêm gì', async () => {
  const seen = [], k = mcpKit({ still: stub(seen) });
  try {
    const c = k.mk(['compose']), vert = A.get('9:16');
    const evil = { size: [1e9, 1e9], layout: { subtitle: { top: -1e9 }, evil: true } };
    // brand dọc: size/layout lấy từ aspects.json
    await k.call(c, 'render_still', { mode: 'brand', aspect: '9:16', payload: Object.assign({ view: 'thumb' }, evil) });
    let p = seen.at(-1).payload;
    assert.deepEqual(p.size, vert.size); assert.deepEqual(p.layout, Object.assign({}, vert.layout, { safe: vert.safe })); assert.equal(p.aspect, '9:16');
    // brand 16:9: gỡ sạch, không thêm
    await k.call(c, 'render_still', { mode: 'brand', payload: Object.assign({ view: 'thumb' }, evil) });
    p = seen.at(-1).payload; assert.equal(p.size, undefined); assert.equal(p.layout, undefined);
    // frame: payload.plan.size/layout
    await k.call(c, 'render_still', { mode: 'frame', payload: { plan: Object.assign({ aspect: '9:16', duration_ms: 1 }, evil), t_ms: 0, size: [1e9, 1e9] } });
    p = seen.at(-1).payload; assert.equal(p.size, undefined);
    assert.deepEqual(p.plan.size, vert.size); assert.deepEqual(p.plan.layout, Object.assign({}, vert.layout, { safe: vert.safe }));
    await k.call(c, 'render_still', { mode: 'frame', payload: { plan: Object.assign({ duration_ms: 1 }, evil), t_ms: 0 } });
    p = seen.at(-1).payload.plan; assert.equal(p.size, undefined); assert.equal(p.layout, undefined);
    // size ngoài cạnh tool vẫn bị từ chối như cũ
    const r = await k.call(c, 'render_still', { mode: 'cast', size: [1e9, 1e9] });
    assert.ok(r.isError && /size phải là/.test(r.content[0].text));
    // cast 'solo' (chuỗi hợp lệ) còn nguyên
    await k.call(c, 'render_still', { mode: 'cast', payload: { layout: 'solo' } });
    assert.equal(seen.at(-1).payload.layout, 'solo');
  } finally { k.t.clean(); }
});
