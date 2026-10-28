// © 2026 Gen Labs — All rights reserved.
// Gói U — G-CURSOR (SPEC-0.2.0 §6.8): ca dương (plan biên dịch đúng ⇒ C1–C9 đạt) và ca âm F4-3 / F4-8 — mỗi ca phải trượt ĐÚNG mục C:
// đích ngoài khung (C2), nhảy cóc 300 px (C4), bấm khi đang di (C5), chú thích tràn mép (C7), phóng 3× ảnh 1440 (C8), bước cách 6 s (C9), gợn sóng bị ẩn trên MP4 (C10).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildPlan } = require('../render/engine/timeline');
const { gateCursor, checkPlan, deltaE, lab, hexRgb } = require('../media/gates/cursor');
const { MINI_SCREENS } = require('./g-tutorial-fixtures');

const say = (n, w = 'chữ') => Array.from({ length: n }, (_, i) => w + i).join(' ');
const clip = (s) => ({ duration_ms: Math.max(4, Math.ceil(s.length / 3)) * 220 });
// bài 1 người nói, host PiP; beats neo theo chỉ số chữ của câu
function planOf({ lines, beats, screens = MINI_SCREENS, variant = 'full' }) {
  const L = lines.map((s, i) => ({ id: 'LN-' + (i + 1), who: 'CM-0001', say: s }));
  const clips = {}; L.forEach(l => { clips[l.id] = clip(l.say); });
  return buildPlan({ kind: 'tutorial', variant, clips, cast: { 'CM-0001': { name: 'Vy' } },
    lesson: { title: 'T', kind: 'tutorial', variant, lines: L, screens, host: { mode: 'pip' },
      beats: beats.map((b, i) => Object.assign({ id: 'BT-' + String(i + 1).padStart(4, '0') }, b, { anchor: { line: 'LN-' + (b.line + 1), word_index: b.w } })) } });
}
const LINES = [say(12), say(12), say(12)];
const OK_BEATS = [
  { block: 'screen', line: 0, w: 2, params: { screen: 'SC-1' } },
  { block: 'cursor', line: 0, w: 8, params: { action: 'click', target: 'in_name' } },
  { block: 'cursor', line: 1, w: 1, params: { action: 'type', target: 'in_name', text: 'Lớp AI' } },
  { block: 'focus', line: 1, w: 8, params: { target: 'btn_ok', callout: 'Lưu ở đây' } },
  { block: 'cursor', line: 2, w: 2, params: { action: 'click', target: 'btn_ok' } },
  { block: 'cursor', line: 2, w: 8, params: { action: 'click', target: 'tg_on' } },
];
const failed = (plan) => [...new Set(checkPlan(plan).V.map(v => v.check))].sort();
const clone = (x) => JSON.parse(JSON.stringify(x));

test('ca dương: plan biên dịch đúng ⇒ C1–C9 đạt; dry bỏ C10; measure có số đo từng mục', async () => {
  const plan = planOf({ lines: LINES, beats: OK_BEATS });
  assert.deepEqual(failed(plan), []);
  const g = await gateCursor({ plan, dry: true });
  assert.equal(g.result, 'pass', JSON.stringify(g.measure.violations));
  assert.equal(g.measure.checks.C10.skipped, 'dry'); assert.ok(g.measure.checks.C4.n > 100 && g.measure.checks.C3.n >= 4);
  assert.ok(g.measure.worst.jump_move <= 140 && g.measure.worst.gap_ms <= 4000);
  // không dry, không MP4 ⇒ unknown (INT-08: không cho qua ngầm)
  const g2 = await gateCursor({ plan });
  assert.equal(g2.result, 'unknown'); assert.match(g2.measure.text_human, /MP4/);
  const g3 = await gateCursor({ plan: { kind: 'lesson' } }); assert.equal(g3.result, 'unknown');
});

test('F4-3 C2: đích ngoài khung an toàn (sát mép dưới ảnh chụp) ⇒ trượt C2', () => {
  const shot = [{ id: 'SC-9', source: { asset: 'media/aa/' + 'a'.repeat(64) + '.png' }, size: [1280, 800], chrome: 'none', targets: { low: { x: 600, y: 772, w: 120, h: 26 } } }];
  const plan = planOf({ lines: LINES, screens: shot, beats: [{ block: 'screen', line: 0, w: 1, params: { screen: 'SC-9' } }, { block: 'cursor', line: 0, w: 8, params: { action: 'click', target: 'low' } }] });
  assert.ok(failed(plan).includes('C2'), failed(plan).join());
  assert.match(checkPlan(plan).V.find(v => v.check === 'C2').text, /khung an toàn/);
});

