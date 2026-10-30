// © 2026 Gen Labs — All rights reserved.
// Gói K — hạ tầng clip dài hai người dẫn (0.2.x): phụ đề `text` ≠ lời TTS `say`, động tác gói nhân vật theo câu (act/react/move), cỡ xuất 1280×720
// (CSS zoom + chụp 1:1), phụ đề to lật trang, khung nội dung máy quay, tắt toàn cảnh tự thêm, khối app-card, nguồn của compare-split, biểu tượng mới,
// và renderPlan mã hoá luồng theo đoạn khung (frameRange + videoOut) — ghép các đoạn ra đúng số khung.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const chromium = require('../render/chromium');
const { buildPlan, outputSize } = require('../render/engine/timeline');
const camera = require('../render/engine/camera');
const D = require('../render/engine/direct');
const registry = require('../render/blocks/registry');
const icons = require('../render/blocks/icons');
const app = require('../render/blocks/app-card');
const { openStage, renderPlan } = require('../render/render');
const { clipsOf } = require('../tools/blocks-preview');

const SKIP = chromium.find() ? false : 'không có Chromium';
const FF = spawnSync('ffmpeg', ['-version']).status === 0;
const L = (id, who, say, x) => Object.assign({ id, who, say }, x || {});
const LINES = [
  L('L1', 'CM-0002', 'Chết rồi, ây-giần vừa gửi nhầm khách!', { text: 'Chết rồi, agent vừa gửi nhầm khách!', act: { activity: 'wave', move: { from: 0, to: 600, ms: 500 } } }),
  L('L2', 'CM-0001', 'Khoan đã nào, lỗi ở cách giao việc.', { react: { who: 'CM-0002', motion: 'nod' } })
];
const BEATS = [{ id: 'B1', block: 'app-card', anchor: { line: 'L1', word: 'Chết' }, params: { app: 'Hộp thư', rows: [{ cells: ['Đến', 'Tuấn'] }], stamp: { text: 'GỬI NHẦM', at: { line: 'L1', word: 'nhầm' } } } }];
const plan0 = (x) => buildPlan(Object.assign({ lesson: { title: 'K', lines: LINES, beats: BEATS }, clips: clipsOf(LINES), aspect: '16:9', fps: 30 }, x || {}));

test('plan: text/act/react đi vào plan.lines; không khai thì không có khoá mới', () => {
  const p = plan0();
  assert.equal(p.lines[0].text, 'Chết rồi, agent vừa gửi nhầm khách!');
  assert.deepEqual(p.lines[0].act.move, { from: 0, to: 600, ms: 500 });
  assert.equal(p.lines[1].react.who, 'CM-0002');
  assert.equal('text' in p.lines[1], false, 'text trùng say ⇒ không ghi');
  assert.equal('output' in p, false); assert.equal('sub_px' in p.style, false);
  assert.ok(p.beats.some((b) => b.block === 'lesson-map'), 'mặc định vẫn tự thêm toàn cảnh');
});

test('plan: output 1280×720, phụ đề to lật trang, khung nội dung, tắt toàn cảnh', () => {
  const p = plan0({ output: [1280, 720], style: { sub_px: 46, sub_page: 66, sub_maxw: 1040 }, frame_box: [1060, 580], overview: false });
  assert.deepEqual(p.output, [1280, 720]); assert.deepEqual(p.size, [1920, 1080]);
  assert.equal(p.style.sub_px, 46); assert.equal(p.style.sub_page, 66); assert.equal(p.style.sub_maxw, 1040);
  assert.equal(p.beats.some((b) => b.block === 'lesson-map'), false);
  assert.equal(outputSize([1920, 1080], [1920, 1080]), null, 'trùng cỡ thiết kế ⇒ không khoá');
  assert.throws(() => outputSize([2560, 1440], [1920, 1080]), /chỉ thu nhỏ/);
  assert.throws(() => outputSize([1280, 1024], [1920, 1080]), /tỉ lệ/);
  assert.throws(() => plan0({ frame_box: [100, 100] }), /frame_box/);
  // khung nhỏ hơn ⇒ máy quay lùi xa hơn (z nhỏ hơn) cho cùng vùng
  const z = { cx: 1000, cy: 600, w: 1320, h: 640 };
  assert.ok(camera.frameOf(z, null, [1060, 580]).z < camera.frameOf(z, null).z);
  assert.equal(camera.frameOf(z, null).z, camera.frameOf(z, null, [1340, 660]).z, 'mặc định giữ 1340×660');
});

