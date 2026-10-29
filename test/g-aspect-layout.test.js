// © 2026 Gen Labs — All rights reserved.
// Gói A2 (SPEC-0.2.0-F7 §3.1, §4.1, §4.5, §5.2) — plan 9:16 thuần Node: thế giới cột dọc, máy quay theo layout.camera (tâm vùng ở content_center),
// bất biến "vùng đã hiện chiếu ra ngoài khung khi máy quay đứng ở vùng sau" (CNS-332), nhân vật theo layout.actors, khối không khai 9:16 bị cấm,
// tutorial dọc bị chặn đúng lời, layout.overview=false (CNS-346), 16:9 không có khoá mới. Mọi số lấy từ render/aspects.json (không chép tay).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { buildPlan } = require('../render/engine/timeline');
const { buildTutorialPlan } = require('../render/engine/tutorial');
const camera = require('../render/engine/camera');
const registry = require('../render/blocks/registry');
const aspects = require('../render/aspects');
const DATA = require('../render/aspects.json');

const V = aspects.get('9:16'), L = V.layout, [W, H] = V.size;
const LESSON_BLOCKS = ['title', 'concept-chip', 'token-row', 'prob-card', 'stamp', 'takeaway', 'lesson-map', 'end-card', 'illustration'];

function lesson(extra) {
  const lines = [
    { id: 'L1', who: 'CM-0001', say: 'Xin chào các bạn, hôm nay mình học về xác suất trong mô hình ngôn ngữ' },
    { id: 'L2', who: 'CM-0002', say: 'Mô hình đoán từ tiếp theo dựa trên xác suất của từng token', terms: ['token'] },
    { id: 'L3', who: 'CM-0001', say: 'Thẻ xác suất cho thấy từ nào được chọn nhiều nhất' },
    { id: 'L4', who: 'CM-0002', say: 'Từ nào xác suất cao nhất thì được chọn nhé các bạn' },
  ];
  const beats = [
    { id: 'B1', block: 'title', anchor: { line: 'L1', word: 'Xin' }, params: { text: 'Xác suất trong LLM' } },
    { id: 'B2', block: 'concept-chip', anchor: { line: 'L2', word: 'Mô' }, params: { text: 'token' } },
    { id: 'B3', block: 'token-row', anchor: { line: 'L2', word: 'dựa' }, params: { tokens: ['Trời', 'hôm', 'nay'], next: 'đẹp' } },
    { id: 'B4', block: 'prob-card', anchor: { line: 'L3', word: 'Thẻ' }, params: { prompt: 'Trời hôm nay', options: [['đẹp', 60], ['mưa', 30], ['lạ', 10]], pick: 0 } },
    { id: 'B5', block: 'takeaway', anchor: { line: 'L4', word: 'Từ' }, params: { kind: 'eq', text: 'Cao nhất = chọn' } },
  ];
  return Object.assign({ lesson: { title: 'Xác suất trong LLM', lines, beats }, channel: { name: 'Gen Labs' }, fps: 30 }, extra);
}
// điểm thế giới → khung (stage.js: translate(size/2 − c·z) scale(z))
const toFrame = (c, x, y) => [(x - c.x) * c.z + W / 2, (y - c.y) * c.z + H / 2];

test('plan 9:16: size/aspect/layout (kèm safe) từ aspects.json; 16:9 không có khoá layout và trùng plan không truyền aspect', () => {
  const p = buildPlan(lesson({ aspect: '9:16' }));
  assert.deepEqual(p.size, [1080, 1920]); assert.equal(p.aspect, '9:16');
  assert.deepEqual(p.layout, Object.assign({}, L, { safe: V.safe }), 'plan.layout = bản phân giải của aspects.json → layout + safe');
  const a = buildPlan(lesson({})), b = buildPlan(lesson({ aspect: '16:9' }));
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'không truyền aspect ≡ "16:9" (trùng byte)');
  assert.ok(!('layout' in a)); assert.deepEqual(a.size, [1920, 1080]);
  assert.deepEqual(a.actors.map((x) => [x.layout.x, x.layout.scale]), [[-40, 1], [1500, 1]], '16:9 giữ chỗ đứng v0.1.x');
});

