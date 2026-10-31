// © 2026 Gen Labs — All rights reserved.
// Máy kiểm thường trực Bộ Neo (gói E, 0.3.0) — độc lập, không đụng DB (gói A nối `asset_checks` sau).
// runChecks(filePath, slotCode, opts) → {verdict, checks:[{code, level, pass, measured, note_vi, note_en}], summary_vi, summary_en}
// Tiêu chí: STANDARD-KIT-v1.md §3.4/§4; thứ tự tự động hoá: §7. verdict: M fail ⇒ 'rework'; chỉ H fail ⇒ 'review'; hết ⇒ 'pass'.
'use strict';
const fs = require('node:fs');
const magic = require('./magic.js');
const geom = require('./geom.js');
const audio = require('./audio.js');
const svgMod = require('./svg.js');
const lottieMod = require('./lottie.js');

const BG = geom.BG;
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// Mẫu mã ô (STANDARD-KIT-v1.md §2): <nhóm>.<loại>[.<chủ đề>][.<số|slug>] — 2–4 đoạn, a-z0-9-.
const SLOT_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){1,3}$/;

function classify(slotCode) {
  if (!slotCode || !SLOT_RE.test(slotCode)) return { group: 'unknown' };
  let m;
  if ((m = slotCode.match(/^([a-z0-9-]+)\.(expr|pose|id)\.([0-9]{2})$/))) return { group: 'char', char: m[1], sub: m[2], n: m[3] };
  if (slotCode.startsWith('scene.')) return { group: 'scene', fg: /\.fg-\d+$/.test(slotCode) };
  if (slotCode.startsWith('prop.')) return { group: 'prop' };
  if (slotCode.startsWith('fx.')) return { group: 'fx' };
  if (slotCode.startsWith('ui.')) return { group: 'ui' };
  if (slotCode.startsWith('motion.')) return { group: 'motion' };
  if (slotCode.startsWith('font.')) return { group: 'font' };
  if (slotCode.startsWith('audio.')) {
    const sub = slotCode.split('.')[1]; // bed = bí danh của bgm (brief 0.3.0 gói E)
    return { group: 'audio', isMusic: sub === 'bgm' || sub === 'bed' || sub === 'brand', isSfx: sub === 'sfx' || sub === 'voice' };
  }
  return { group: 'unknown' };
}

const R = (code, level, pass, measured, note_vi, note_en) => ({ code, level, pass, measured, note_vi, note_en });