test('đạo diễn: act (người nói) + move, react (người nghe), dx chỉ khi khác 0', () => {
  const p = plan0(), dir = D.makeDirector(p), l1 = p.lines[0], l2 = p.lines[1];
  const a = dir.act('CM-0002', l1.a_ms + 50);
  assert.equal(a.director.activity, 'wave');
  assert.ok(a.dx > 0 && a.dx < 600);
  assert.equal(dir.act('CM-0002', l1.a_ms + 520).dx, 600);
  assert.equal(dir.act('CM-0001', l2.a_ms + 100).dx, undefined, 'người không có move ⇒ không khoá dx');
  assert.equal(dir.act('CM-0002', l2.a_ms + 300).director.motion, 'nod', 'react của câu L2 áp cho Vy');
  assert.equal(dir.act('CM-0001', l1.a_ms + 300).director.activity, undefined, 'act không lan sang người khác');
});

test('app-card: lược đồ, kiểm chéo dòng/công tắc/ô lệnh, mốc và nhịp', () => {
  assert.ok(registry.validate('app-card', BEATS[0].params).ok);
  assert.deepEqual(app.check({ app: 'x', rows: [{ cells: ['a'] }], toggles: [{ row: 0, on: true }] }), ['params.toggles[0].row: dòng 0 không có công tắc']);
  assert.match(app.check({ app: 'x', rows: [{ cells: ['a'] }], marks: [{ row: 3 }] })[0], /chỉ có 1 dòng/);
  assert.match(app.check({ app: 'x', typing_at: 1 })[0], /cần ô lệnh/);
  assert.match(app.check({ app: 'x', rows: [{ cells: ['a'] }], reveal: { row: 0 } })[0], /chữ ẩn/);
  const p = { app: 'x', input: { text: 'abcdefghijklmnop', files: ['a.xlsx'] }, rows: [{ cells: ['a'], toggle: true }], toggles: [{ row: 0, on: true, at: 3 }], stamp: { text: 'OK', at: 4 } };
  assert.equal(app.cues(p).length, 13);
  const T = app.timing(p, [1, null, null, 4, null, null, null, null, 3, null, null, null, 0.5]);
  assert.equal(T.typeA, 1); assert.equal(T.typeB, 2); assert.equal(T.send, 2.5); assert.equal(T.files, 0.5); assert.deepEqual(T.toggles, [3]);
  assert.ok(T.end >= 4 + 1.2);
  assert.ok(app.footprint('16:9', p).h > app.footprint('16:9', { app: 'x' }).h);
  const s = app.sfxTimed(p, null).map((x) => x.name); assert.ok(s.includes('wham') && s.includes('tick') && s.includes('swish'));
});

