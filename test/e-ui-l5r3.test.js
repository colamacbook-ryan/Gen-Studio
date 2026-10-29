// © 2026 Gen Labs — All rights reserved.
// UI-L5R3 (SPEC-0.2.0 §6.10/§6.12/§13.2, F7 §10.5): Danh sách — móc tab Kênh (channel-tabs/*.js), tab Định dạng (default_aspect, schedule.mix),
// tỉ lệ trong form lệnh/kênh, Quyền dùng asset (xác nhận/thu hồi, chỉ owner) + route đọc kênh GET /api/channels/:id.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { bootTmp, setupOwner, ui, request } = require('./d-helpers.js');

const ROOT = path.join(__dirname, '..');
const STUDIO = path.join(ROOT, 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FIX = JSON.parse(read('test/fixtures/api-aspects.json'));

test('i18n lists: vi/en cùng bộ khoá, không trùng module khác; đủ chữ cho cơ sở quyền, trạng thái quyền, loại lệnh', async () => {
  const m = await load('i18n/lists.js');
  const idx = await load('i18n/index.js');
  const L = await load('views/lists.js');
  assert.deepEqual(Object.keys(m.vi).sort(), Object.keys(m.en).sort());
  for (const [name, mod] of [...Object.entries(idx.MODULES), ...Object.entries(idx.SHARED)]) {
    if (name === 'lists') continue;
    for (const k of Object.keys(mod.vi)) assert.ok(!(k in m.vi), `khoá "${k}" trùng giữa lists và ${name}`);
  }
  for (const b of L.ATTEST_BASIS) { assert.ok('rights.basis.' + b in m.vi); assert.ok('rights.basis.' + b + '.hint' in m.vi); }
  for (const s of ['attested', 'pending', 'exempt']) { assert.ok('rights.st.' + s in m.vi); assert.ok('rights.st.' + s + '.hint' in m.vi); }
  for (const k of ['new_lesson', 'revise', 'unblock', 'manual']) assert.ok('kind.' + k in m.vi, k);
  for (const k of ['col.aspect', 'col.default_aspect', 'col.rights']) assert.ok(k in m.vi, k);
  // cơ sở quyền khớp server (ops/tutorial.js BASIS)
  assert.deepEqual(L.ATTEST_BASIS, require('../server/ops/tutorial.js').BASIS);
});

test('móc tab Kênh: CHANNEL_TABS có format + brand; thiếu file / không export tab / tên lạ ⇒ bỏ qua, không ném', async () => {
  const L = await load('views/lists.js');
  assert.deepEqual(L.CHANNEL_TABS, ['format', 'brand']);
  const calls = [];
  const importer = (n) => { calls.push(n); return n === 'ok' ? Promise.resolve({ tab: () => ({ key: 'ok' }) }) : n === 'notab' ? Promise.resolve({ x: 1 }) : Promise.reject(new Error('404')); };
  const got = await L.loadChannelTabs(['ok', 'missing', 'notab', '../evil', 'Bad'], importer);
  assert.deepEqual(got.map((x) => x.name), ['ok']);
  assert.deepEqual(calls, ['ok', 'missing', 'notab'], 'tên ngoài [a-z0-9-] không bao giờ được nạp');
  const fmt = await load('views/channel-tabs/format.js');
  const tb = fmt.tab({ channel: { display_id: 'CH-0001', data: {} }, isOwner: true, save: async () => {} });
  assert.equal(tb.key, 'format'); assert.equal(typeof tb.mount, 'function'); assert.equal(typeof tb.label, 'string');
  assert.match(read('studio/views/lists.js'), /import\('\.\/channel-tabs\/' \+ n \+ '\.js'\)/);
});

test('tab Định dạng: trạng thái từ dữ liệu kênh, bản vá giữ khoá lịch khác, tắt trộn ⇒ bỏ mix, giờ chạy từ cron', async () => {
  const f = await load('views/channel-tabs/format.js');
  const s0 = f.formatState({ schedule: { cron: '0 6 * * *', per_run: 1 } }, FIX);
  assert.deepEqual(s0, { default_aspect: '16:9', per_run: 1, mixOn: false, counts: { '16:9': 1, '9:16': 0 }, time: '06:00' });
  const s1 = f.formatState({ default_aspect: '9:16', schedule: { time: '07:30', per_run: 3, mix: [{ aspect: '16:9', n: 1 }, { aspect: '9:16', n: 2 }] } }, FIX);
  assert.deepEqual(s1, { default_aspect: '9:16', per_run: 3, mixOn: true, counts: { '16:9': 1, '9:16': 2 }, time: '07:30' });
  assert.equal(f.formatState({ aspect: '9:16' }, FIX).default_aspect, '9:16', 'khoá cũ `aspect` là bí danh đọc');
  assert.equal(f.formatState({ schedule: { per_run: 99 } }, FIX).per_run, 20, 'per_run tối đa 20 như scheduler');
  const prev = { cron: '0 6 * * *', per_run: 3, text: 'x', mix: [{ aspect: '9:16', n: 3 }] };
  assert.deepEqual(f.formatPatch(s1, prev, ['16:9', '9:16']), { default_aspect: '9:16', schedule: { cron: '0 6 * * *', per_run: 3, text: 'x', mix: [{ aspect: '16:9', n: 1 }, { aspect: '9:16', n: 2 }] } });
  const off = Object.assign({}, s1, { mixOn: false });
  assert.ok(!('mix' in f.formatPatch(off, prev, ['16:9', '9:16']).schedule), 'tắt trộn ⇒ bỏ khoá mix (mọi lệnh theo mặc định kênh)');
  assert.equal(f.scheduleTime({ time: '6:05' }), '06:05'); assert.equal(f.scheduleTime({ cron: '30 23 * * *' }), '23:30'); assert.equal(f.scheduleTime({ cron: 'weekly' }), '');
  assert.equal(f.mixSentence([{ aspect: '16:9', n: 1 }, { aspect: '9:16', n: 2 }]), '1 bài 16:9 + 2 bài 9:16');
  // bản vá đi qua đúng kiểm của máy chủ (ops/aspect.js): Σn = per_run, tỉ lệ đang bật
  const src = read('studio/views/channel-tabs/format.js');
  assert.match(src, /env\.save\(formatPatch\(st, prevSchedule, order\)/);
  assert.ok(!/yt_shorts|tiktok|fb_reels/.test(src.replace(/\/\/.*$/gm, '')), 'preset đọc từ /api/aspects, không hardcode');
});

test('form lệnh: "Theo kênh" ⇒ không gửi aspect (work_orders.aspect NULL); chọn tỉ lệ ⇒ gửi aspect; xác nhận quyền: ảnh raster bắt tick che thông tin', async () => {
  const L = await load('views/lists.js');
  assert.deepEqual(L.woBody('ghi chú', 'CH-0001', null), { kind: 'manual', summary: 'ghi chú', channel: 'CH-0001' });
  assert.deepEqual(L.woBody('x', null, '9:16'), { kind: 'manual', summary: 'x', aspect: '9:16' });
  assert.deepEqual(L.attestBody('own_product', true, '', true), { basis: 'own_product', pii_redacted: true });
  assert.deepEqual(L.attestBody('licensed', false, 'giấy phép số 1', false), { basis: 'licensed', pii_redacted: false, note: 'giấy phép số 1' });
  assert.deepEqual(L.attestBody('own_product', false, '', true), { error: 'pii' });
  assert.deepEqual(L.attestBody('bừa', true, '', true), { error: 'basis' });
  assert.equal(L.isOwner({ me: { user: { role: 'owner' } } }), true);
  assert.equal(L.isOwner({ me: { user: { role: 'reviewer' } } }), false);
  assert.equal(L.isOwner({}), false);
  const src = read('studio/views/lists.js');
  assert.match(src, /'\/api\/assets\/' \+ encodeURIComponent\(id\) \+ '\/attest'/);
  assert.match(src, /'\/api\/assets\/' \+ encodeURIComponent\(id\) \+ '\/revoke-attest'/);
  assert.match(src, /aspectPicker\(\{ aspects: cat, value: null, inherit: \{ value: defOf\(\) \}/, 'form lệnh: inherit = mặc định kênh');
  assert.match(src, /if \(picker && picker\.value\) b\.data = \{ default_aspect: picker\.value \}/, 'form kênh: default_aspect');
});

test('HTTP: GET /api/channels/:id đọc dữ liệu kênh (cần phiên); lưu Định dạng qua POST /api/channels ⇒ version mới; agent không có lối', async (t) => {
  const s = await bootTmp();
  t.after(s.clean);
  const o = await setupOwner(s.app, s.base);
  const call = ui(s.base, o);
  const c = await call('POST', '/api/channels', { name: 'Kênh thử', lang: 'vi', term_lang: 'en', schedule: { time: '06:00', per_run: 1 }, data: { default_aspect: '9:16' } });
  assert.equal(c.status, 201, c.text);
  const id = c.json.display_id;
  assert.equal((await request(s.base, 'GET', '/api/channels/' + id)).status, 401, 'không phiên ⇒ 401');
  const g = await call('GET', '/api/channels/' + id);
  assert.equal(g.status, 200, g.text);
  assert.equal(g.json.channel.display_id, id); assert.equal(g.json.channel.data.default_aspect, '9:16'); assert.equal(g.json.channel.version, 1);
  assert.equal((await call('GET', '/api/channels/CH-9999')).status, 404);
  // đúng bản vá tab Định dạng tạo ra
  const f = await load('views/channel-tabs/format.js');
  const st = Object.assign(f.formatState(g.json.channel.data, FIX), { mixOn: true, per_run: 2, counts: { '16:9': 1, '9:16': 1 } });
  const u = await call('POST', '/api/channels', { channel: id, data: f.formatPatch(st, g.json.channel.data.schedule, ['16:9', '9:16']), note: 'Đổi định dạng' });
  assert.equal(u.status, 201, u.text);
  const g2 = await call('GET', '/api/channels/' + id);
  assert.equal(g2.json.channel.version, 2);
  assert.deepEqual(g2.json.channel.data.schedule, { time: '06:00', per_run: 2, mix: [{ aspect: '16:9', n: 1 }, { aspect: '9:16', n: 1 }] });
  // Σn ≠ per_run ⇒ máy chủ chặn (UI cũng chặn trước khi gửi)
  const bad = await call('POST', '/api/channels', { channel: id, data: { schedule: { time: '06:00', per_run: 3, mix: [{ aspect: '9:16', n: 1 }] } } });
  assert.equal(bad.status, 400);
  // lệnh "Theo kênh" (không aspect) ⇒ NULL; chọn 9:16 ⇒ lưu 9:16
  const L = await load('views/lists.js');
  const w1 = await call('POST', '/api/work_orders', L.woBody('một', id, null));
  const w2 = await call('POST', '/api/work_orders', L.woBody('hai', id, '9:16'));
  assert.equal(w1.status, 201, w1.text); assert.equal(w2.status, 201, w2.text);
  assert.equal(w1.json.work_order.aspect ?? null, null); assert.equal(w2.json.work_order.aspect, '9:16');
});
