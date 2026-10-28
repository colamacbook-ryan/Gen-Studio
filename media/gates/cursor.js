// © 2026 Gen Labs — All rights reserved.
// G-CURSOR (SPEC-0.2.0 §6.8) — chỉ cho bài `tutorial`. C1–C9 tính THUẦN trong Node từ plan (rãnh con trỏ đã biên dịch + máy quay + hộp đích);
// C10 đọc pixel trên MP4 thật (ffmpeg cắt một khung quanh mỗi lần bấm) để bắt lỗi CSS trên sân khấu (gợn sóng/con trỏ bị ẩn).
// gateCursor({ plan, mp4Path?, ffmpegPath?, dry? }) → { gate:'G-CURSOR', result:'pass'|'fail'|'unknown', measure:{ checks:{C1..C10:{pass, n, bad}}, violations:[{check, beat, text, value}] } }
//   dry = true (validate_lesson, chưa có MP4): bỏ C10. Không có mp4Path khi không dry ⇒ C10 'unknown' ⇒ cổng unknown (INT-08: không cho qua ngầm).
// Ngưỡng: C2 khung an toàn x∈[48,1872], y∈[48,880] + không giao PiP · C4 ≤ 24 px/khung ngoài đoạn di, ≤ 140 px trong đoạn di hoặc khi máy quay lia ·
// C5 ≤ 2 px/khung trong 120 ms trước mỗi lần bấm · C6 ≤ 100 ms · C8 phóng hiệu dụng ảnh nguồn ≤ 1,5 · C9 ≤ 4 s (full) / ≤ 2 s (trailer) giữa hai sự kiện thật khi có giọng ·
// C10 khung t_click+100 ms có pixel màu nhấn (ΔE76 ≤ 12) trong bán kính 40 px quanh toạ độ bấm.
'use strict';
const { run, ffmpegBin } = require('../probe');
const T = require('../../render/engine/tutorial');
const camera = require('../../render/engine/camera');
const CP = require('../../render/engine/cursor-path');

const LIM = { jumpIdle: 24, jumpMove: 140, still: 2, stillMs: 120, anchorMs: 100, zoomSrc: 1.5, gapFull: 4000, gapTrailer: 2000, deltaE: 12, probeR: 40, probeMs: 100 };
const PRESS = ['click', 'double_click', 'right_click', 'drag', 'type'];

// ---------- màu ----------
function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function lab(rgb) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb.map(f);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * k(y) - 16, 500 * (k(x) - k(y)), 200 * (k(y) - k(z))];
}
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const inSafe = (b, s) => b.x >= s.x0 && b.y >= s.y0 && b.x + b.w <= s.x1 && b.y + b.h <= s.y1;
const hit = (a, b) => !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inBox = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const r1 = (v) => Math.round(v * 10) / 10;

// đoạn máy quay lia suy từ keyframe (hai khoá liền kề khác nhau)
function camMoves(keys) {
  const out = [];
  for (let i = 1; i < keys.length; i++) { const a = keys[i - 1], b = keys[i]; if (Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01 || Math.abs(a.z - b.z) > 0.0001) out.push({ t0: a.t, t1: b.t }); }
  return out;
}
const overlaps = (list, a, b) => list.some((m) => a < m.t1 && b > m.t0);