test('compare-split: dòng nguồn tăng chiều cao; biểu tượng mới có trong bộ (không asset ngoài)', () => {
  const cs = registry.get('compare-split'), p = { panels: [{ art: 'scissors' }, { art: 'mask' }] };
  assert.ok(registry.validate('compare-split', Object.assign({ source: 'Nguồn: X (2025)' }, p)).ok);
  assert.ok(cs.footprint('16:9', Object.assign({ source: 'x' }, p)).h > cs.footprint('16:9', p).h);
  ['scissors', 'salt', 'ladle', 'mask', 'house', 'boba', 'drive', 'ruler'].forEach((n) => { assert.ok(icons.has(n), n); assert.match(icons.svg(n), /^<svg class="gi"/); assert.doesNotMatch(icons.svg(n), /href|<image|url\(/); });
  assert.deepEqual(cs.assetsOf(p), [], 'biểu tượng không phải asset');
});

test('sân khấu: phụ đề hiện `text`, cỡ xuất 1280 ⇒ zoom 2/3, actor lệch theo move; tất định khi tua', { skip: SKIP, timeout: 120000 }, async () => {
  const p = plan0({ output: [1280, 720], style: { sub_px: 46, sub_page: 30 }, overview: false }), errors = [];
  const st = await openStage({ width: 1280, height: 720, errors });
  try {
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p, { fontCss: '' })) + ')');
    const t = p.lines[0].a_ms + 300;
    await st.ev('window.__seek(' + t + ')');
    assert.match(await st.ev('document.getElementById("sub").textContent'), /agent/);
    assert.doesNotMatch(await st.ev('document.getElementById("sub").textContent'), /ây-giần/);
    assert.ok(Math.abs(+(await st.ev('document.getElementById("stage").style.zoom')) - 1280 / 1920) < 1e-4);
    assert.equal(await st.ev('getComputedStyle(document.getElementById("stage")).getPropertyValue("--sub-size").trim()'), '46px');
    // so phần ĐANG HIỆN (như k-blocks-render: khối chưa tới giờ bị ẩn bằng visibility, giữ thuộc tính cũ — không phải lỗi)
    const vis = '(function(){var c=document.getElementById("stage").cloneNode(true);[].forEach.call(c.querySelectorAll("[style*=\\"visibility: hidden\\"]"),function(e){e.remove();});return c.outerHTML;})()';
    const h1 = await st.ev(vis);
    await st.ev('window.__seek(' + (p.duration_ms - 100) + ')'); await st.ev('window.__seek(' + t + ')');
    assert.equal(await st.ev(vis), h1, 'tua tới rồi lùi: DOM y hệt');
    const shot = await st.shot('png');
    assert.equal(shot.readUInt32BE(16), 1280); assert.equal(shot.readUInt32BE(20), 720);
    assert.deepEqual(errors, []);
  } finally { await st.close(); }
});

test('renderPlan: frameRange + videoOut ⇒ 2 đoạn H.264 1280×720, ghép đủ khung, không ghi khung ra đĩa', { skip: SKIP || (!FF && 'không có ffmpeg'), timeout: 240000 }, async () => {
  const p = plan0({ output: [1280, 720] }), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-long-')), N = Math.ceil(p.duration_ms / 1000 * 30), mid = Math.floor(N / 2);
  try {
    const segs = [];
    for (const [i, r] of [[0, mid], [mid, N]].entries()) {
      const out = path.join(dir, 's' + i + '.mp4');
      const res = await renderPlan({ plan: p, outDir: path.join(dir, 'w' + i), ffmpegPath: 'ffmpeg', fontCss: '', videoOut: out, frameRange: r, chromiumArgs: ['--disable-partial-raster'] });
      assert.equal(res.framesPattern, null); assert.equal(res.frames, r[1] - r[0]); assert.deepEqual(res.errors, []);
      assert.equal(fs.readdirSync(path.join(dir, 'w' + i, 'frames')).length, 0, 'không có JPEG khung trên đĩa');
      segs.push(out);
    }
    fs.writeFileSync(path.join(dir, 'l.txt'), segs.map((s) => "file '" + s + "'").join('\n'));
    const cat = path.join(dir, 'all.mp4');
    assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'l.txt'), '-c', 'copy', cat]).status, 0);
    const pr = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', cat], { encoding: 'utf8' }).stdout.trim();
    assert.equal(pr, '1280,720,' + N);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sân khấu: pose_fade_ms hoà tư thế cũ khi đổi động tác, hết hạn thì ẩn; tắt ⇒ cấu trúc nhân vật như cũ', { skip: SKIP, timeout: 120000 }, async () => {
  const errors = [], st = await openStage({ width: 1920, height: 1080, errors });
  try {
    const p = plan0({ style: { pose_fade_ms: 200 }, overview: false }), l1 = p.lines[0];
    assert.equal(p.style.pose_fade_ms, 200);
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p, { fontCss: '' })) + ')');
    const vy = 'document.querySelectorAll(".actor")[1]';
    await st.ev('window.__seek(' + (l1.b_ms + 40) + ')');   // Vy vừa thôi "wave"
    assert.equal(await st.ev(vy + '.children.length'), 2);
    const op = +(await st.ev(vy + '.children[1].style.opacity'));
    assert.ok(op > 0.2 && op < 1, 'tư thế cũ đang mờ dần: ' + op);
    await st.ev('window.__seek(' + (l1.b_ms + 400) + ')');
    assert.equal(await st.ev(vy + '.children[1].style.visibility'), 'hidden');
    const p0 = plan0({ overview: false });
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p0, { fontCss: '' })) + ')');
    await st.ev('window.__seek(' + (l1.b_ms + 40) + ')');
    assert.equal(await st.ev(vy + '.firstElementChild.tagName.toLowerCase()'), 'svg', 'không bật ⇒ SVG nằm thẳng trong .actor như cũ');
    assert.deepEqual(errors, []);
  } finally { await st.close(); }
});

