// © 2026 Gen Labs — All rights reserved.
// Gói U — rãnh con trỏ (SPEC-0.2.0 §6.5, CNS-100, F4-6, F4-7): Fitts + sàn 0,45·D, minimum-jerk (vận tốc 0 hai đầu), Bézier lệch (không thẳng khi D > 200),
// vượt đà khi D > 600, tới đích trước mốc ≥ 150 ms, không di khi máy quay lia, gõ theo cps, lược đồ plan.cursor (h-fixtures), tất định trùng byte.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CP = require('../render/engine/cursor-path');
const camera = require('../render/engine/camera');
const fx = require('./h-fixtures');

const still = () => ({ x: 960, y: 540, z: 1 });
const run = (steps, o = {}) => CP.compile(Object.assign({ steps, camAt: still, camMoves: [], fps: 30, durationMs: 9000, startT: 0, startPos: { x: 300, y: 300 } }, o));
const frameStep = (keys, t, dt = 1000 / 30) => { const a = CP.sampleKeys(keys, t - dt), b = CP.sampleKeys(keys, t); return Math.hypot(b.x - a.x, b.y - a.y); };

test('Fitts: T = clamp(max(250 + 150·log2(D/W+1), 0,45·D), 350, 1300); sàn 0,45·D giữ vận tốc đỉnh minimum-jerk < 140 px/khung', () => {
  assert.equal(CP.fittsMs(10, 40), 350, 'quãng ngắn ⇒ sàn 350 ms');
  assert.equal(Math.round(CP.fittsMs(800, 40)), Math.round(250 + 150 * Math.log2(800 / 40 + 1)));
  assert.equal(CP.fittsMs(2400, 400), 0.45 * 2400, 'quãng dài, đích to ⇒ sàn 0,45·D thắng');
  assert.equal(CP.fittsMs(5000, 10), 1300, 'trần 1300 ms');
  assert.ok(CP.fittsMs(1000, 40, 1100) >= 0.45 * 1100, 'sàn dùng độ dài cung L ≥ D');
  for (const D of [200, 600, 1200, 1800, 2400]) { const T = CP.fittsMs(D, 30, D); assert.ok(1.875 * D / T * (1000 / 30) < 140, 'vận tốc đỉnh ' + D); }
});

test('minimum-jerk: s(0)=0, s(1)=1, vận tốc 0 ở hai đầu, đối xứng; Bézier lệch vuông góc 8–18 % theo hash (tất định)', () => {
  assert.equal(CP.minJerk(0), 0); assert.equal(CP.minJerk(1), 1); assert.equal(CP.minJerk(0.5), 0.5);
  assert.equal(CP.minJerkVel(0), 0); assert.equal(CP.minJerkVel(1), 0); assert.equal(CP.minJerkVel(0.5), 1.875);
  const p = CP.bezier({ x: 0, y: 0 }, { x: 1000, y: 0 }, 'BT-0007');
  const mid = CP.bezAt(p, 0.5), off = Math.abs(mid.y) / 1000;
  assert.ok(off >= 0.08 * 0.75 - 1e-9 && off <= 0.18 * 0.75 + 1e-9, 'điểm giữa lệch ' + off.toFixed(3));   // Bézier đối xứng: lệch ở giữa = 0,75 × lệch điểm điều khiển
  assert.deepEqual(CP.bezier({ x: 0, y: 0 }, { x: 1000, y: 0 }, 'BT-0007'), p, 'cùng id ⇒ cùng đường');
  assert.ok(p.L > p.D);
});

test('compile: tới đích trước mốc hành động ≥ 150 ms; vận tốc 0 ở hai đầu đoạn di; đoạn > 200 px không thẳng; > 600 px vượt đà rồi lắng; nhấn 80 ms + gợn', () => {
  const r = run([{ id: 'BT-1', action: 'click', t: 3000, p: { x: 1500, y: 800 }, W: 40, kind: 'hand', target: 'b' }]);
  const s = r.steps[0];
  assert.ok(s.arrive <= 3000 - 150 + 0.01, 'arrive ' + s.arrive);
  const m = r.cursor.moves[0];
  assert.ok(frameStep(r.cursor.keys, m.t0 + 34) < 6, 'khởi đầu chậm');
  assert.ok(frameStep(r.cursor.keys, m.t1) < 3, 'kết thúc chậm');
  // không thẳng: điểm giữa lệch khỏi dây cung
  const mid = CP.sampleKeys(r.cursor.keys, (m.t0 + m.t1) / 2), ax = 300, ay = 300, bx = 1500, by = 800;
  const dist = Math.abs((by - ay) * mid.x - (bx - ax) * mid.y + bx * ay - by * ax) / Math.hypot(by - ay, bx - ax);
  assert.ok(dist > 20, 'đường cong lệch ' + dist.toFixed(1));
  // vượt đà: có lúc vượt quá đích theo hướng di
  const dir = { x: (bx - ax) / 1300, y: (by - ay) / 1300 };
  let over = 0; for (let t = m.t0; t <= m.t1; t += 5) { const q = CP.sampleKeys(r.cursor.keys, t); over = Math.max(over, (q.x - bx) * dir.x + (q.y - by) * dir.y); }
  assert.ok(over >= 2 && over <= 6.5, 'vượt đà ' + over.toFixed(2));
  assert.deepEqual(r.cursor.clicks, [{ t: 3000, x: 1500, y: 800 }]);
  assert.equal(CP.sampleKeys(r.cursor.keys, 3040).press, true); assert.equal(CP.sampleKeys(r.cursor.keys, 3100).press, false);
  assert.equal(CP.sampleKeys(r.cursor.keys, 2900).kind, 'hand'); assert.equal(CP.sampleKeys(r.cursor.keys, m.t0 + 100).kind, 'arrow');
  // không nhảy cóc (C4): ≤ 140 px/khung trong đoạn di, đứng yên ngoài đoạn di
  for (let t = 34; t < 9000; t += 1000 / 30) assert.ok(frameStep(r.cursor.keys, t) <= 140);
  assert.deepEqual(fx.cursorSchemaErrors(r.cursor), []);
});