// C1–C9: thuần trên plan
function checkPlan(plan) {
  const tut = plan.tutorial || {}, safe = tut.safe || T.SAFE, pip = tut.pip || null, cur = plan.cursor || { keys: [], clicks: [], typing: [], moves: [] };
  const V = [], add = (check, beat, text, value) => V.push({ check, beat: beat || null, text, value: value === undefined ? null : value });
  const steps = tut.steps || [], beats = plan.beats || [], fps = plan.fps || 30, dt = 1000 / fps;
  const pos = (t) => CP.sampleKeys(cur.keys, t);
  const cm = camMoves(plan.camera || []);
  const counted = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0, C7: 0, C8: 0, C9: 0 };

  // bước con trỏ do tác giả đặt (không tính beat tự thêm)
  beats.filter((b) => b.block === 'cursor' && !/^AUTO-/.test(b.id)).forEach((b) => {
    const s = steps.find((x) => x.beat === b.id);
    counted.C1++; counted.C6++;
    if (!s) { add('C1', b.id, 'Bước con trỏ không có trong rãnh đã biên dịch.'); return; }
    // C6: mốc hành động ≈ mốc chữ neo
    const dA = Math.abs(s.t - b.t_anchor);
    if (dA > LIM.anchorMs) add('C6', b.id, `Mốc hành động lệch chữ neo ${Math.round(dA)} ms (tối đa ${LIM.anchorMs}).`, Math.round(dA));
    // C1 + C2 cho đích (và đích thả của kéo, lúc thả)
    const checkTarget = (name, t, label) => {
      const sa = T.screenAt(plan, t);
      if (!sa) { add('C1', b.id, `${label}: chưa có màn nào hiện lúc ${Math.round(t)} ms.`); return null; }
      const tb = T.targetBox(plan, sa.screen, name, t);
      if (!tb) { add('C1', b.id, `${label} "${name}" không có trên màn đang hiện (${sa.screen}).`); return null; }
      if (!tb.visible) add('C1', b.id, `${label} "${name}" đang bị cuộn ra ngoài vùng nhìn của màn ${sa.screen}.`);
      const fb = camera.boxToFrame(camera.sample(plan.camera, t), tb);
      counted.C2++;
      if (!inSafe(fb, safe)) add('C2', b.id, `${label} "${name}" ra ngoài khung an toàn lúc hành động (x ${r1(fb.x)}–${r1(fb.x + fb.w)}, y ${r1(fb.y)}–${r1(fb.y + fb.h)}).`, { x: r1(fb.x), y: r1(fb.y), w: r1(fb.w), h: r1(fb.h) });
      else if (pip && hit(fb, pip)) add('C2', b.id, `${label} "${name}" bị khung host PiP che lúc hành động.`, { x: r1(fb.x), y: r1(fb.y) });
      return fb;
    };
    const fb = checkTarget(b.params.target, s.t, 'Đích');
    if (s.action === 'drag' && s.to && s.release !== undefined) {
      const fb2 = checkTarget(s.to, s.release, 'Đích thả');
      const p2 = pos(s.release); counted.C3++;
      if (fb2 && p2 && !inBox(p2, fb2)) add('C3', b.id, 'Lúc thả, con trỏ không nằm trong đích thả.', { x: r1(p2.x), y: r1(p2.y) });
    }
    // C3: con trỏ trong hộp đích lúc bấm / bắt đầu gõ
    if (PRESS.includes(s.action) && fb) {
      const p = pos(s.t); counted.C3++;
      if (p && !inBox(p, fb)) add('C3', b.id, `Lúc ${s.action === 'type' ? 'bắt đầu gõ' : 'bấm'}, con trỏ (${r1(p.x)}, ${r1(p.y)}) nằm ngoài đích.`, { x: r1(p.x), y: r1(p.y) });
    }
    // C5: dừng trước khi bấm
    if (PRESS.includes(s.action) && s.action !== 'type') {
      counted.C5++;
      let worst = 0;
      for (let t = s.t - LIM.stillMs; t < s.t - 0.01; t += Math.min(dt, s.t - t)) { const a = pos(t), c = pos(Math.min(s.t, t + dt)); if (a && c) worst = Math.max(worst, Math.hypot(c.x - a.x, c.y - a.y)); }
      if (worst > LIM.still) add('C5', b.id, `Con trỏ còn di ${r1(worst)} px/khung trong ${LIM.stillMs} ms trước khi bấm (tối đa ${LIM.still}).`, r1(worst));
    }
  });

  // C4: không nhảy cóc (mỗi khung)
  const t0 = tut.cursorFrom || 0, moves = cur.moves || [];
  let worstIdle = 0, worstMove = 0;
  for (let t = t0 + dt; t <= plan.duration_ms; t += dt) {
    const a = pos(t - dt), c = pos(t); if (!a || !c) continue;
    const d = Math.hypot(c.x - a.x, c.y - a.y), moving = overlaps(moves, t - dt, t) || overlaps(cm, t - dt, t), lim = moving ? LIM.jumpMove : LIM.jumpIdle;
    counted.C4++;
    if (moving) worstMove = Math.max(worstMove, d); else worstIdle = Math.max(worstIdle, d);
    if (d > lim) add('C4', null, `Con trỏ nhảy ${r1(d)} px giữa hai khung lúc ${Math.round(t)} ms (tối đa ${lim}${moving ? ', đang di/lia' : ''}).`, { t: Math.round(t), px: r1(d) });
  }

  // C7: vòng sáng + thẻ chú thích nằm trọn khung an toàn
  (tut.focus || []).concat(tut.callouts || []).forEach((f) => {
    counted.C7++;
    if (f.ring && !inSafe(f.ring, safe)) add('C7', f.beat, 'Vòng sáng tràn khỏi khung an toàn.', f.ring);
    if (f.callout) { counted.C7++; if (!inSafe(f.callout, safe) || (pip && hit(f.callout, pip))) add('C7', f.beat, 'Thẻ chú thích tràn khỏi khung an toàn (hoặc chạm PiP).', { x: f.callout.x, y: f.callout.y, w: f.callout.w, h: f.callout.h }); }
  });

  // C8: phóng không vỡ ảnh (chỉ ảnh chụp; màn giả lập là vector)
  const scr = {}; (plan.screens || []).forEach((s) => { scr[s.id] = s; });
  (tut.focus || []).forEach((f) => {
    const s = scr[f.screen]; if (!s || s.kind !== 'asset') return;
    counted.C8++;
    const eff = s.s * f.z;
    if (eff > LIM.zoomSrc + 1e-6) add('C8', f.beat, `Phóng ảnh nguồn ${eff.toFixed(2)}× (tối đa ${LIM.zoomSrc}).`, +eff.toFixed(3));
  });

  // C9: nhịp sự kiện thật khi có giọng (trôi 2 px và PiP thở KHÔNG tính)
  const ev = [];
  beats.forEach((b) => { if (!/^AUTO-cursor/.test(b.id)) ev.push(b.t_in); });
  moves.forEach((m) => ev.push(m.t0, m.t1));
  (cur.clicks || []).forEach((c) => ev.push(c.t));
  (cur.typing || []).forEach((x) => ev.push(...(x.at || [x.t0]), x.t1));
  (tut.scrolls || []).forEach((x) => ev.push(x.t0, x.t1));
  cm.forEach((m) => ev.push(m.t0, m.t1));
  ev.sort((a, b) => a - b);
  const voiced = (plan.lines || []).map((l) => [l.a_ms, l.b_ms]);
  const vIn = (a, b) => voiced.reduce((s, [x, y]) => s + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  const gapMax = (plan.variant || tut.variant) === 'trailer' ? LIM.gapTrailer : LIM.gapFull;
  const vStart = voiced.length ? voiced[0][0] : 0, vEnd = voiced.length ? voiced[voiced.length - 1][1] : 0;
  const pts = [vStart].concat(ev.filter((t) => t > vStart && t < vEnd), [vEnd]);
  let worstGap = 0;
  for (let i = 1; i < pts.length; i++) {
    const g = vIn(pts[i - 1], pts[i]); counted.C9++;
    worstGap = Math.max(worstGap, g);
    if (g > gapMax) add('C9', null, `${(g / 1000).toFixed(1)} s có giọng mà không có sự kiện thật nào (${Math.round(pts[i - 1])}–${Math.round(pts[i])} ms; tối đa ${gapMax / 1000} s).`, { from: Math.round(pts[i - 1]), to: Math.round(pts[i]), voiced_ms: Math.round(g) });
  }
  return { V, counted, worst: { jump_idle: r1(worstIdle), jump_move: r1(worstMove), gap_ms: Math.round(worstGap), gap_max: gapMax } };
}