test('plan: lead_ms, world_pitch (vùng cách xa hơn), camera_pace (lia chậm hơn) — thiếu thì như cũ; sai thì báo lỗi', () => {
  const two = BEATS.concat([{ id: 'B2', block: 'concept-chip', anchor: { line: 'L2', word: 'Khoan' }, params: { text: 'Lỗi ở cách giao việc' } }]);
  const mk = (x) => buildPlan(Object.assign({ lesson: { title: 'K', lines: LINES, beats: two }, clips: clipsOf(LINES), aspect: '16:9', fps: 30, overview: false }, x || {}));
  const a = mk(), b = mk({ lead_ms: 400, world_pitch: [2500, 1500], camera_pace: { min_ms: 1100, max_ms: 2000 } });
  assert.equal(a.lines[0].a_ms, 1100); assert.equal(b.lines[0].a_ms, 400);
  const dx = (p) => p.style.zones[1].cx - p.style.zones[0].cx;
  assert.equal(dx(a), 1700); assert.equal(dx(b), 2500);
  const dur = (p) => { const k = p.camera; let best = 0; for (let i = 1; i < k.length; i++) if (Math.abs(k[i].x - k[i - 1].x) > 100) best = Math.max(best, k[i].t - k[i - 1].t); return best; };
  assert.ok(dur(b) >= 1100, 'lia ≥ min_ms: ' + dur(b));
  assert.throws(() => mk({ world_pitch: [100, 100] }), /world_pitch/);
  assert.throws(() => mk({ camera_pace: { min_ms: 2000, max_ms: 1000 } }), /camera_pace/);
  // cut_px: quãng xa ⇒ cắt thẳng (2 keyframe cách 1 ms) đúng 1 khung trước khi khối vùng mới vào; không lia qua giấy trống
  const c = mk({ camera_pace: { min_ms: 700, max_ms: 1200, cut_px: 700 } }), k = c.camera;
  const cut = k.findIndex((q, i) => i > 0 && Math.abs(q.x - k[i - 1].x) > 100);
  assert.ok(cut > 0 && k[cut].t - k[cut - 1].t <= 1, 'cắt cảnh: ' + JSON.stringify(k.slice(cut - 1, cut + 1)));
  assert.equal(k[cut].t, c.beats.find((b) => b.id === 'B2').t_in - 33);
  assert.throws(() => mk({ camera_pace: { min_ms: 700, max_ms: 1200, cut_px: 10 } }), /cut_px/);
  // tail_ms: màn kết giữ lâu hơn sau câu cuối
  const t = mk({ tail_ms: 8000 }); assert.equal(t.duration_ms - a.duration_ms, 8000 - 3600);
  assert.throws(() => mk({ tail_ms: 50 }), /tail_ms/);
});

test('sticky-tracker: `slot` đặt cụm vào đúng dòng, cụm không khai slot lấp dòng trống đầu tiên; chỉ dùng với add', () => {
  const st = registry.get('sticky-tracker'), B = (id, t, params) => ({ id, block: 'sticky-tracker', t_in: t, params });
  const plan = { beats: [B('a', 0, { action: 'show' }), B('b', 1, { action: 'add', text: 'RÕ VIỆC' }), B('c', 2, { action: 'add', text: 'MÌNH DUYỆT', slot: 3 }), B('d', 3, { action: 'add', text: 'ĐỦ ĐỒ' }), B('e', 4, { action: 'review' })] };
  assert.equal(st.stateOf(plan, plan.beats[2]).mine, 3);
  assert.equal(st.stateOf(plan, plan.beats[3]).mine, 1);
  const L = st.stateOf(plan, plan.beats[4]).lines;
  assert.equal(L[0], 'RÕ VIỆC'); assert.equal(L[1], 'ĐỦ ĐỒ'); assert.equal(L[2], undefined); assert.equal(L[3], 'MÌNH DUYỆT');
  assert.deepEqual(st.check({ action: 'show', slot: 1 }), ['params.slot: chỉ dùng với action "add"']);
});

