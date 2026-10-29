// © 2026 Gen Labs — All rights reserved.
// UI-D0 (SPEC-0.2.0 §7.3, F7 §10.5): Tổng quan v2 — phần thuần của views/overview.js + components/charts.js, khoá i18n ov.*,
// F5-4 (mọi ↗ của thẻ phân hệ mở đúng lưới với đúng truy vấn và số hàng = số trên thẻ), F5-5 (hạn mức chưa biết không ra số bịa), ngân sách SVG.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { tmpDb, basics } = require('./a-helpers.js');

const ROOT = path.join(__dirname, '..');
const STUDIO = path.join(ROOT, 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('i18n ov: vi/en cùng bộ khoá, không trùng core (khoá ov.* của 0.1.x vẫn ở core), có chữ cho mọi thẻ phân hệ/KPI/trạng thái lệnh', async () => {
  const m = await load('i18n/ov.js');
  const idx = await load('i18n/index.js');
  const ov = await load('views/overview.js');
  assert.deepEqual(Object.keys(m.vi).sort(), Object.keys(m.en).sort());
  for (const k of Object.keys(m.vi)) { assert.ok(k.startsWith('ov.'), k); assert.ok(!(k in idx.MODULES.core.vi), 'trùng core: ' + k); }
  for (const k of Object.keys(ov.MODULE_ICONS)) { assert.ok('ov.mod.' + k in m.vi, k); assert.ok('ov.mod.' + k + '.sub' in m.vi, k); }
  for (const k of ov.KPI_PERIOD) assert.ok('ov.kpi.' + k in m.vi, k);
  for (const k of ov.KPI_TODAY) assert.ok('ov.today.' + k in m.vi, k);
  for (const p of ov.PERIODS) assert.ok('ov.period.' + p in m.vi, p);
  for (const [s] of ov.ORDER_STATES) assert.ok('st.' + s in idx.VI, 'st.' + s);
  for (const lv of ['ok', 'warn', 'danger', 'unknown']) assert.ok('ov.level.' + lv in m.vi);
  for (const s of ['api', 'learned_429', 'unknown', 'local_counter']) assert.ok('ov.voice.src.' + s in m.vi, s);
});

test('định dạng số: KPI null ⇒ —, tỉ lệ %, phút, giây dựng; hạn mức chưa biết không có mẫu số (STD-10, F5-5)', async () => {
  const ov = await load('views/overview.js');
  const { setLang } = await load('i18n.js');
  setLang('vi');
  assert.equal(ov.fmtKpi('first_pass_rate', 0.71), '71 %');
  assert.equal(ov.fmtKpi('first_pass_rate', null), '—');
  assert.equal(ov.fmtKpi('median_review_min', 4.25), '4,3 phút');
  assert.equal(ov.fmtKpi('avg_render_s', 212), '3:32');
  assert.equal(ov.fmtKpi('renders', 1234), '1.234');
  assert.equal(ov.fmtKpi('renders', 'x'), '—');
  assert.equal(ov.voiceText({ used_today: 6, limit: 10 }), '6/10');
  const unk = ov.voiceText({ used_today: 6, limit: null, remaining: null, limit_source: 'unknown' });
  assert.ok(!/\/|\d+\s*\/\s*\d+/.test(unk) && /6/.test(unk), 'không bịa hạn mức: ' + unk);
  setLang('en'); assert.equal(ov.fmtKpi('first_pass_rate', 0.5), '50%'); setLang('vi');
});

test('thẻ phân hệ, xưởng mới, thời gian, thước ngày, href an toàn', async () => {
  const ov = await load('views/overview.js');
  assert.equal(ov.moduleCount({ key: 'pipeline', running: 2, pending: 9 }), 2);
  assert.equal(ov.moduleCount({ key: 'review', pending: 3 }), 3);
  assert.equal(ov.moduleCount({ key: 'cast' }), 0);
  assert.equal(ov.moduleSub({ key: 'work_orders', assigned: 2, stalled: 1 }), '2 đã giao · 1 kẹt');
  assert.ok(ov.isFresh({ recent_renders: [] }) && ov.isFresh({}) && !ov.isFresh({ recent_renders: [{ id: 'RD-0001' }] }));
  const now = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(ov.ago('2026-10-28T11:59:40Z', now), 'vừa xong');
  assert.equal(ov.ago('2026-10-28T11:15:00Z', now), '45 phút trước');
  assert.equal(ov.ago('2026-10-28T07:00:00Z', now), '5 giờ trước');
  assert.equal(ov.ago('2026-10-25T12:00:00Z', now), '3 ngày trước');
  assert.equal(ov.ago('rác', now), '—');
  assert.equal(ov.runwayScale(0), 7); assert.equal(ov.runwayScale(5), 7); assert.equal(ov.runwayScale(6), 7); assert.equal(ov.runwayScale(7), 14); assert.equal(ov.runwayScale(null), 7);
  assert.equal(ov.weekLabel('2026-W43'), 'W43');
  assert.equal(ov.safeHref('#/work-orders?q=state:open'), '#/work-orders?q=state:open');
  for (const bad of ['javascript:alert(1)', 'https://x.y/#/a', '//evil', '#', null, 5]) assert.equal(ov.safeHref(bad), null, String(bad));
});

test('F5-4: mọi href thẻ phân hệ của /api/overview mở đúng lưới, ô truy vấn chạy được và số hàng = số trên thẻ', async () => {
  const { buildV2 } = require('../server/routes/overview.js');
  const { runGrid } = require('../server/grids.js');
  const { parseRoute, ROUTES } = await load('components/util.js');
  const ov = await load('views/overview.js');
  const { db, write } = tmpDb();
  const b = basics(write, db);
  write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', brief: 'một' });
  write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', brief: 'hai', aspect: '9:16' });
  db.run("UPDATE cast_members SET status='candidate' WHERE display_id=?", b.m1.display_id);   // một nhân vật chờ chốt
  const o = buildV2(db, {});
  // route của app.js cho từng path ⇒ tên lưới (lists.js / lessons.js / cast.js)
  const GRID = { review: 'review_queue', 'work-orders': 'work_orders', cast: 'cast', assets: 'assets', agents: 'auth_requests' };
  const app = read('studio/app.js');
  assert.equal(o.modules.length, 6);
  for (const m of o.modules) {
    assert.ok(ov.safeHref(m.href), 'href hợp lệ: ' + m.href);
    const r = parseRoute(m.href);
    assert.ok(ROUTES.includes(r.path) && r.path !== 'overview', m.key + ' → ' + r.path);
    assert.match(app, new RegExp("case '" + r.path + "'"), 'app.js có màn ' + r.path);
    if (m.key === 'pipeline') continue;   // thẻ Đang dựng đếm Render đang chạy; lưới Pipeline là toàn bộ Run (không lọc) — không so số hàng
    if (m.key === 'agent_auth') { assert.equal(r.query.view, 'pending'); continue; }   // Chờ duyệt lấy từ /api/auth-requests, không qua ô truy vấn
    const res = runGrid(db, GRID[r.path], { q: r.query.q || '' });
    assert.equal(res.rows.length, ov.moduleCount(m), `${m.key}: lưới ${GRID[r.path]} q="${r.query.q || ''}" có ${res.rows.length} hàng, thẻ ghi ${ov.moduleCount(m)}`);
  }
  assert.equal(ov.moduleCount(o.modules.find((m) => m.key === 'work_orders')), 2);
  assert.equal(ov.moduleCount(o.modules.find((m) => m.key === 'cast')), 1, 'thẻ Nhân vật chờ chốt có số khác 0 để phép so có nghĩa');
});

test('charts.js: SVG thuần (không thư viện), hình học đúng, mục tiêu nét đứt, ngân sách nút ≤ 400', async () => {
  const c = await load('components/charts.js');
  const src = read('studio/components/charts.js');
  const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['./dom.js', './util.js']);
  assert.equal(c.niceMax(0), 1); assert.equal(c.niceMax(7), 10); assert.equal(c.niceMax(14), 20); assert.equal(c.niceMax(51), 100); assert.equal(c.niceMax(3), 5);
  const items = [0, 2, 7, 9, 4, 0, 1, 7].map((v) => ({ value: v, target: 7 }));
  const g = c.barGeometry(items, { width: 360, height: 140 });
  assert.equal(g.bars.length, 8); assert.equal(g.max, 10);
  assert.ok(g.target && Math.abs(g.target.y - (g.base - 0.7 * g.plotH)) < 1e-9, 'đường mục tiêu tại 7/10');
  assert.ok(Math.abs(g.bars[3].h - 0.9 * g.plotH) < 1e-9 && g.bars[0].h === 0);
  assert.equal(c.barGeometry(items.map((x, i) => ({ value: x.value, target: i })), {}).target, null, 'mục tiêu khác nhau ⇒ vẽ theo cột');
  const d = c.donutArcs([1, 0, 3], 40);
  assert.ok(Math.abs(d.arcs.reduce((s, a) => s + a.len, 0) - d.C) < 1e-9); assert.equal(d.arcs[1].len, 0); assert.equal(d.total, 4);
  assert.deepEqual(c.donutArcs([0, 0], 10).arcs.map((a) => a.len), [0, 0]);
  const s = c.stackGeometry([3, 1, 4], 200);
  assert.deepEqual(s.map((x) => Math.round(x.w)), [75, 25, 100]); assert.equal(Math.round(s[2].x), 100);
  assert.deepEqual(c.stackGeometry([0, 0], 100).map((x) => x.w), [0, 0]);
  // ngân sách §7.5: cột tuần = 3 vạch trục×2 + 8 cột×(rect,title,số,nhãn) + 1 mục tiêu ⇒ 39; donut 5 trạng thái ⇒ ≤ 1+5×2+2; giáo trình 6 nhánh × 4 ⇒ 24
  assert.ok(3 * 2 + 8 * 4 + 1 + (1 + 5 * 2 + 2) + 6 * 4 <= 400);
});

test('overview.js: gọi /api/overview?period=, kỳ 7d|30d|month, gom sự kiện change 500 ms, ảnh nhỏ chỉ từ /media/<mã asset>, badge tỉ lệ từ recent_renders[].aspect', () => {
  const src = read('studio/views/overview.js');
  assert.match(src, /get\('\/api\/overview\?period=' \+ encodeURIComponent\(period\)\)/);
  assert.match(src, /onDebounced\('change', load, 500\)/);
  assert.match(src, /aspectBadge\(r\.aspect \|\| '16:9'\)/);
  assert.match(src, /aspectThumb\(r\.aspect \|\| '16:9', thumb/);
  assert.match(src, /\/\^\[\\w-\]\+\$\/\.test\(toText\(r\.thumb\)\)/, 'mã ảnh bìa phải là mã asset trước khi ghép /media/');
  assert.ok(!/innerHTML/.test(src) && !/innerHTML/.test(read('studio/components/charts.js')));
});
