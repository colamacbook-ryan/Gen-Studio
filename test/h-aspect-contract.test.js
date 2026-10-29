// © 2026 Gen Labs — All rights reserved.
// Gói W2-0 — hợp đồng tỉ lệ khung (SPEC-0.2.0-F7 §3.1–3.3, §6.2): lược đồ render/aspects.json; API render/aspects.js (resolve đủ nhánh §3.3, fit, thumbSizes,
// coverFrameMs = công thức cover.jpg của render.js, sampleTimes, layoutVars, safeCheck S1–S6); chạy được ngoài Node (UMD, không DOM); fixture hợp đồng cho UI.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../render/aspects');
const DATA = require('../render/aspects.json');
const { KINDS } = require('../render/engine/timeline');
const thumb = require('../render/thumb');
const golden = require('../tools/golden-16x9');

const ROOT = path.join(__dirname, '..');
const API_FIX = require('./fixtures/api-aspects.json');
const SAFE_FIX = require('./fixtures/measure-safe.json');
const copy = (v) => JSON.parse(JSON.stringify(v));
const inside = (b, z) => b[0] >= z[0] && b[1] >= z[1] && b[2] <= z[2] && b[3] <= z[3];
const codeOf = (fn) => { try { fn(); } catch (e) { assert.equal(e.name, 'AspectError'); assert.ok(e.text_human); return e.code; } return null; };