test('sticky-tracker review: mốc lật ngược thứ tự dòng (ôn khác thứ tự gieo) giữ đúng lời; theo thứ tự thì vẫn giãn ≥ 0,35 s', () => {
  const st = registry.get('sticky-tracker');
  const T = st.timing({ action: 'review' }, [null, 2.0, 9.0, 4.0, 6.0]);
  assert.deepEqual(T.flips.slice(0, 4), [2.0, 9.0, 4.0, 6.0]);
  assert.deepEqual(st.timing({ action: 'review' }, [null, 0.2, 0.3, 5, 5.1]).flips.slice(0, 4).map((x) => +x.toFixed(2)), [1.6, 1.95, 5, 5.35]);
});

test('plan v5: frame_box [w,h,trần zoom,lệch dọc,lệch ngang], style chip/sub_dim/sticky_scale/talk_lean_px/text_floor (chỉ khi khai)', () => {
  const z = { cx: 1000, cy: 600, w: 1000, h: 500 };
  assert.ok(camera.frameOf(z, null, [1240, 620, 1.4]).z > 1.05, 'trần zoom nâng được');
  assert.equal(camera.frameOf(z, null, [1240, 620]).z, 1.05, 'thiếu trần ⇒ 1,05 như cũ');
  const f = camera.frameOf(z, null, [1000, 600, 1.2, 10, 80]);
  assert.equal(f.x, 1080); assert.equal(f.y, 610);
  assert.throws(() => plan0({ frame_box: [1000, 600, 3] }), /frame_box/);
  assert.throws(() => plan0({ frame_box: [1000, 600, 1.2, 10, 900] }), /frame_box/);
  const p = plan0({ style: { chip: false, sub_dim: 0.8, sticky_scale: 1.25, talk_lean_px: 25, text_floor: true } });
  assert.deepEqual([p.style.chip, p.style.sub_dim, p.style.sticky_scale, p.style.talk_lean_px, p.style.text_floor], [false, 0.8, 1.25, 25, true]);
  const q = plan0({ style: { sub_dim: 5, sticky_scale: 9 } });
  assert.equal('sub_dim' in q.style, false); assert.equal('sticky_scale' in q.style, false); assert.equal('chip' in q.style, false);
  ['switchboard', 'secretary', 'stove', 'saltpour', 'taster', 'tailor', 'robotdesk'].forEach((n) => assert.ok(icons.has(n), n));
});

test('sân khấu v5: text_floor ⇒ lớp .tf (sàn chữ), chip ẩn, người nói nhích về giữa khi nói, giấy nhớ phóng theo sticky_scale', { skip: SKIP, timeout: 120000 }, async () => {
  const beats = BEATS.concat([{ id: 'S0', block: 'sticky-tracker', anchor: { line: 'L1', word: 'Chết' }, params: { action: 'show' } }]);
  const p = buildPlan({ lesson: { title: 'K', lines: LINES, beats }, clips: clipsOf(LINES), aspect: '16:9', fps: 30, overview: false,
    style: { chip: false, sub_dim: 0.8, sticky_scale: 1.4, talk_lean_px: 50, text_floor: true } }), errors = [];
  const st = await openStage({ width: 1920, height: 1080, errors });
  try {
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p, { fontCss: '' })) + ')');
    assert.equal(await st.ev('document.getElementById("stage").classList.contains("tf")'), true);
    assert.equal(await st.ev('document.getElementById("chipTop").style.display'), 'none');
    const l2 = p.lines[1], nhi = 'document.querySelectorAll(".actor")[0].style.transform';
    await st.ev('window.__seek(' + (l2.a_ms - 900) + ')'); const before = await st.ev(nhi);
    await st.ev('window.__seek(' + (l2.a_ms + 400) + ')'); const during = await st.ev(nhi);
    assert.match(before, /^translate\(0px/); assert.match(during, /^translate\(50px/, 'Nhi (trái) nhích 50 px sang phải khi nói: ' + during);
    await st.ev('window.__seek(' + (p.lines[0].a_ms + 1500) + ')');
    assert.match(await st.ev('document.querySelector(".b-sticky .sk-n").style.transform'), /scale\(1\.4\)/);
    assert.deepEqual(errors, []);
  } finally { await st.close(); }
});