// C10: đầu dò pixel trên MP4 thật
async function probeClicks(plan, mp4Path, ffmpegPath) {
  // ô cắt S×S chẵn, gốc chẵn (yuv420p làm tròn crop về số chẵn)
  const accent = hexRgb((plan.tutorial || {}).accent) || hexRgb(T.DEFAULT_ACCENT), L0 = lab(accent), fps = plan.fps || 30, R = LIM.probeR, S = 2 * R;
  const even = (v) => 2 * Math.round(v / 2);
  const out = [];
  for (const c of (plan.cursor && plan.cursor.clicks) || []) {
    const i = Math.round((c.t + LIM.probeMs) / (1000 / fps)), x0 = even(Math.max(0, Math.min(1920 - S, c.x - R))), y0 = even(Math.max(0, Math.min(1080 - S, c.y - R)));
    const { stdout } = await run(ffmpegBin(ffmpegPath), ['-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', (i / fps).toFixed(4), '-i', mp4Path, '-frames:v', '1',
      '-vf', `crop=${S}:${S}:${x0}:${y0}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { timeout: 60000 });
    if (stdout.length !== S * S * 3) throw new Error(`khung cắt ${stdout.length} byte, cần ${S * S * 3}`);
    let best = Infinity;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (Math.hypot(x0 + x - c.x, y0 + y - c.y) > R) continue;
      const o = (y * S + x) * 3, d = deltaE(lab([stdout[o], stdout[o + 1], stdout[o + 2]]), L0);
      if (d < best) best = d;
    }
    out.push({ t: c.t, x: c.x, y: c.y, frame: i, delta_e: Number.isFinite(best) ? +best.toFixed(2) : null, pass: best <= LIM.deltaE });
  }
  return out;
}

async function gateCursor({ plan, mp4Path, ffmpegPath, dry = false }) {
  try {
    if (!plan || plan.kind !== 'tutorial' || !plan.tutorial) return { gate: 'G-CURSOR', result: 'unknown', measure: { text_human: 'Plan không phải bài hướng dẫn đã biên dịch.' } };
    const { V, counted, worst } = checkPlan(plan);
    let c10 = null, unknown = null;
    if (!dry) {
      if (!mp4Path) unknown = 'Thiếu MP4 để dò pixel (C10).';
      else {
        try { c10 = await probeClicks(plan, mp4Path, ffmpegPath); } catch (e) { unknown = 'Không đọc được khung MP4 (C10): ' + String(e && e.message).slice(0, 200); }
        (c10 || []).filter((x) => !x.pass).forEach((x) => V.push({ check: 'C10', beat: null, text: `Không thấy gợn sóng màu nhấn quanh điểm bấm lúc ${Math.round(x.t)} ms (ΔE nhỏ nhất ${x.delta_e}).`, value: x }));
      }
    }
    const checks = {};
    for (const k of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']) checks[k] = { pass: !V.some((v) => v.check === k), n: counted[k], bad: V.filter((v) => v.check === k).length };
    checks.C10 = dry ? { pass: null, skipped: 'dry' } : c10 ? { pass: c10.every((x) => x.pass), n: c10.length, bad: c10.filter((x) => !x.pass).length, probes: c10.slice(0, 40) } : { pass: null, error: unknown };
    const result = V.length ? 'fail' : unknown ? 'unknown' : 'pass';
    return { gate: 'G-CURSOR', result, measure: { checks, violations: V.slice(0, 60), violation_count: V.length, worst, steps: (plan.tutorial.steps || []).length, clicks: ((plan.cursor || {}).clicks || []).length, ...(unknown ? { text_human: unknown } : {}) } };
  } catch (e) {
    return { gate: 'G-CURSOR', result: 'unknown', measure: { error: String((e && e.message) || e) } };
  }
}

module.exports = { gateCursor, checkPlan, probeClicks, deltaE, lab, hexRgb, LIM };