test('thế giới cột dọc: mọi vùng cùng cx = origin.x, cy cách nhau pitch.y; world ≥ min, đủ pad; khối phủ khung (thẻ kết) nhận slot cả khung 1080×1920', () => {
  const p = buildPlan(lesson({ aspect: '9:16' })), Z = p.style.zones, Wd = L.world;
  assert.ok(Z.length >= 3, 'đủ vùng để kiểm');
  Z.forEach((z, i) => { assert.equal(z.cx, Wd.origin[0] + 0 * Wd.pitch[0]); assert.equal(z.cy, Wd.origin[1] + i * Wd.pitch[1]); assert.ok(z.h <= Math.max(Wd.zone_max_h, z.h)); });
  assert.ok(p.style.world.w >= Wd.min[0] && p.style.world.h >= Wd.min[1]);
  assert.equal(p.style.world.h, Math.max(Wd.min[1], Z[Z.length - 1].cy + Wd.pad[1]));
  const ec = p.beats.find((b) => b.block === 'end-card');
  assert.deepEqual(ec.slot, { x: 0, y: 0, w: W, h: H });
});

test('máy quay: khi đứng ở vùng, tâm vùng nằm ở content_center, z trong [z_min, z_max] theo frame_box; cú đẩy mở đầu giữ content_center; lia dọc easeInOut', () => {
  const p = buildPlan(lesson({ aspect: '9:16' })), C = L.camera, Z = p.style.zones;
  Z.forEach((z) => {
    const t = Math.min(...z.beats.map((id) => p.beats.find((b) => b.id === id).t_in)) + 1000, c = camera.sample(p.camera, t);
    const zr = Math.min(C.frame_box[0] / z.w, C.frame_box[1] / z.h), want = Math.min(C.z[1], Math.max(C.z[0], zr));
    assert.ok(Math.abs(c.z - want) / want <= 0.05, z.id + ' z ' + c.z + ' ≈ ' + want + ' (trôi DRIFT ≤ 5 %)');
    const [fx, fy] = toFrame(c, z.cx, z.cy);
    assert.ok(Math.abs(fx - C.content_center[0]) <= 0.05 * W && Math.abs(fy - C.content_center[1]) <= 0.05 * H, z.id + ' tâm ở content_center: ' + [fx, fy]);
  });
  const c0 = p.camera[0], [ix, iy] = toFrame(c0, Z[0].cx, Z[0].cy);
  assert.ok(Math.abs(ix - C.content_center[0]) < 1 && Math.abs(iy - C.content_center[1]) < 1, 'khung mở đầu (z·INTRO) vẫn đặt vùng đầu ở content_center');
  // lia giữa vùng: x không đổi (một cột), y tăng đơn điệu, không nhảy cóc giữa hai khung liên tiếp (mỗi 33 ms dịch < 120 px khung)
  for (let t = 0; t < p.duration_ms - 33; t += 33) {
    const a = camera.sample(p.camera, t), b = camera.sample(p.camera, t + 33);
    const [ax, ay] = toFrame(a, Z[0].cx, Z[0].cy), [bx, by] = toFrame(b, Z[0].cx, Z[0].cy);
    assert.ok(Math.abs(bx - ax) < 120 * Math.max(1, a.z / b.z) + 200 && Math.abs(by - ay) < 400, 'không cắt cứng ở ' + t);
  }
});

test('bất biến CNS-332: máy quay đứng ở một vùng ⇒ hộp mọi vùng đã hiện trước đó chiếu ra NGOÀI khung (pitch − zone_max_h/2 > content_center.y / z_min)', () => {
  const Wd = L.world, C = L.camera;
  assert.ok(Wd.pitch[1] - Wd.zone_max_h / 2 > C.content_center[1] / C.z[0], 'điều kiện dữ liệu');
  const p = buildPlan(lesson({ aspect: '9:16' })), Z = p.style.zones;
  for (let i = 1; i < Z.length; i++) {
    const t0 = Math.min(...Z[i].beats.map((id) => p.beats.find((b) => b.id === id).t_in)) + 1000, c = camera.sample(p.camera, t0);
    for (let j = 0; j < i; j++) {
      const [x0, y0] = toFrame(c, Z[j].x, Z[j].y), [x1, y1] = toFrame(c, Z[j].x + Z[j].w, Z[j].y + Z[j].h);
      assert.ok(y1 <= 0 || y0 >= H || x1 <= 0 || x0 >= W, `vùng ${Z[j].id} lộ khi máy quay ở ${Z[i].id}: y ${y0.toFixed(0)}→${y1.toFixed(0)}`);
    }
  }
});

test('nhân vật: hai KOL theo layout.actors (x, scale); actorLayout của hook vẫn thắng', () => {
  const p = buildPlan(lesson({ aspect: '9:16' }));
  assert.deepEqual(p.actors.map((a) => [a.side, a.layout.mode, a.layout.x, a.layout.scale]), [['left', 'stage', L.actors.x[0], L.actors.scale], ['right', 'stage', L.actors.x[1], L.actors.scale]]);
  const q = buildPlan(lesson({ aspect: '9:16', actorLayout: { 'CM-0001': { mode: 'hidden' } } }));
  assert.equal(q.actors[0].layout.mode, 'hidden');
});