test('exit_ms: thẻ mờ + trượt ra trước lúc máy quay rời vùng, rồi ẩn — không biến mất trong 1 khung; thiếu thì như cũ; sai thì báo lỗi', { skip: SKIP, timeout: 120000 }, async () => {
  const two = BEATS.concat([{ id: 'B2', block: 'concept-chip', anchor: { line: 'L2', word: 'Khoan' }, params: { text: 'Lỗi ở cách giao việc' } }]);
  const mk = (x) => buildPlan(Object.assign({ lesson: { title: 'K', lines: LINES, beats: two }, clips: clipsOf(LINES), aspect: '16:9', fps: 30, overview: false, camera_pace: { min_ms: 700, max_ms: 1200, cut_px: 700 } }, x || {}));
  const a = mk(), p = mk({ exit_ms: 250 });
  assert.equal(a.beats[0].t_leave, undefined); assert.equal(a.style.exit_ms, undefined);
  const b1 = p.beats.find((b) => b.id === 'B1'), b2 = p.beats.find((b) => b.id === 'B2');
  assert.equal(b1.t_leave, b2.t_in - 33, 'rời vùng đúng lúc cắt cảnh'); assert.equal(b2.t_leave, undefined, 'vùng cuối ở lại');
  assert.throws(() => mk({ exit_ms: 50 }), /exit_ms/);
  assert.throws(() => buildPlan({ lesson: { title: 'K', lines: LINES, beats: two }, clips: clipsOf(LINES), aspect: '16:9', fps: 30, exit_ms: 250 }), /exit_ms/);
  const errors = [], st = await openStage({ width: 1920, height: 1080, errors });
  try {
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p, { fontCss: '' })) + ')');
    const probe = '(function(){var e=document.querySelector(".b-app"),f="";for(var x=e;x&&x.id!=="stage";x=x.parentElement)if(x.style.filter){f=x.style.filter;break;}var m=/opacity\\(([\\d.]+)\\)/.exec(f);return JSON.stringify({o:m?+m[1]:1,v:getComputedStyle(e).visibility});})()';
    const at = async (t) => { await st.ev('window.__seek(' + t + ')'); return JSON.parse(await st.ev(probe)); };
    const frames = []; for (let t = b1.t_leave - 400; t < b1.t_leave + 100; t += 1000 / 30) frames.push(await at(Math.round(t)));
    const shown = frames.filter((f) => f.v === 'visible');
    assert.ok(shown.length >= 8, 'thẻ còn hiện trước lúc rời');
    for (let i = 1; i < shown.length; i++) assert.ok(shown[i].o <= shown[i - 1].o + 1e-6, 'độ đục giảm dần');
    assert.ok(shown[shown.length - 1].o < 0.15, 'khung cuối trước khi ẩn đã gần trong suốt: ' + shown[shown.length - 1].o);
    assert.equal(frames[frames.length - 1].v, 'hidden');
    const mid = await at(b1.t_leave - 125); assert.ok(mid.o > 0.2 && mid.o < 0.8, 'giữa lúc ra: ' + mid.o);
    assert.equal((await at(b1.t_leave - 600)).o, 1, 'tua lùi ⇒ hiện lại nguyên vẹn (tất định)');
    assert.deepEqual(errors, []);
  } finally { await st.close(); }
});