// --- ảnh raster (ký tự / bối cảnh / đạo cụ / ký hiệu) ---
function pngChecks(buf, cls, opts) {
  const out = [];
  let img;
  try { img = geom.decodePng(buf); } catch (e) {
    out.push(R('GEN-FMT', 'M', false, { error: e.message }, 'Không đọc được PNG: ' + e.message, 'Could not decode PNG: ' + e.message));
    return out;
  }
  if (cls.group === 'char') {
    const w = cls.sub === 'expr' ? 2048 : 2048, h = cls.sub === 'expr' ? 2048 : 2560;
    const sp = geom.sizePad(img, { w, h, target: BG });
    out.push(R('CH-01', 'M', sp.pass, sp, `Kích thước ${sp.w}×${sp.h} (cần ${w}×${h}), đệm tối đa ${sp.maxPad}px (cho phép ≤4px).`,
      `Size ${sp.w}×${sp.h} (need ${w}×${h}), max padding band ${sp.maxPad}px (allow ≤4px).`));
    const cc = geom.cornerColor(img, { target: BG });
    out.push(R('CH-02', 'M', cc.pass, cc, `Nền 4 góc lệch trung bình ≤${cc.maxMeanErr} (cần ≤6), lệch chuẩn ≤${cc.maxStd} (cần ≤3) so với ${hex(BG)}.`,
      `Corner bg mean err ≤${cc.maxMeanErr} (need ≤6), stddev ≤${cc.maxStd} (need ≤3) vs ${hex(BG)}.`));
    const cb = geom.chromaBleed(img, { target: BG });
    out.push(R('CH-03', 'M', cb.pass, cb, `Lẫn màu nền trong nhân vật: ${cb.ratio}% (cần ≤0,5%).`, `Bg color bleeding into character: ${cb.ratio}% (need ≤0.5%).`));
    if (cls.sub === 'expr') {
      const se = geom.shouldersTouchEdges(img, { target: BG });
      out.push(R('CH-05', 'M', se.pass, se, `Vai chạm mép trái/phải: ${se.left}/${se.right} (cần cả hai).`, `Shoulders touch left/right edge: ${se.left}/${se.right} (need both).`));
      if (opts && opts.referenceFile && fs.existsSync(opts.referenceFile)) {
        let ref; try { ref = geom.decodePng(fs.readFileSync(opts.referenceFile)); } catch { ref = null; }
        const od = ref ? geom.overlayDiff(img, ref) : { comparable: false, diffRatio: null };
        out.push(R('CH-04', 'H', od.comparable ? od.diffRatio <= 15 : true, od,
          'M* — chưa có dò mốc mặt; so chồng mờ với .expr.00 chỉ để tham khảo, Ryan xác nhận bằng mắt.' + (od.comparable ? ` Khác biệt điểm ảnh: ${od.diffRatio}%.` : ' Không so được (khác kích thước).'),
          'M* — no face-landmark detection yet; overlay diff vs .expr.00 is advisory only, Ryan confirms by eye.' + (od.comparable ? ` Pixel diff: ${od.diffRatio}%.` : ' Not comparable (size mismatch).')));
      } else {
        out.push(R('CH-04', 'H', true, { comparable: false }, 'M* — tạm H: thiếu ảnh .expr.00 tham chiếu (opts.referenceFile) nên chưa so được, Ryan xác nhận bằng mắt.',
          'M* — temp H: missing .expr.00 reference (opts.referenceFile) so not compared, Ryan confirms by eye.'));
      }
    }
    if (cls.sub === 'pose') {
      const ft = geom.feetTouchGround(img, {});
      out.push(R('CH-07', 'M', ft.pass, ft, `Chân chạm đường đất: hàng thấp nhất y=${ft.lowestY} (cần ${ft.groundY}±8).`, `Feet on ground line: lowest row y=${ft.lowestY} (need ${ft.groundY}±8).`));
    }
  } else if (cls.group === 'scene') {
    const sp = geom.sizePad(img, { w: 3840, h: 2160, target: BG, padMax: 999999 }); // chỉ lấy w/h, không áp luật đệm (bối cảnh không nền chroma)
    out.push(R('SC-01', 'M', sp.sizeOk, { w: sp.w, h: sp.h }, `Kích thước ${sp.w}×${sp.h} (cần 3840×2160).`, `Size ${sp.w}×${sp.h} (need 3840×2160).`));
    if (cls.fg) {
      const ar = geom.alphaRatio(img);
      out.push(R('SC-02', 'M', ar.hasAlpha && ar.ratio >= 0.5, ar, `Tiền cảnh RGBA, ${Math.round(ar.ratio * 100)}% điểm trong suốt (cần RGBA + ≥50%).`,
        `Foreground RGBA, ${Math.round(ar.ratio * 100)}% transparent px (need RGBA + ≥50%).`));
    }
  } else if (cls.group === 'prop') {
    const sp = geom.sizePad(img, { w: 2048, h: 2048, target: BG, padMax: 999999 });
    out.push(R('PR-01', 'M', sp.sizeOk, { w: sp.w, h: sp.h }, `Khung ${sp.w}×${sp.h} (cần 2048×2048, nền ${hex(BG)}).`, `Frame ${sp.w}×${sp.h} (need 2048×2048, bg ${hex(BG)}).`));
    const cc = geom.cornerColor(img, { target: BG });
    out.push(R('CH-02', 'M', cc.pass, cc, `Nền 4 góc như CH-02: lệch ≤${cc.maxMeanErr}/≤${cc.maxStd}.`, `Corner bg like CH-02: err ≤${cc.maxMeanErr}/≤${cc.maxStd}.`));
    const cb = geom.chromaBleed(img, { target: BG });
    out.push(R('PR-02', 'M', cb.pass, cb, `Lẫn màu nền trong vật: ${cb.ratio}% (cần ≤0,5%, như CH-03).`, `Bg bleeding into prop: ${cb.ratio}% (need ≤0.5%, like CH-03).`));
  } else if (cls.group === 'fx') {
    const sp = geom.sizePad(img, { w: 1024, h: 1024, target: BG, padMax: 999999 });
    out.push(R('FX-01', 'M', sp.sizeOk, { w: sp.w, h: sp.h }, `Khung ${sp.w}×${sp.h} (cần 1024×1024, nền ${hex(BG)}).`, `Frame ${sp.w}×${sp.h} (need 1024×1024, bg ${hex(BG)}).`));
    const cc = geom.cornerColor(img, { target: BG });
    out.push(R('CH-02', 'M', cc.pass, cc, `Nền 4 góc như CH-02: lệch ≤${cc.maxMeanErr}/≤${cc.maxStd}.`, `Corner bg like CH-02: err ≤${cc.maxMeanErr}/≤${cc.maxStd}.`));
    const cb = geom.chromaBleed(img, { target: BG });
    out.push(R('FX-02', 'M', cb.pass, cb, `Lẫn màu nền trong ký hiệu: ${cb.ratio}% (cần ≤0,5%, như CH-03).`, `Bg bleeding into symbol: ${cb.ratio}% (need ≤0.5%, like CH-03).`));
  }
  return out;
}