test('compile: gõ theo cps (±20 % theo hash, tất định), nhấp đúp = 2 gợn cách 140 ms, kéo nhấn → di chậm ×1,3 → thả có gợn', () => {
  const r = run([
    { id: 'BT-1', action: 'type', t: 2000, p: { x: 700, y: 400 }, W: 44, kind: 'ibeam', text: 'Lớp AI', target: 'in', screen: 'SC-1', cps: 10 },
    { id: 'BT-2', action: 'double_click', t: 4000, p: { x: 900, y: 400 }, W: 40, kind: 'hand', target: 'b' },
    { id: 'BT-3', action: 'drag', t: 6000, p: { x: 900, y: 500 }, to: { x: 900, y: 900 }, W: 40, toW: 40, kind: 'hand', target: 'a', label: 'Mục', dragBox: { w: 300, h: 50 } },
  ]);
  const ty = r.cursor.typing[0];
  assert.equal(ty.text, 'Lớp AI'); assert.equal(ty.at.length, 6); assert.equal(ty.at[0], 2000);
  ty.at.slice(1).forEach((x, i) => { const d = x - ty.at[i]; assert.ok(d >= 80 - 1 && d <= 120 * 1.15 + 1, 'nhịp gõ ' + d); });
  assert.deepEqual(r.cursor.clicks.filter(c => c.t >= 4000 && c.t < 5000).map(c => c.t), [4000, 4140]);
  const d = r.drags[0];
  assert.equal(d.t0, 6000); assert.ok(d.t1 > 6000 + 120 + 350 * 1.3 - 1, 'thả sau khi di chậm'); assert.equal(d.w, 300);
  assert.ok(r.cursor.clicks.some(c => Math.abs(c.t - d.t1) < 0.01 && c.y === 900), 'gợn khi thả');
  assert.equal(CP.sampleKeys(r.cursor.keys, (d.t0 + d.t1) / 2).press, true, 'giữ nhấn khi kéo');
  assert.equal(CP.sampleKeys(r.cursor.keys, 2100).kind, 'ibeam');
});

test('compile: con trỏ KHÔNG di khi máy quay lia (ưu tiên di xong trước, không kịp thì sau); khoá theo khung khi máy quay phóng', () => {
  const keys = [{ t: 0, x: 960, y: 540, z: 1 }, { t: 2000, x: 960, y: 540, z: 1 }, { t: 2800, x: 800, y: 400, z: 2 }, { t: 9000, x: 800, y: 400, z: 2 }];
  const camAt = (t) => camera.sample(keys, t), camMoves = [{ t0: 2000, t1: 2800 }];
  const r = run([{ id: 'BT-9', action: 'click', t: 3000, p: { x: 820, y: 410 }, W: 40, kind: 'hand', target: 'b' }], { camAt, camMoves, startPos: { x: 400, y: 900 } });
  const m = r.cursor.moves[0];
  assert.ok(m.t1 <= 2000 || m.t0 >= 2800, `đoạn di ${m.t0}–${m.t1} chồng đoạn lia 2000–2800`);
  assert.ok(m.t1 <= 2000, 'đủ chỗ ⇒ di xong TRƯỚC khi phóng');
  // con trỏ đứng yên trong thế giới ⇒ toạ độ khung đổi theo máy quay (đích đặt gần tâm phóng nên vẫn trong khung)
  const p = CP.sampleKeys(r.cursor.keys, 2900);
  assert.deepEqual([Math.round(p.x), Math.round(p.y)], [Math.round((820 - 800) * 2 + 960), Math.round((410 - 400) * 2 + 540)]);
  assert.ok(r.cursor.keys.length < 400, 'đứng yên ⇒ bỏ khoá thừa');
});

test('F4-7 tất định: hai lần biên dịch ⇒ plan.cursor trùng byte; không bước ⇒ null (lược đồ hợp lệ)', () => {
  const steps = [{ id: 'BT-1', action: 'click', t: 2000, p: { x: 1200, y: 300 }, W: 40, kind: 'hand' }, { id: 'BT-2', action: 'type', t: 4000, p: { x: 600, y: 700 }, W: 44, kind: 'ibeam', text: 'xin chào', target: 'in', screen: 'S' }];
  assert.equal(JSON.stringify(run(steps).cursor), JSON.stringify(run(JSON.parse(JSON.stringify(steps))).cursor));
  assert.equal(CP.compileCursor({}), null); assert.equal(CP.compileCursor({ steps: [] }), null);
  assert.deepEqual(fx.cursorSchemaErrors(CP.compileCursor({ steps, camAt: still, fps: 30, durationMs: 6000, startPos: { x: 0, y: 0 } })), []);
});

test('ngân sách: biên dịch 120 bước ≤ 200 ms (cùng G-CURSOR thuần, xem g-gate-cursor)', () => {
  const steps = []; for (let i = 0; i < 120; i++) steps.push({ id: 'BT-' + i, action: i % 3 ? 'click' : 'hover', t: 1500 + i * 1500, p: { x: 400 + (i * 137) % 1200, y: 200 + (i * 71) % 600 }, W: 40, kind: 'hand' });
  const t0 = process.hrtime.bigint();
  const r = run(steps, { durationMs: 1500 + 121 * 1500 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(r.steps.length, 120); assert.ok(ms <= 200, 'biên dịch ' + ms.toFixed(1) + ' ms');
});