test('shot: bố cục cảnh (dialogue/side/demo/closeup) đặt lại người dẫn, chuyển cảnh nội suy (không nhảy khung), nền giấy che thẻ ở dialogue/closeup; tất định', { skip: SKIP, timeout: 120000 }, async () => {
  const sh = registry.get('shot');
  assert.ok(registry.validate('shot', { kind: 'closeup', host: 'CM-0002' }).ok);
  assert.equal(registry.validate('shot', { kind: 'zoom' }).ok, false);
  const plan = { actors: [{ id: 'A' }, { id: 'B' }] };
  const tg = sh.targets(plan, { kind: 'closeup', host: 'B' });
  assert.ok(tg.actors.B.s > 2 && tg.actors.B.cx === 960 && tg.actors.A.cx < 0 && tg.bd === 1, 'cận mặt B, A ra khỏi khung');
  assert.equal(sh.targets(plan, { kind: 'normal' }).actors.A, null);
  const beats = BEATS.concat([{ id: 'S1', block: 'shot', anchor: { line: 'L1', word: 'Chết' }, params: { kind: 'dialogue' } },
    { id: 'S2', block: 'shot', anchor: { line: 'L2', word: 'Khoan' }, params: { kind: 'closeup', host: 'CM-0001', dur_s: 0.4 } }]);
  const p = buildPlan({ lesson: { title: 'K', lines: LINES, beats }, clips: clipsOf(LINES), aspect: '16:9', fps: 30, overview: false }), errors = [];
  const s2 = p.beats.find((b) => b.id === 'S2');
  const st = await openStage({ width: 1920, height: 1080, errors });
  try {
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p, { fontCss: '' })) + ')');
    const nhi = 'document.querySelectorAll(".actor")[0]';   // CM-0001 = người đầu của cast
    const scale = async (t) => { await st.ev('window.__seek(' + t + ')'); const m = /scale\(([\d.]+)\)/.exec(await st.ev(nhi + '.style.transform')); return m ? +m[1] : NaN; };
    const seq = []; for (let t = s2.t_in - 100; t <= s2.t_in + 500; t += 1000 / 30) seq.push(await scale(Math.round(t)));
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] - seq[i - 1] < 0.6, 'không nhảy khung: ' + seq.join(','));
    assert.ok(seq[seq.length - 1] > seq[0] * 1.5, 'cận mặt to hơn hẳn cảnh đối thoại');
    const bd = '(function(){var o=0;document.querySelectorAll(".b-shot .sh-bd").forEach(function(e){if(getComputedStyle(e.parentElement).visibility!=="hidden")o=Math.max(o,+e.style.opacity||0);});return o;})()';
    await st.ev('window.__seek(' + (s2.t_in + 600) + ')'); assert.equal(+(await st.ev(bd)), 1);
    const a1 = await st.ev(nhi + '.style.transform');
    await st.ev('window.__seek(' + (p.duration_ms - 50) + ')'); await st.ev('window.__seek(' + (s2.t_in + 600) + ')');
    assert.equal(await st.ev(nhi + '.style.transform'), a1, 'tua tới rồi lùi: y hệt');
    assert.deepEqual(errors, []);
  } finally { await st.close(); }
});

test('sub_clause: phụ đề lật trang ở ranh giới vế câu, không trang mồ côi một chữ; thiếu thì như cũ', { skip: SKIP, timeout: 120000 }, async () => {
  const say = 'Đó là cụm thứ hai: Vị đúng. Nói rõ thế nào là đúng, nó tự nếm, nhưng lần nếm cuối là của mình.';
  const lines = [L('L1', 'CM-0001', say)];
  const mk = (st) => buildPlan({ lesson: { title: 'K', lines, beats: [] }, clips: clipsOf(lines), aspect: '16:9', fps: 30, overview: false, style: Object.assign({ sub_page: 40 }, st) });
  assert.equal(mk({}).style.sub_clause, undefined); const p = mk({ sub_clause: true }); assert.equal(p.style.sub_clause, true);
  const st = await openStage({ width: 1920, height: 1080, errors: [] });
  try {
    await st.ev('window.__load(' + JSON.stringify(Object.assign({}, p, { fontCss: '' })) + ')');
    const l = p.lines[0], pages = [];
    for (let t = l.a_ms; t <= l.b_ms; t += 50) { await st.ev('window.__seek(' + t + ')'); const tx = (await st.ev('[].map.call(document.querySelectorAll("#sub .c"),function(e){return e.textContent}).join(" ")')); if (pages[pages.length - 1] !== tx) pages.push(tx); }
    assert.ok(pages.length >= 2, pages.join(' | '));
    pages.forEach((pg, i) => { assert.ok(pg.split(' ').length > 1, 'mồ côi: ' + pg); if (i < pages.length - 1) assert.match(pg, /[,.:;!?]$/, 'ngắt giữa vế: ' + pages.join(' | ')); });
  } finally { await st.close(); }
});