async function audioChecks(file, opts) {
  const ffmpegPath = (opts && opts.ffmpegPath) || process.env.GS_FFMPEG_PATH || 'ffmpeg';
  const out = [];
  const fmt = await audio.formatOk(file, { ffmpegPath });
  out.push(R('AU-01', 'M', fmt.ok, fmt.measured, `Định dạng: ${JSON.stringify(fmt.measured)} (cần WAV 48 kHz/24-bit).`, `Format: ${JSON.stringify(fmt.measured)} (need WAV 48 kHz/24-bit).`));
  const ld = await audio.loudnessChecks(file, { ffmpegPath });
  out.push(R('AU-02', 'M', ld.peakOk, { tp: ld.tp }, `Đỉnh true peak ${ld.tp} dBFS (cần ≤ -1).`, `True peak ${ld.tp} dBFS (need ≤ -1).`));
  out.push(R('AU-03', 'M', ld.lufsOk, { lufs: ld.lufs }, `Độ to ${ld.lufs} LUFS (cần -16 ±1).`, `Loudness ${ld.lufs} LUFS (need -16 ±1).`));
  if (opts && opts.isSfx) {
    const ns = await audio.noLeadSilence(file, { ffmpegPath });
    out.push(R('AU-04', 'M', ns.ok, ns, `Lặng đầu ${ns.leadMs == null ? '?' : ns.leadMs + 'ms'} (cần bắt đầu trong 50ms).`, `Lead silence ${ns.leadMs == null ? '?' : ns.leadMs + 'ms'} (need to start within 50ms).`));
  }
  return out;
}

function uiChecks(buf) {
  const ok = svgMod.svgOk(buf);
  return [R('UI-01', 'M', ok, { bytes: buf.length, maxBytes: svgMod.MAX_BYTES }, `SVG ${ok ? 'hợp lệ' : 'KHÔNG hợp lệ'}, ${buf.length} byte (≤${svgMod.MAX_BYTES} byte, qua svgOk).`,
    `SVG ${ok ? 'valid' : 'INVALID'}, ${buf.length} bytes (≤${svgMod.MAX_BYTES} bytes, via svgOk).`)];
}

function motionChecks(buf) {
  const r = lottieMod.lottieOk(buf);
  return [R('MO-01', 'M', r.ok, { bytes: buf.length, maxBytes: lottieMod.MAX_BYTES, reason: r.reason || null },
    `Lottie ${r.ok ? 'hợp lệ' : 'KHÔNG hợp lệ (' + r.reason + ')'}, ${buf.length} byte (≤${lottieMod.MAX_BYTES} byte).`,
    `Lottie ${r.ok ? 'valid' : 'INVALID (' + r.reason + ')'}, ${buf.length} bytes (≤${lottieMod.MAX_BYTES} bytes).`)];
}