// ---------- lược đồ dữ liệu ----------
test('aspects.json: lược đồ, mặc định, kích thước khớp tỉ lệ, token tên tệp, preset hai chiều, nguồn có URL, thời lượng', () => {
  assert.equal(DATA.version, 1);
  assert.ok(DATA.aspects[DATA.default] && DATA.aspects[DATA.default].enabled, 'mặc định phải bật');
  assert.equal(DATA.default, '16:9');
  for (const [id, d] of Object.entries(DATA.aspects)) {
    const m = /^(\d+):(\d+)$/.exec(id); assert.ok(m, id);
    assert.equal(typeof d.enabled, 'boolean');
    assert.ok(Array.isArray(d.size) && d.size.length === 2 && d.size.every(Number.isInteger), id + ' size');
    assert.equal(d.size[0] * Number(m[2]), d.size[1] * Number(m[1]), id + ': size đúng tỉ lệ');
    assert.equal(d.token, m[1] + 'x' + m[2]);
    assert.ok(d.kinds.length && d.kinds.every((k) => KINDS.includes(k)), id + ' kinds ⊆ timeline.KINDS');
    assert.ok(d.presets.length);
    for (const p of d.presets) assert.equal(DATA.presets[p].aspect, id, p + ' thuộc ' + id);
    assert.equal(d.thumb_sizes.length, 2);
    d.thumb_sizes.forEach((s, i) => { assert.equal(Math.max(...s), [1280, 1920][i], 'cạnh dài 1280/1920'); assert.equal(s[0] * Number(m[2]), s[1] * Number(m[1]), 'ảnh bìa đúng tỉ lệ'); });
    if (d.layout.legacy) { assert.deepEqual(d.size, [1920, 1080], 'chỉ 16:9 đi nhánh legacy'); assert.equal(d.safe, null); continue; }
    // tỉ lệ mới: bố cục + vùng an toàn đủ khoá
    for (const k of ['world', 'camera', 'actors', 'subtitle', 'logo', 'end_card']) assert.ok(d.layout[k], id + ' layout.' + k);
    assert.equal(typeof d.layout.overview, 'boolean'); assert.equal(typeof d.layout.chip_top, 'boolean'); assert.equal(typeof d.layout.lower_third, 'boolean');
    assert.ok(Number.isFinite(d.min_font_px) && d.min_font_px > 0);
    assert.ok(d.target_s[0] > 0 && d.target_s[0] < d.target_s[1]);
    const s = d.safe, frame = [0, 0, d.size[0], d.size[1]];
    assert.match(s.ref, /^[a-z0-9-]+$/); assert.equal(s.verified, false, 'số vùng an toàn chưa kiểm trên máy thật ⇒ verified:false');
    assert.ok(inside(s.hard, frame) && inside(s.soft, s.hard), 'khung ⊇ cứng ⊇ mềm');
    for (const src of s.sources) assert.ok(DATA.sources[src], 'nguồn ' + src);
  }
  for (const [id, p] of Object.entries(DATA.presets)) {
    assert.ok(DATA.aspects[p.aspect] && DATA.aspects[p.aspect].presets.includes(id), id + ' có trong presets của tỉ lệ');
    assert.ok(['youtube', 'facebook', 'tiktok'].includes(p.platform));
    assert.ok(p.max_s === null || (Number.isInteger(p.max_s) && p.max_s > 0));
    assert.ok(typeof p.cover === 'string' && p.cover.split('|').every((c) => ['upload', 'upload_desktop', 'frame'].includes(c)));
    if (p.source !== undefined) { assert.match(DATA.sources[p.source], /^https:\/\//); assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/); assert.equal(typeof p.verified, 'boolean'); }
  }
  // số đã chốt ở spec §2.3 (đổi = sửa dữ liệu + spec)
  assert.equal(DATA.presets.yt_shorts.max_s, 180); assert.equal(DATA.presets.yt_shorts.verified, true);
  assert.equal(DATA.presets.fb_reels.max_s, null); assert.equal(DATA.presets.fb_reels.verified, false);
  assert.equal(DATA.presets.tiktok.max_s, 1800); assert.equal(DATA.presets.tiktok.verified, false); assert.deepEqual(DATA.presets.tiktok.grid_crop, [3, 4]);
  assert.deepEqual(DATA.aspects['9:16'].safe.hard, [60, 220, 940, 1440]); assert.deepEqual(DATA.aspects['9:16'].safe.soft, [65, 288, 888, 1248]);
  assert.deepEqual(DATA.aspects['9:16'].kinds, ['lesson'], 'tutorial dọc chặn ở 0.2.0 (§5.2)');
});

test('aspects.json 9:16: bố cục nằm trong vùng an toàn + bất biến "vùng kề ngoài khung" (§3.1, CNS-332/338)', () => {
  const d = DATA.aspects['9:16'], L = d.layout, soft = d.safe.soft;
  // logo (ô 72 px) và thẻ kết (x 76→876) trong vùng mềm; phụ đề bắt đầu trong vùng mềm
  for (const p of [L.logo.tl, L.logo.tr]) assert.ok(inside([p[0], p[1], p[0] + 72, p[1] + 72], soft), 'logo ' + p);
  assert.ok(inside([L.end_card.center_x - L.end_card.max_w / 2, 0, L.end_card.center_x + L.end_card.max_w / 2, 0].map((v, i) => (i % 2 ? soft[1] : v)), soft));
  assert.ok(L.subtitle.left >= soft[0] && L.subtitle.left + L.subtitle.max_w <= soft[2] && L.subtitle.top >= soft[1]);
  assert.deepEqual(Object.keys(L.logo.remap).sort(), ['bl', 'br']);
  // pitch.y − zone_max_h/2 > content_center.y / z_min
  assert.ok(L.world.pitch[1] - L.world.zone_max_h / 2 > L.camera.content_center[1] / L.camera.z[0]);
});

// ---------- API ----------
test('list / get / token / presetsOf / fit / thumbSizes: đúng dữ liệu, trả bản sao (sửa kết quả không đổi nguồn)', () => {
  assert.deepEqual(A.list().map((a) => a.id), ['16:9', '9:16']);
  assert.deepEqual(A.list({ enabledOnly: true }).map((a) => [a.id, a.default]), [['16:9', true], ['9:16', false]]);
  const v = A.list().find((a) => a.id === '9:16');
  assert.deepEqual(Object.keys(v).sort(), ['default', 'enabled', 'id', 'kinds', 'min_font_px', 'presets', 'safe', 'size', 'target_s', 'token']);
  assert.deepEqual([v.size, v.token, v.target_s, v.min_font_px], [[1080, 1920], '9x16', [30, 60], 28]);
  assert.equal(A.list().find((a) => a.id === '16:9').safe, null);
  assert.equal(A.get('4:5'), null); assert.equal(A.get(null), null);
  const g = A.get('9:16'); g.size[0] = 1; g.safe.hard[0] = 0;
  assert.deepEqual(A.get('9:16').size, [1080, 1920]); assert.equal(A.get('9:16').safe.hard[0], 60);
  assert.equal(A.token('16:9'), '16x9'); assert.equal(A.token('9:16'), '9x16'); assert.equal(A.token('1:1'), null);
  assert.deepEqual(A.presetsOf('9:16').map((p) => p.id), ['yt_shorts', 'fb_reels', 'tiktok']);
  const yt = A.presetsOf('9:16')[0];
  assert.deepEqual(yt, { id: 'yt_shorts', aspect: '9:16', platform: 'youtube', max_s: 180, cover: 'upload_desktop|frame', source: 'Y1', source_url: 'https://support.google.com/youtube/answer/15424877', checked: '2026-10-29', verified: true });
  assert.deepEqual(A.presetsOf('9:16')[2].grid_crop, [3, 4]);
  assert.deepEqual(A.presetsOf('16:9'), [{ id: 'yt_long', aspect: '16:9', platform: 'youtube', max_s: null, cover: 'upload', source: null, source_url: null, checked: null, verified: null }]);
  assert.deepEqual(A.presetsOf('x'), []);
  assert.deepEqual(A.fit('9:16', 48.2), { yt_shorts: { ok: true, max_s: 180 }, fb_reels: { ok: true, max_s: null }, tiktok: { ok: true, max_s: 1800 } });
  assert.deepEqual(A.fit('9:16', 180), { yt_shorts: { ok: true, max_s: 180 }, fb_reels: { ok: true, max_s: null }, tiktok: { ok: true, max_s: 1800 } }, 'đúng 180 s vẫn là Shorts');
  assert.deepEqual(A.fit('9:16', 191).yt_shorts, { ok: false, max_s: 180 });
  assert.deepEqual(A.fit('9:16', 2000), { yt_shorts: { ok: false, max_s: 180 }, fb_reels: { ok: true, max_s: null }, tiktok: { ok: false, max_s: 1800 } });
  assert.deepEqual(A.fit('16:9', 9999), { yt_long: { ok: true, max_s: null } });
  assert.deepEqual(A.thumbSizes('16:9'), [[1280, 720], [1920, 1080]]);
  assert.deepEqual(A.thumbSizes('16:9'), thumb.RULES.sizes.map((s) => s.slice()), 'cùng RULES.sizes hiện có của render/thumb.js (A3 chuyển RULES.sizes sang đọc hàm này)');
  assert.deepEqual(A.thumbSizes('9:16'), [[720, 1280], [1080, 1920]]);
  assert.equal(A.thumbSizes('1:1'), null);
});

test('thumbSupported: theo mẫu ảnh bìa cùng tỉ lệ (mẫu không khai aspect ⇒ 16:9); có mẫu dọc (A3: v-host-top, v-big-visual) ⇒ 9:16 true; gỡ mẫu dọc ⇒ false (đường L-MID)', () => {
  assert.equal(A.thumbSupported('16:9'), true);
  assert.equal(A.thumbSupported('9:16'), true, 'A3: render/thumbs/templates.json có mẫu dọc');
  assert.equal(A.thumbSupported('9:16', [{ id: 'a' }]), false, 'chỉ mẫu cũ ⇒ L-MID');
  assert.equal(A.thumbSupported('9:16', [{ id: 'a' }, { id: 'v', aspect: '9:16' }]), true);
  assert.equal(A.thumbSupported('9:16', { templates: [{ id: 'v', aspect: '9:16' }] }), true);
  assert.equal(A.thumbSupported('16:9', [{ id: 'v', aspect: '9:16' }]), false);
  assert.equal(A.thumbSupported('4:5', [{ id: 'v', aspect: '4:5' }]), false, 'tỉ lệ không có trong dữ liệu');
});

test('resolve §3.3: thứ tự lesson → lệnh → (version trước) → kênh → mặc định; mismatch / unsupported / kind (lỗi hoặc rơi về) đủ nhánh', () => {
  const R = (o) => A.resolve(o);
  assert.deepEqual(R({}), { aspect: '16:9', source: 'default', warnings: [] });
  assert.deepEqual(R({ lesson: { aspect: '9:16' } }), { aspect: '9:16', source: 'lesson', warnings: [] });
  assert.deepEqual(R({ lesson: { aspect: '9:16' }, workOrder: { aspect: '9:16' }, channelData: { default_aspect: '16:9' } }), { aspect: '9:16', source: 'lesson', warnings: [] });
  assert.deepEqual(R({ lesson: {}, workOrder: { aspect: '9:16' } }), { aspect: '9:16', source: 'work_order', warnings: [] }, 'bài không gửi aspect ⇒ theo lệnh (CNS-330)');
  assert.deepEqual(R({ lesson: { aspect: null }, workOrder: { aspect: null }, channelData: { default_aspect: '9:16' } }), { aspect: '9:16', source: 'channel', warnings: [] });
  assert.deepEqual(R({ channelData: { aspect: '9:16' } }), { aspect: '9:16', source: 'channel', warnings: [] }, 'khoá cũ `aspect` của kênh là bí danh');
  assert.equal(R({ channelData: { default_aspect: '16:9', aspect: '9:16' } }).aspect, '16:9', 'default_aspect thắng bí danh');
  // update_lesson: kế thừa version trước; NULL cũ ⇒ 16:9 (không theo kênh); lệnh có aspect thắng kế thừa
  assert.deepEqual(R({ previous: { aspect: '9:16' }, channelData: { default_aspect: '16:9' } }), { aspect: '9:16', source: 'lesson', warnings: [], inherited: true });
  assert.deepEqual(R({ previous: { aspect: null }, channelData: { default_aspect: '9:16' } }), { aspect: '16:9', source: 'lesson', warnings: [], inherited: true });
  assert.deepEqual(R({ previous: { aspect: '16:9' }, workOrder: { aspect: '9:16' } }), { aspect: '9:16', source: 'work_order', warnings: [] });
  // lỗi
  assert.equal(codeOf(() => R({ lesson: { aspect: '16:9' }, workOrder: { aspect: '9:16', display_id: 'WO-0031' } })), 'aspect_mismatch');
  try { R({ lesson: { aspect: '16:9' }, workOrder: { aspect: '9:16', display_id: 'WO-0031' } }); } catch (e) { assert.equal(e.text_human, 'Lệnh WO-0031 yêu cầu 9:16, bài gửi 16:9.'); assert.deepEqual(e.detail, { work_order: 'WO-0031', expected: '9:16', got: '16:9' }); }
  assert.equal(codeOf(() => R({ lesson: { aspect: '4:5' } })), 'aspect_unsupported');
  try { R({ workOrder: { aspect: '1:1' } }); } catch (e) { assert.equal(e.code, 'aspect_unsupported'); assert.deepEqual(e.detail.enabled, ['16:9', '9:16']); }
  // kind: người chọn (bài/lệnh) ⇒ lỗi với lời §5.2; chỉ kênh/mặc định ⇒ rơi về tỉ lệ đầu tiên hỗ trợ + cảnh báo
  assert.equal(codeOf(() => R({ lesson: { aspect: '9:16', kind: 'tutorial' } })), 'aspect_kind_unsupported');
  try { R({ workOrder: { aspect: '9:16' }, kind: 'tutorial' }); } catch (e) { assert.equal(e.code, 'aspect_kind_unsupported'); assert.equal(e.text_human, A.TUTORIAL_BLOCKED); assert.match(e.text_human, /chỉ dựng được khung 16:9/); }
  const fb = R({ channelData: { default_aspect: '9:16' }, kind: 'tutorial' });
  assert.equal(fb.aspect, '16:9'); assert.equal(fb.source, 'kind_fallback'); assert.deepEqual(fb.warnings.map((w) => w.code), ['aspect_kind_fallback']);
  assert.deepEqual(fb.warnings[0].detail, { from: '9:16', to: '16:9', kind: 'tutorial' });
  assert.equal(R({ lesson: { kind: 'tutorial' }, channelData: { default_aspect: '9:16' } }).source, 'kind_fallback', 'kind đọc từ lesson.kind');
  assert.deepEqual(R({ kind: 'tutorial' }), { aspect: '16:9', source: 'default', warnings: [] });
});

test('create(data): L-MIN (9:16 tắt) — list một tỉ lệ, bài/lệnh 9:16 bị từ chối, kênh 9:16 cũ rơi về 16:9 có cảnh báo; thiếu dữ liệu ⇒ lỗi có mã', () => {
  const d = copy(DATA); d.aspects['9:16'].enabled = false;
  const B = A.create(d);
  assert.deepEqual(B.list({ enabledOnly: true }).map((a) => a.id), ['16:9']);
  assert.deepEqual(B.catalog().aspects.map((a) => a.id), ['16:9']); assert.deepEqual(B.catalog().presets.map((p) => p.id), ['yt_long']);
  assert.equal(codeOf(() => B.resolve({ lesson: { aspect: '9:16' } })), 'aspect_unsupported');
  assert.equal(codeOf(() => B.resolve({ workOrder: { aspect: '9:16' } })), 'aspect_unsupported');
  const r = B.resolve({ channelData: { default_aspect: '9:16' } });
  assert.equal(r.aspect, '16:9'); assert.equal(r.source, 'default'); assert.deepEqual(r.warnings.map((w) => w.code), ['aspect_channel_unsupported']);
  assert.equal(B.get('9:16').enabled, false, 'get vẫn trả định nghĩa (bài cũ 9:16 vẫn đọc được)');
  const N = A.create(null);
  assert.equal(codeOf(() => N.list()), 'aspects_data_missing');
  assert.deepEqual(N.layoutVars(DATA.aspects['9:16'].layout), A.layoutVars(DATA.aspects['9:16'].layout), 'layoutVars không cần dữ liệu');
});

test('coverFrameMs = công thức cover.jpg của render.js: min(duration−1, beats[0].t_in + 1500)', () => {
  const formula = (plan) => Math.min(plan.duration_ms - 1, (plan.beats.length ? plan.beats[0].t_in : 0) + 1500);
  for (const name of Object.keys(golden.PLANS)) { const p = golden.PLANS[name](); assert.equal(A.coverFrameMs(p), formula(p), name); }
  assert.equal(A.coverFrameMs({ duration_ms: 1000, beats: [{ t_in: 150 }] }), 999);
  assert.equal(A.coverFrameMs({ duration_ms: 9000, beats: [] }), 1500);
  // render.js: còn công thức tại chỗ (trước A2) hoặc đã gọi aspects.coverFrameMs (sau A2) — không được có công thức thứ ba
  const src = fs.readFileSync(path.join(ROOT, 'render', 'render.js'), 'utf8');
  assert.ok(/coverFrameMs\(/.test(src) || /first \+ 1500/.test(src), 'render.js phải dùng đúng công thức này');
});

test('sampleTimes trên plan 16:9 thật: tăng dần, cách ≥ 500 ms, ≤ 240; beat chỉ khi máy quay đứng yên, ngoài toàn cảnh; có thẻ kết; mọi câu có mốc', () => {
  const plan = golden.PLANS.lesson();
  const S = A.sampleTimes(plan), R = DATA.render.sampling;
  assert.ok(S.length > 5 && S.length <= R.max);
  for (let i = 1; i < S.length; i++) assert.ok(S[i].t - S[i - 1].t >= R.min_gap_ms, 'cách ≥ min_gap ' + JSON.stringify([S[i - 1], S[i]]));
  for (const s of S) {
    assert.ok(['line', 'beat', 'end'].includes(s.kind)); assert.ok(Number.isInteger(s.t) && s.t >= 0 && s.t < plan.duration_ms);
    for (const k of Object.keys(s)) assert.ok(['t', 'kind', 'line', 'beat', 'zone'].includes(k));
  }
  const ov = plan.beats.find((b) => b.block === 'lesson-map');
  const beats = S.filter((s) => s.kind === 'beat');
  assert.ok(beats.length >= 3, 'các khối trong vùng có mốc đã lắng');
  for (const s of beats) {
    const b = plan.beats.find((x) => x.id === s.beat);
    assert.equal(s.t, b.t_in + R.beat_settle_ms); assert.equal(s.zone, b.zone); assert.ok(s.t < ov.t_in, 'không đo khối trong toàn cảnh');
  }
  assert.deepEqual(S.filter((s) => s.kind === 'end').map((s) => s.beat), ['AUTO-end-card']);
  for (const l of plan.lines) assert.ok(S.some((s) => s.line === l.id), 'câu ' + l.id + ' có mốc đo phụ đề');
  assert.deepEqual(A.sampleTimes(plan), S, 'tất định');
});

test('sampleTimes: bỏ mốc khối khi máy quay đang lia / trong intro brand; gộp mốc gần; cắt ở 240', () => {
  const R = DATA.render.sampling;
  const base = {
    duration_ms: 20000, style: { brand: null },
    camera: [{ t: 0, x: 0, y: 0, z: 1.3 }, { t: 1000, x: 0, y: 0, z: 1 }, { t: 4000, x: 0, y: 0, z: 1.03 }, { t: 5500, x: 0, y: 2000, z: 1 }, { t: 20000, x: 0, y: 2000, z: 1 }],
    lines: [{ id: 'L1', a_ms: 1100, b_ms: 3000 }, { id: 'L2', a_ms: 3500, b_ms: 9000 }],
    beats: [
      { id: 'B0', block: 'title', zone: 'Z1', t_in: 0, t_out: 20000 },            // 1000: máy quay vừa tới (đoạn đẩy vào đã xong ở 1000) ⇒ đo
      { id: 'B1', block: 'stamp', zone: 'Z1', t_in: 2500, t_out: 20000 },         // 3500: trôi nhẹ DRIFT ⇒ coi như đứng yên ⇒ đo
      { id: 'B2', block: 'concept-chip', zone: 'Z2', t_in: 3800, t_out: 20000 },  // 4800: đang lia sang Z2 ⇒ bỏ
      { id: 'B3', block: 'prob-card', zone: 'Z2', t_in: 6000, t_out: 6500 },      // 7000 ≥ t_out (đã morph sang khối khác) ⇒ bỏ
      { id: 'B4', block: 'lesson-map', zone: null, t_in: 12000, t_out: 20000 },
      { id: 'B5', block: 'takeaway', zone: 'Z2', t_in: 12500, t_out: 20000 },     // 13500 trong toàn cảnh ⇒ bỏ
      { id: 'B6', block: 'end-card', zone: null, t_in: 19500, t_out: 20000 },     // thẻ kết: min(duration−1, t_in+1000)
    ],
  };
  const S = A.sampleTimes(base);
  assert.deepEqual(S.filter((s) => s.kind === 'beat').map((s) => s.beat), ['B0', 'B1']);
  assert.deepEqual(S.filter((s) => s.kind === 'end'), [{ t: 19999, kind: 'end', beat: 'B6' }]);
  // B0 ở 1000 trùng cửa sổ 500 ms với mốc câu L1 (1300) ⇒ giữ beat (ưu tiên cao hơn), mang theo câu đang hiện
  assert.deepEqual(S.find((s) => s.beat === 'B0'), { t: 1000, kind: 'beat', line: 'L1', beat: 'B0', zone: 'Z1' });
  // intro brand 2 s: không mốc nào trước 2000 (trừ thẻ kết)
  const br = Object.assign(copy(base), { style: { brand: { intro: { enabled: true, kind: 'logo-pop', duration_ms: 2000 } } } });
  assert.ok(A.sampleTimes(br).every((s) => s.t >= 2000));
  // intro tắt (kind none) ⇒ như không có
  const br0 = Object.assign(copy(base), { style: { brand: { intro: { enabled: true, kind: 'none', duration_ms: 2000 } } } });
  assert.deepEqual(A.sampleTimes(br0), S);
  // clip dài: ≤ max, giữ mọi beat/end, câu được tỉa đều
  const long = { duration_ms: 600000, style: { brand: null }, camera: [{ t: 0, x: 0, y: 0, z: 1 }, { t: 600000, x: 0, y: 0, z: 1 }], lines: [], beats: [] };
  for (let i = 0; i < 400; i++) long.lines.push({ id: 'L' + i, a_ms: i * 1500, b_ms: i * 1500 + 1200 });
  for (let i = 0; i < 20; i++) long.beats.push({ id: 'B' + i, block: 'title', zone: 'Z' + i, t_in: i * 29000 + 700, t_out: 600000 });
  const SL = A.sampleTimes(long);
  assert.equal(SL.length, R.max); assert.equal(SL.filter((s) => s.kind === 'beat').length, 20);
  for (let i = 1; i < SL.length; i++) assert.ok(SL[i].t > SL[i - 1].t);
});

test('layoutVars: 16:9 (legacy) không có biến mới; 9:16 đủ biến --lay-* cho sân khấu, giá trị từ dữ liệu', () => {
  assert.deepEqual(A.layoutVars(DATA.aspects['16:9'].layout), {}); assert.deepEqual(A.layoutVars(null), {}); assert.deepEqual(A.layoutVars(undefined), {});
  const v = A.layoutVars(DATA.aspects['9:16'].layout);
  assert.deepEqual(v, {
    '--lay-sub-top': '960px', '--lay-sub-left': '72px', '--lay-sub-maxw': '808px', '--lay-sub-font': '44px', '--lay-sub-tr-display': 'none',
    '--lay-actor-scale': 0.8, '--lay-actor-left-x': '40px', '--lay-actor-right-x': '680px', '--lay-actor-bottom': '260px',
    '--lay-logo-tl-x': '72px', '--lay-logo-tl-y': '300px', '--lay-logo-tr-x': '816px', '--lay-logo-tr-y': '300px',
    '--lay-chip-display': 'none', '--lay-lt-display': 'none',
    '--lay-end-top': '40%', '--lay-end-cx': '476px', '--lay-end-maxw': '800px',
  });
  for (const k of Object.keys(v)) assert.match(k, /^--lay-[a-z0-9-]+$/);
  const L = copy(DATA.aspects['9:16'].layout); L.subtitle.top = 900; L.lower_third = true;
  assert.equal(A.layoutVars(L)['--lay-sub-top'], '900px'); assert.equal(A.layoutVars(L)['--lay-lt-display'], 'block');
});

test('safeCheck S1–S6 (§6.2): ca dương/âm; chỉ xét khối của beat đang đo (vùng kề không làm trượt); không mẫu ⇒ unknown; 16:9 không áp', () => {
  const ok = (els, extra) => Object.assign({ t_ms: 1000, kind: 'line', els }, extra);
  const sub = { role: 'subtitle', box: [72, 960, 808, 120] };
  const run = (samples, d) => A.safeCheck('9:16', { duration_s: d === undefined ? 45 : d, samples });
  let r = run([ok([sub])]);
  assert.equal(r.result, 'pass'); assert.deepEqual(r.measure.violations, []); assert.deepEqual(r.measure.platform_fit, { yt_shorts: true, fb_reels: true, tiktok: true });
  assert.equal(r.measure.safe_ref, 'vertical-v1'); assert.equal(r.measure.samples, 1); assert.equal(r.measure.min_font_px, null);
  // S1 phụ đề tràn mép dưới, mỗi mục gộp theo câu + mép
  r = run([ok([{ role: 'subtitle', box: [72, 1380, 808, 120] }], { line: 'LN-0004' }), ok([{ role: 'subtitle', box: [72, 1380, 808, 120] }], { t_ms: 2000, line: 'LN-0004' })]);
  assert.equal(r.result, 'fail'); assert.deepEqual(r.measure.violations, [{ rule: 'S1', role: 'subtitle', t_ms: 1000, box: [72, 1380, 808, 120], edge: 'bottom', line: 'LN-0004', count: 2 }]);
  assert.equal(r.measure.text_human, 'Phụ đề câu LN-0004 chạm vùng caption của nền tảng (mép dưới).');
  // S2 logo góc phải dưới (bl/br chưa đổi góc), thẻ kết, chữ intro
  r = run([ok([{ role: 'logo', box: [912, 1700, 96, 72] }, { role: 'end_card', box: [40, 700, 900, 300] }, { role: 'intro', box: [100, 100, 800, 200] }])]);
  assert.deepEqual(r.measure.violations.map((v) => [v.rule, v.role, v.edge]), [['S2', 'logo', 'bottom'], ['S2', 'end_card', 'left'], ['S2', 'intro', 'top']]);
  // S3/S4: chỉ khối của beat đang đo (và cùng vùng) ở mốc beat; vùng kề ló mép, mốc câu (đang lia/toàn cảnh) không xét
  const beatS = (els) => ({ t_ms: 3000, kind: 'beat', beat: 'B2', zone: 'Z2', els: [sub].concat(els) });
  r = run([beatS([{ role: 'block', beat: 'B2', zone: 'Z2', box: [76, 420, 800, 456], font_px_min: 31 }, { role: 'block', beat: 'B1', zone: 'Z1', box: [-100, -900, 1300, 500], font_px_min: 10 }])]);
  assert.equal(r.result, 'pass'); assert.equal(r.measure.min_font_px, 31);
  r = run([beatS([{ role: 'block', beat: 'B3', zone: 'Z2', box: [-30, 420, 1140, 456], font_px_min: 20 }])]);
  assert.deepEqual(r.measure.violations.map((v) => [v.rule, v.beat, v.edge || v.font_px]), [['S3', 'B3', 'right'], ['S4', 'B3', 20]], 'khối cùng vùng cũng bị xét');
  assert.match(r.measure.text_human, /\(\+1 vi phạm khác\)$/);
  r = run([{ t_ms: 3000, kind: 'line', line: 'L1', els: [sub, { role: 'block', beat: 'B3', zone: 'Z2', box: [-300, 0, 1600, 900], font_px_min: 8 }] }]);
  assert.equal(r.result, 'pass', 'mốc câu không xét khối (S3/S4 chỉ ở mốc beat đã lắng)');
  // S5 chỉ cảnh báo: chữ ra ngoài vùng mềm (trong vùng cứng), đầu nhân vật dưới mép cứng
  r = run([ok([{ role: 'subtitle', box: [72, 1200, 808, 120] }, { role: 'actor_head', box: [40, 1300, 360, 170] }, { role: 'actor_head', box: [680, 1228, 360, 170] }], { line: 'L9' })]);
  assert.equal(r.result, 'pass'); assert.deepEqual(r.measure.warnings.map((w) => [w.rule, w.role, w.edge]), [['S5', 'subtitle', 'bottom'], ['S5', 'actor_head', 'bottom']]);
  // S6 thời lượng: chỉ cảnh báo + platform_fit
  r = run([ok([sub])], 191);
  assert.equal(r.result, 'pass'); assert.deepEqual(r.measure.platform_fit, { yt_shorts: false, fb_reels: true, tiktok: true });
  assert.deepEqual(r.measure.warnings, [{ rule: 'S6', preset: 'yt_shorts', duration_s: 191, max_s: 180 }, { rule: 'S6', duration_s: 191, target_s: [30, 60] }]);
  assert.deepEqual(run([ok([sub])], 20).measure.warnings, [{ rule: 'S6', duration_s: 20, target_s: [30, 60] }]);
  // unknown: không mẫu / mẫu hỏng ⇒ chặn
  assert.equal(run([]).result, 'unknown'); assert.equal(A.safeCheck('9:16', null).result, 'unknown');
  assert.equal(run([ok([{ role: 'subtitle', box: [1, 2, 3] }])]).result, 'unknown');
  assert.equal(A.safeCheck('4:5', { samples: [ok([sub])] }).result, 'unknown');
  // 16:9: không có vùng an toàn ⇒ không áp (G-SAFE không được gọi cho 16:9; gọi nhầm cũng không trượt)
  const r16 = A.safeCheck('16:9', { samples: [] });
  assert.equal(r16.result, 'pass'); assert.equal(r16.measure.applicable, false);
});

// ---------- fixture hợp đồng cho giao diện ----------
test('fixture api-aspects.json = catalog() (GET /api/aspects); blocks / thumbnail_templates đúng lược đồ', () => {
  const strip = (c) => Object.assign({}, c, { aspects: c.aspects.map((a) => { const o = Object.assign({}, a); delete o.blocks; delete o.thumbnail_templates; return o; }) });
  const fx = copy(API_FIX); delete fx._doc;
  assert.deepEqual(strip(fx), A.catalog(), 'sửa aspects.json ⇒ cập nhật fixture (giao diện đọc fixture này)');
  const names = require('../render/blocks/index.json').map((b) => b.name);
  for (const a of fx.aspects) {
    assert.ok(Array.isArray(a.blocks) && a.blocks.length && a.blocks.every((n) => names.includes(n)), a.id + ' blocks');
    assert.ok(Array.isArray(a.thumbnail_templates) && a.thumbnail_templates.every((n) => typeof n === 'string'));
  }
  assert.ok(!fx.aspects.find((a) => a.id === '9:16').blocks.some((n) => ['screen', 'cursor', 'focus', 'callout', 'keystroke'].includes(n)), 'khối tutorial không ở 9:16');
  const c = A.catalog({ blocksOf: (id) => ['x-' + id], templatesOf: () => [] });
  assert.deepEqual(c.aspects.map((a) => a.blocks), [['x-16:9'], ['x-9:16']]);
  assert.deepEqual(Object.keys(c).sort(), ['aspects', 'default', 'presets', 'version']);
});

test('fixture measure-safe.json: mỗi ca = đúng đầu ra safeCheck (pass, fail đủ S1–S6, unknown)', () => {
  assert.deepEqual(SAFE_FIX.cases.map((c) => c.name), ['pass', 'fail', 'unknown']);
  for (const c of SAFE_FIX.cases) {
    const r = A.safeCheck(c.aspect, c.input);
    assert.equal(r.result, c.result, c.name); assert.equal(r.result, c.name);
    assert.deepEqual(r.measure, c.measure, c.name);
  }
  const fail = SAFE_FIX.cases[1].measure;
  assert.deepEqual([...new Set(fail.violations.map((v) => v.rule))], ['S1', 'S2', 'S3', 'S4']);
  assert.deepEqual([...new Set(fail.warnings.map((v) => v.rule))], ['S5', 'S6']);
  for (const k of ['aspect', 'safe_ref', 'samples', 'min_font_px', 'violations', 'warnings', 'platform_fit', 'text_human']) assert.ok(k in fail, k);
});

// ---------- chạy được ngoài Node, không DOM ----------
test('aspects.js thuần: không đụng DOM; nạp được như script trình duyệt (UMD → GSAspects, dữ liệu từ GSAspectsData)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'render', 'aspects.js'), 'utf8'), code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/\b(document|window|getComputedStyle|getBoundingClientRect)\b/.test(code), 'không DOM');
  const ctx = { self: { GSAspectsData: copy(DATA) } };
  vm.runInNewContext(src, ctx);
  const G = ctx.self.GSAspects;
  assert.ok(G && typeof G.resolve === 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(G.list({ enabledOnly: true }))), A.list({ enabledOnly: true }));
  assert.equal(G.resolve({ workOrder: { aspect: '9:16' } }).aspect, '9:16');
  assert.equal(G.thumbSupported('9:16', [{ aspect: '9:16' }]), true);
  const ctx2 = { self: {} }; vm.runInNewContext(src, ctx2);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx2.self.GSAspects.layoutVars(DATA.aspects['9:16'].layout))), A.layoutVars(DATA.aspects['9:16'].layout));
  assert.throws(() => ctx2.self.GSAspects.list(), (e) => e.code === 'aspects_data_missing');
});