test('F4-3 C4: nhảy cóc 300 px ngoài đoạn di ⇒ trượt đúng C4', () => {
  const plan = planOf({ lines: LINES, beats: OK_BEATS }), p = clone(plan);
  const t = p.tutorial.steps[0].t + 900, k = p.cursor.keys;
  const at = require('../render/engine/cursor-path').sampleKeys(k, t);
  k.push({ t, x: at.x, y: at.y, kind: 'arrow', press: false }, { t: t + 1, x: at.x + 300, y: at.y, kind: 'arrow', press: false }, { t: t + 400, x: at.x + 300, y: at.y, kind: 'arrow', press: false });
  k.sort((a, b) => a.t - b.t);
  p.cursor.moves = p.cursor.moves.filter(m => !(m.t0 <= t + 400 && m.t1 >= t)); p.camera = p.camera.filter(c => c.t < t - 50 || c.t > t + 500);
  assert.ok(failed(p).includes('C4'), failed(p).join());
});

test('F4-3 C5: bấm khi đang di ⇒ trượt C5; C3: con trỏ lệch khỏi đích lúc bấm ⇒ trượt C3; C6: lệch neo > 100 ms; C1: đích không có', () => {
  const plan = planOf({ lines: LINES, beats: OK_BEATS });
  // C5: con trỏ còn rung 12 px trong 120 ms trước khi bấm (≤ 24 px/khung ⇒ không dính C4; vẫn trong đích ⇒ không dính C3)
  const p = clone(plan), s = p.tutorial.steps[3], at = require('../render/engine/cursor-path').sampleKeys(p.cursor.keys, s.t);
  p.cursor.keys = p.cursor.keys.filter(k => k.t <= s.t - 120 || k.t >= s.t).concat([{ t: s.t - 70, x: at.x + 12, y: at.y, kind: 'hand', press: false }]).sort((a, b) => a.t - b.t);
  assert.deepEqual(failed(p), ['C5']);
  // C3: dời cả rãnh 400 px sang phải (không nhảy, không di thêm)
  const p3 = clone(plan); p3.cursor.keys.forEach(k => { k.x -= 400; });
  assert.ok(failed(p3).includes('C3') && !failed(p3).includes('C4'), failed(p3).join());
  const p6 = clone(plan); p6.tutorial.steps[1].t += 300;
  assert.ok(failed(p6).includes('C6'));
  const p1 = clone(plan); p1.beats.find(b => b.block === 'cursor' && !/AUTO/.test(b.id)).params.target = 'khong_co';
  assert.ok(failed(p1).includes('C1'));
});

test('F4-3 C7: chú thích tràn mép (ép phía trên cho đích sát mép trên) ⇒ trượt C7; C8: phóng 3× ảnh 1440 ⇒ trượt C8, buildPlan không vượt zmax', () => {
  const p7 = planOf({ lines: LINES, beats: [OK_BEATS[0], { block: 'callout', line: 0, w: 6, params: { target: 'btn_ok', text: 'Một chú thích khá dài để thử tràn mép trên', side: 'top' } }] });
  assert.ok(failed(p7).includes('C7'), failed(p7).join());
  const shot = [{ id: 'SC-9', source: { asset: 'media/aa/' + 'b'.repeat(64) + '.png' }, size: [1440, 900], chrome: 'browser', targets: { btn: { x: 600, y: 400, w: 120, h: 40 } } }];
  const p8 = planOf({ lines: LINES, screens: shot, beats: [{ block: 'screen', line: 0, w: 1, params: { screen: 'SC-9' } }, { block: 'focus', line: 0, w: 6, params: { target: 'btn', zoom: 2.5 } }] });
  const sc = p8.screens[0];
  assert.ok(p8.tutorial.focus[0].z <= sc.zmax + 1e-9 && sc.s * p8.tutorial.focus[0].z <= 1.5 + 1e-6, 'engine kẹp zmax (không vỡ ảnh)');
  assert.ok(!failed(p8).includes('C8'));
  const bad = clone(p8); bad.tutorial.focus[0].z = 3;   // plan tay / lỗi engine: phóng 3×
  assert.ok(failed(bad).includes('C8'));
  assert.match(checkPlan(bad).V.find(v => v.check === 'C8').text, /tối đa 1.5/);
});

