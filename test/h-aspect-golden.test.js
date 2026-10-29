// © 2026 Gen Labs — All rights reserved.
// Gói W2-0 — M14 (SPEC-0.2.0-F7 §3.7): bài 16:9 dựng lại TRÙNG BYTE với golden ghi trên mã chưa có F7 (tools/golden-16x9.js, test/fixtures/golden-16x9.json).
// Plan (3 bài mẫu) + camera_plan_hash + manifest (buildManifest thật của pipeline): thuần Node, so chặt mọi máy.
// DOM #stage.outerHTML + quy tắc CSS khớp sân khấu ở 3 mốc: Chromium thật; so chặt khi cùng bản Chromium chính đã ghi golden
// (chuỗi style do Chromium chuẩn hoá có thể khác giữa các bản chính) — khác bản chính mà lệch thì bỏ qua có lời báo, không đỏ oan.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chromium = require('../render/chromium');
const golden = require('../tools/golden-16x9');

const fixture = golden.readFixture();
const NO_CHROMIUM = chromium.find() ? false : 'không có Chromium';
const major = (v) => String(v || '').split('.')[0];

test('golden 16:9 có đủ phần đã khoá (plan 3 bài, camera, manifest 2 bài, DOM 2 bài × 3 mốc) và ghi trên mã chưa có F7', () => {
  assert.deepEqual(Object.keys(fixture.plans).sort(), ['lesson', 'lesson_brand_thumb', 'tutorial']);
  assert.deepEqual(Object.keys(fixture.camera_plan_hash).sort(), ['lesson', 'lesson_brand_thumb', 'tutorial']);
  assert.deepEqual(Object.keys(fixture.manifests).sort(), ['lesson', 'lesson_brand_thumb']);
  assert.deepEqual(Object.keys(fixture.dom).sort(), ['lesson', 'lesson_brand']);
  for (const shots of Object.values(fixture.dom)) {
    assert.equal(shots.length, 3);
    for (const s of shots) { assert.match(s.sha256, /^[0-9a-f]{64}$/); assert.match(s.css_sha256, /^[0-9a-f]{64}$/); assert.ok(s.bytes > 1000 && s.css_rules > 10); }
  }
  assert.match(fixture.base, /^[0-9a-f]{7,40}$/);
});

test('M14 thuần Node: plan, camera_plan_hash, manifest 16:9 trùng golden; không truyền aspect ≡ aspect "16:9"; lv.aspect thiếu/NULL/"16:9" cùng manifest', async () => {
  const { golden: g, problems } = await golden.compute({ dom: false });
  assert.deepEqual(problems, []);
  assert.deepEqual(golden.diff(fixture, g), [], 'chạy `node tools/golden-16x9.js --dump <thư mục>` ở nhánh gốc và nhánh này để diff');
});

test('M14 Chromium: DOM sân khấu 16:9 + quy tắc CSS đang áp ở 3 mốc trùng golden', { skip: NO_CHROMIUM, timeout: 180000 }, async (t) => {
  const { golden: g } = await golden.compute({ dom: true });
  const d = golden.diff({ dom: fixture.dom }, { dom: g.dom });
  if (d.length && major(g._chromium) !== major(fixture._chromium)) {
    t.skip(`Chromium ${g._chromium} khác bản ghi golden ${fixture._chromium} và DOM lệch (${d.length} mục) — chạy trên máy cùng bản để so DOM`);
    return;
  }
  assert.deepEqual(d, [], 'Chromium ' + g._chromium + ' (golden ' + fixture._chromium + ')');
});

test('golden phát hiện được thay đổi 16:9 (tự kiểm của công cụ: diff báo đúng khoá lệch)', () => {
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.plans.lesson.sha256 = '0'.repeat(64);
  const d = golden.diff(bad, { plans: fixture.plans });
  assert.equal(d.length, 1); assert.match(d[0], /^plans\.lesson\.sha256/);
  assert.deepEqual(golden.diff(fixture, { plans: Object.assign({ extra: { sha256: 'x' } }, fixture.plans) }).map((x) => x.split(':')[0]), ['plans.extra']);
});