test('khối: index.json khai `aspects` (9 khối bài thường dọc được, 6 khối tutorial chỉ 16:9); registry lọc theo tỉ lệ; bài 9:16 dùng khối không hỗ trợ ⇒ block_aspect', () => {
  for (const e of registry.all()) assert.deepEqual(e.aspects, LESSON_BLOCKS.includes(e.name) ? ['16:9', '9:16'] : ['16:9'], e.name);
  assert.deepEqual(registry.names('lesson', '9:16').sort(), LESSON_BLOCKS.slice().sort());
  assert.deepEqual(registry.names('lesson'), registry.names('lesson', '16:9'), 'không truyền tỉ lệ = API cũ');
  assert.ok(!registry.names('tutorial', '9:16').includes('screen'));
  assert.equal(registry.supports('callout', '9:16'), false); assert.equal(registry.supports('title', '9:16'), true); assert.equal(registry.supports('title'), true);
  const v = registry.validate('callout', { text: 'x' }, undefined, '9:16'); assert.equal(v.ok, false); assert.match(v.errors[0], /chưa hỗ trợ tỉ lệ 9:16/);
  const bad = lesson({ aspect: '9:16' }); bad.lesson.beats.push({ id: 'BX', block: 'keystroke', anchor: { line: 'L4', word: 'Từ' }, params: { keys: ['Ctrl', 'C'] } });
  assert.throws(() => buildPlan(bad), (e) => e.code === 'block_aspect' && /keystroke/.test(e.text_human) && e.detail.aspect === '9:16');
  // stage.html + index.browser.js khớp index.json (gen-stage --check)
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'gen-stage.js'), '--check']);
});

test('tutorial dọc bị chặn đúng lời (§5.2) ở buildPlan và ở buildTutorialPlan (lưới thứ hai); tỉ lệ lạ ⇒ aspect_unsupported', () => {
  const tut = { kind: 'tutorial', aspect: '9:16', lesson: { lines: [{ id: 'L1', who: 'CM-0001', say: 'x' }], beats: [] } };
  for (const fn of [() => buildPlan(tut), () => buildTutorialPlan(tut)])
    assert.throws(fn, (e) => e.name === 'PlanError' && e.code === 'aspect_kind_unsupported' && e.text_human === aspects.TUTORIAL_BLOCKED);
  assert.throws(() => buildPlan(lesson({ aspect: '1:1' })), (e) => e.code === 'aspect_unsupported');
});

test('layout.overview (CNS-346, dữ liệu; S13 chốt false cho 9:16): false ⇒ không tự thêm toàn cảnh, thẻ kết theo ngay sau câu cuối, máy quay không lùi; true ⇒ có toàn cảnh', () => {
  const saved = DATA.aspects['9:16'].layout.overview;
  assert.equal(saved, false, 'S13: toàn cảnh cột dọc đặt khối vào thanh trên/vùng caption và chữ ~0,4× ⇒ tắt bằng dữ liệu');
  try {
    for (const ov of [false, true]) {
      DATA.aspects['9:16'].layout.overview = ov;   // aspects.js đọc trực tiếp object đã nạp — đổi dữ liệu, không đổi mã
      const p = buildPlan(lesson({ aspect: '9:16' })), last = p.lines[p.lines.length - 1].b_ms, ec = p.beats.find((b) => b.block === 'end-card');
      assert.equal(p.beats.some((b) => b.block === 'lesson-map'), ov);
      if (!ov) {
        assert.ok(ec.t_in > last && ec.t_in - last <= 500, 'thẻ kết ngay sau câu cuối');
        assert.ok(Math.min(...p.camera.map((k) => k.z)) >= L.camera.z[0] - 1e-9, 'không có khung toàn cảnh z nhỏ');
      } else assert.ok(Math.min(...p.camera.map((k) => k.z)) < L.camera.z[0], 'có khung toàn cảnh');
    }
  } finally { DATA.aspects['9:16'].layout.overview = saved; }
});

test('mốc đo (aspects.sampleTimes) trên plan 9:16 thật: mỗi khối trong vùng có mốc beat khi máy quay đã đứng yên; có mốc thẻ kết; ≤ 2 mốc/giây', () => {
  const p = buildPlan(lesson({ aspect: '9:16' })), S = aspects.sampleTimes(p);
  const zoned = p.beats.filter((b) => b.zone);
  for (const b of zoned) assert.ok(S.some((s) => s.kind === 'beat' && (s.beat === b.id || s.zone === b.zone)), 'mốc beat cho ' + b.id);
  assert.ok(S.some((s) => s.kind === 'end'));
  for (let i = 1; i < S.length; i++) assert.ok(S[i].t - S[i - 1].t >= DATA.render.sampling.min_gap_ms);
});