test('F4-8 C9: tutorial một màn, bước cách nhau 6 s khi có giọng ⇒ trượt C9 (trôi 2 px/PiP thở không tính); trailer ngưỡng 2 s', () => {
  const plan = planOf({ lines: [say(40), say(40)], beats: [{ block: 'screen', line: 0, w: 1, params: { screen: 'SC-1' } }, { block: 'cursor', line: 0, w: 20, params: { action: 'click', target: 'btn_ok' } }, { block: 'cursor', line: 1, w: 25, params: { action: 'click', target: 'tg_on' } }] });
  const v = checkPlan(plan).V.filter(x => x.check === 'C9');
  assert.ok(v.length >= 1 && v.every(x => x.value.voiced_ms > 4000), JSON.stringify(v.map(x => x.value)));
  const ok = planOf({ lines: LINES, beats: OK_BEATS });
  assert.ok(!failed(ok).includes('C9'));
  const tr = clone(ok); tr.variant = 'trailer'; tr.tutorial.variant = 'trailer';
  assert.ok(failed(tr).includes('C9'), 'nhịp bài full không đủ nhanh cho trailer');
});

test('màu: ΔE76 (sRGB → Lab) đúng thứ tự độ lớn', () => {
  assert.equal(deltaE(lab([255, 111, 89]), lab(hexRgb('#FF6F59'))), 0);
  assert.ok(deltaE(lab([250, 115, 92]), lab([255, 111, 89])) < 4);
  assert.ok(deltaE(lab([14, 19, 32]), lab([255, 111, 89])) > 50);
});

test('F4-8 C10: đầu dò pixel trên MP4 thật — có gợn màu nhấn quanh điểm bấm ⇒ đạt; gợn bị ẩn (CSS lỗi) ⇒ trượt C10', async (t) => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { t.skip('không có ffmpeg'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-c10-'));
  try {
    const plan = planOf({ lines: LINES, beats: OK_BEATS }), click = plan.cursor.clicks[0], T = (click.t + 100) / 1000;
    const mk = (file, ring) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x0E1320:s=1920x1080:r=30:d=${(T + 0.6).toFixed(2)}`,
      ...(ring ? ['-vf', `drawbox=x=${Math.round(click.x - 22)}:y=${Math.round(click.y - 22)}:w=44:h=44:color=0xFF6F59:t=6:enable='between(t,${(T - 0.2).toFixed(2)},${(T + 0.3).toFixed(2)})'`] : []),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
    const good = path.join(dir, 'ok.mp4'), bad = path.join(dir, 'hidden.mp4'); mk(good, true); mk(bad, false);
    const one = Object.assign(clone(plan), { cursor: Object.assign(clone(plan.cursor), { clicks: [click] }) });
    const g1 = await gateCursor({ plan: one, mp4Path: good, ffmpegPath: 'ffmpeg' });
    assert.equal(g1.measure.checks.C10.pass, true, JSON.stringify(g1.measure.checks.C10)); assert.ok(g1.measure.checks.C10.probes[0].delta_e <= 12);
    const g2 = await gateCursor({ plan: one, mp4Path: bad, ffmpegPath: 'ffmpeg' });
    assert.equal(g2.result, 'fail'); assert.equal(g2.measure.checks.C10.pass, false); assert.ok(g2.measure.violations.some(v => v.check === 'C10'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ngân sách (§6.14): G-CURSOR thuần (C1–C9) ≤ 200 ms cho bài 120 bước', () => {
  const lines = Array.from({ length: 30 }, () => say(16)), beats = [{ block: 'screen', line: 0, w: 1, params: { screen: 'SC-1' } }];
  const T = ['in_name', 'btn_ok', 'tg_on', 'nav_channels'];
  for (let i = 0; i < 30; i++) for (let j = 0; j < 4; j++) if (beats.length < 121) beats.push({ block: 'cursor', line: i, w: 2 + j * 4, params: { action: j % 2 ? 'hover' : 'click', target: T[(i + j) % 4] } });
  const plan = planOf({ lines, beats });
  const t0 = process.hrtime.bigint(); checkPlan(plan); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(plan.tutorial.steps.length, 120); assert.ok(ms <= 200, 'G-CURSOR ' + ms.toFixed(1) + ' ms');
});