// Tuỳ chỉnh hậu tố/mime kỳ vọng theo mã ô để kiểm magic bytes đúng nội dung khai.
function expectedMimeOf(cls, declaredMime) {
  if (cls.group === 'ui') return 'image/svg+xml';
  if (cls.group === 'motion') return 'application/json';
  if (cls.group === 'font') return null; // woff2/ttf/otf — nhiều định dạng cho phép, không ép một mime
  if (cls.group === 'audio') return declaredMime || null;
  return declaredMime || null;
}

async function runChecks(filePath, slotCode, opts = {}) {
  const cls = classify(slotCode);
  const buf = fs.readFileSync(filePath);
  const checks = [];

  if (cls.group === 'unknown') {
    checks.push(R('GEN-SPEC', 'M', false, { slotCode }, `Mã ô "${slotCode}" không khớp ngữ pháp Bộ Neo (STANDARD-KIT-v1 §2).`, `Slot code "${slotCode}" does not match Bộ Neo grammar (STANDARD-KIT-v1 §2).`));
    return finish(checks, slotCode, cls);
  }

  const sn = magic.sniff(buf, expectedMimeOf(cls, opts.declaredMime));
  checks.push(R('GEN-FMT', 'M', sn.ok, sn, `Magic bytes: phát hiện ${sn.detected || 'không rõ'}${sn.declared ? ' (khai ' + sn.declared + ')' : ''}.`,
    `Magic bytes: detected ${sn.detected || 'unknown'}${sn.declared ? ' (declared ' + sn.declared + ')' : ''}.`));
  if (!sn.ok) return finish(checks, slotCode, cls); // định dạng sai thì không đo tiếp (tránh ném lỗi giải mã)

  if (['char', 'scene', 'prop', 'fx'].includes(cls.group)) checks.push(...pngChecks(buf, cls, opts));
  else if (cls.group === 'audio') checks.push(...await audioChecks(filePath, { ...opts, isSfx: cls.isSfx }));
  else if (cls.group === 'ui') checks.push(...uiChecks(buf));
  else if (cls.group === 'motion') checks.push(...motionChecks(buf));
  else if (cls.group === 'font') checks.push(R('FO-01', 'M', true, { detected: sn.detected }, `Định dạng font nhận diện được: ${sn.detected} (kiểm sâu cmap/giấy phép ngoài phạm vi 0.3.0 gói E).`,
    `Recognised font format: ${sn.detected} (deep cmap/license checks out of scope for 0.3.0 package E).`));

  return finish(checks, slotCode, cls);
}

function finish(checks, slotCode, cls) {
  const mFail = checks.filter((c) => c.level === 'M' && !c.pass);
  const hFail = checks.filter((c) => c.level !== 'M' && !c.pass);
  const verdict = mFail.length ? 'rework' : hFail.length ? 'review' : 'pass';
  const summary_vi = verdict === 'pass' ? `Đạt mọi tiêu chí máy kiểm cho ô ${slotCode}.`
    : verdict === 'rework' ? `Trượt ${mFail.length} tiêu chí máy (${mFail.map((c) => c.code).join(', ')}) — làm lại.`
    : `Qua máy kiểm, còn ${hFail.length} tiêu chí cần Ryan xác nhận (${hFail.map((c) => c.code).join(', ')}).`;
  const summary_en = verdict === 'pass' ? `All machine checks passed for slot ${slotCode}.`
    : verdict === 'rework' ? `Failed ${mFail.length} machine criteria (${mFail.map((c) => c.code).join(', ')}) — rework needed.`
    : `Machine checks passed, ${hFail.length} criteria still need Ryan's eye (${hFail.map((c) => c.code).join(', ')}).`;
  return { verdict, group: cls.group, checks, summary_vi, summary_en };
}

module.exports = { runChecks, classify };
