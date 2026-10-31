// © 2026 Gen Labs — All rights reserved.
// Máy kiểm thường trực Bộ Neo (gói E, 0.3.0) — độc lập, không đụng DB (gói A nối `asset_checks` sau).
// runChecks(filePath, slotCode, opts) → {verdict, checks:[{code, level, pass, measured, note_vi, note_en}], summary_vi, summary_en}
// Tiêu chí: STANDARD-KIT-v1.md §3.4/§4; thứ tự tự động hoá: §7.
// pass: true đạt · false trượt · null CHƯA ĐO được (M chưa phủ, hoặc H/M* chỉ có số đo tham khảo).
// verdict: còn M pass=false ⇒ 'rework'; hết M false nhưng còn pass=null (bất kỳ mức) ⇒ 'review'; hết ⇒ 'pass'.
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
    // STANDARD-KIT-v1.md §4.5: AU-03 (−16 LUFS ±1) chỉ áp nhạc nền/âm nhận diện (bgm/brand); AU-04 (không
    // lặng đầu 50ms) chỉ áp SFX — KHÔNG áp cho voice (review #1/#2: trước đây SFX ngắn bị AU-03 oan, voice
    // bị AU-04 oan).
    const sub = slotCode.split('.')[1]; // bed = bí danh của bgm (brief 0.3.0 gói E)
    return { group: 'audio', isMusic: sub === 'bgm' || sub === 'bed' || sub === 'brand', isSfx: sub === 'sfx' };
  }
  return { group: 'unknown' };
}

const R = (code, level, pass, measured, note_vi, note_en) => ({ code, level, pass, measured, note_vi, note_en });
// Tiêu chí M chưa cài máy đo (gói E 0.3.0 chưa phủ) — pass:null để verdict ra 'review' thay vì ngầm coi là đạt.
const MISSING = (code, level, note_vi, note_en) => R(code, level, null, { missing: true }, note_vi, note_en);

// --- ảnh raster (ký tự / bối cảnh / đạo cụ / ký hiệu) ---
function pngChecks(buf, cls, opts) {
  const out = [];
  let img;
  try {
    img = geom.decodePng(buf);
  } catch (e) {
    const norm = geom.normalizePng(buf, opts && opts.ffmpegPath);
    try { img = norm ? geom.decodePng(norm) : null; } catch { img = null; }
    if (!img) {
      // Mã riêng GEN-DECODE (review #8): khác GEN-FMT (sai định dạng) — đây là PNG đúng định dạng nhưng
      // biến thể render/png.js chưa đọc được (16-bit/palette/interlaced) và ffmpeg cũng không chuẩn hoá được.
      out.push(R('GEN-DECODE', 'M', false, { error: e.message }, 'Không giải mã được PNG (kể cả sau khi chuẩn hoá qua ffmpeg): ' + e.message,
        'Could not decode PNG (even after ffmpeg normalize): ' + e.message));
      return out;
    }
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
    out.push(R('CH-03', 'M', cb.pass, cb, `Lẫn màu nền trong nhân vật: ${cb.ratio}% (cần ≤0,5%)${cb.hasSubject ? '' : ' — KHÔNG thấy vật/nhân vật nào trong khung'}.`,
      `Bg color bleeding into character: ${cb.ratio}% (need ≤0.5%)${cb.hasSubject ? '' : ' — NO subject found in frame'}.`));
    if (cls.sub === 'expr') {
      const se = geom.shouldersTouchEdges(img, { target: BG });
      out.push(R('CH-05', 'M', se.pass, se, `Vai chạm mép trái/phải: ${se.left}/${se.right} (cần cả hai).`, `Shoulders touch left/right edge: ${se.left}/${se.right} (need both).`));
      if (opts && opts.referenceFile && fs.existsSync(opts.referenceFile)) {
        let ref; try { ref = geom.decodePng(fs.readFileSync(opts.referenceFile)); } catch { ref = null; }
        const od = ref ? geom.overlayDiff(img, ref) : { comparable: false, diffRatio: null };
        // Review #5: M* luôn pass:null (pending) — số đo chỉ tham khảo, không tự kết luận đạt/trượt.
        out.push(R('CH-04', 'M*', null, od,
          'M* — chưa có dò mốc mặt; so chồng mờ với .expr.00 chỉ để tham khảo, Ryan xác nhận bằng mắt.' + (od.comparable ? ` Khác biệt điểm ảnh: ${od.diffRatio}%.` : ' Không so được (thiếu/khác kích thước ảnh tham chiếu).'),
          'M* — no face-landmark detection yet; overlay diff vs .expr.00 is advisory only, Ryan confirms by eye.' + (od.comparable ? ` Pixel diff: ${od.diffRatio}%.` : ' Not comparable (missing/size mismatch reference).')));
      } else {
        out.push(R('CH-04', 'M*', null, { comparable: false }, 'M* — chưa đo: thiếu ảnh .expr.00 tham chiếu (opts.referenceFile), Ryan xác nhận bằng mắt.',
          'M* — not measured: missing .expr.00 reference (opts.referenceFile), Ryan confirms by eye.'));
      }
    }
    if (cls.sub === 'pose') {
      const ft = geom.feetTouchGround(img, { groundY: (opts && opts.groundY != null) ? opts.groundY : 2400 });
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
    // Review #7: bật lại chống đệm (padMax=4, nay an toàn nhờ sửa #3) + đo hộp bao vật cách mép ≥64px.
    const sp = geom.sizePad(img, { w: 2048, h: 2048, target: BG, padMax: 4 });
    const bb = geom.boundingBox(img, { target: BG });
    const marginOk = bb.found && bb.margin >= 64;
    out.push(R('PR-01', 'M', sp.pass && marginOk, { ...sp, bbox: bb, marginNeed: 64 },
      `Khung ${sp.w}×${sp.h} (cần 2048×2048, nền ${hex(BG)}), đệm ≤4px, vật cách mép ${bb.margin == null ? 'không thấy vật' : bb.margin + 'px'} (cần ≥64px).`,
      `Frame ${sp.w}×${sp.h} (need 2048×2048, bg ${hex(BG)}), pad ≤4px, subject margin ${bb.margin == null ? 'no subject found' : bb.margin + 'px'} (need ≥64px).`));
    const cc = geom.cornerColor(img, { target: BG });
    out.push(R('CH-02', 'M', cc.pass, cc, `Nền 4 góc như CH-02: lệch ≤${cc.maxMeanErr}/≤${cc.maxStd}.`, `Corner bg like CH-02: err ≤${cc.maxMeanErr}/≤${cc.maxStd}.`));
    const cb = geom.chromaBleed(img, { target: BG });
    out.push(R('PR-02', 'M', cb.pass, cb, `Lẫn màu nền trong vật: ${cb.ratio}% (cần ≤0,5%, như CH-03)${cb.hasSubject ? '' : ' — KHÔNG thấy vật nào trong khung'}.`,
      `Bg bleeding into prop: ${cb.ratio}% (need ≤0.5%, like CH-03)${cb.hasSubject ? '' : ' — NO subject found in frame'}.`));
  } else if (cls.group === 'fx') {
    const sp = geom.sizePad(img, { w: 1024, h: 1024, target: BG, padMax: 4 });
    const bb = geom.boundingBox(img, { target: BG });
    const marginOk = bb.found && bb.margin >= 48;
    out.push(R('FX-01', 'M', sp.pass && marginOk, { ...sp, bbox: bb, marginNeed: 48 },
      `Khung ${sp.w}×${sp.h} (cần 1024×1024, nền ${hex(BG)}), đệm ≤4px, ký hiệu cách mép ${bb.margin == null ? 'không thấy ký hiệu' : bb.margin + 'px'} (cần ≥48px).`,
      `Frame ${sp.w}×${sp.h} (need 1024×1024, bg ${hex(BG)}), pad ≤4px, symbol margin ${bb.margin == null ? 'no symbol found' : bb.margin + 'px'} (need ≥48px).`));
    const cc = geom.cornerColor(img, { target: BG });
    out.push(R('CH-02', 'M', cc.pass, cc, `Nền 4 góc như CH-02: lệch ≤${cc.maxMeanErr}/≤${cc.maxStd}.`, `Corner bg like CH-02: err ≤${cc.maxMeanErr}/≤${cc.maxStd}.`));
    const cb = geom.chromaBleed(img, { target: BG });
    out.push(R('FX-02', 'M', cb.pass, cb, `Lẫn màu nền trong ký hiệu: ${cb.ratio}% (cần ≤0,5%, như CH-03)${cb.hasSubject ? '' : ' — KHÔNG thấy ký hiệu nào trong khung'}.`,
      `Bg bleeding into symbol: ${cb.ratio}% (need ≤0.5%, like CH-03)${cb.hasSubject ? '' : ' — NO symbol found in frame'}.`));
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
  // Review #1: AU-03 (−16 LUFS ±1) chỉ áp nhạc nền/âm nhận diện (STANDARD-KIT-v1 §4.5) — SFX ngắn không bị ép loudness.
  if (opts && opts.isMusic) {
    out.push(R('AU-03', 'M', ld.lufsOk, { lufs: ld.lufs }, `Độ to ${ld.lufs} LUFS (cần -16 ±1).`, `Loudness ${ld.lufs} LUFS (need -16 ±1).`));
  }
  // Review #2: AU-04 (không lặng đầu 50ms) chỉ áp SFX, không áp voice.
  if (opts && opts.isSfx) {
    const ns = await audio.noLeadSilence(file, { ffmpegPath });
    out.push(R('AU-04', 'M', ns.ok, ns, `Lặng đầu ${ns.leadMs == null ? '?' : ns.leadMs + 'ms'} (cần bắt đầu trong 50ms).`, `Lead silence ${ns.leadMs == null ? '?' : ns.leadMs + 'ms'} (need to start within 50ms).`));
  }
  return out;
}

function uiChecks(buf) {
  const ok = svgMod.svgOk(buf);
  const out = [R('UI-01', 'M', ok, { bytes: buf.length, maxBytes: svgMod.MAX_BYTES }, `SVG ${ok ? 'hợp lệ' : 'KHÔNG hợp lệ'}, ${buf.length} byte (≤${svgMod.MAX_BYTES} byte, qua svgOk).`,
    `SVG ${ok ? 'valid' : 'INVALID'}, ${buf.length} bytes (≤${svgMod.MAX_BYTES} bytes, via svgOk).`)];
  // Review #6: UI-02 là tiêu chí M (chữ sửa được = phần tử <text>, dùng font trong font.*), gói E 0.3.0
  // chưa cài máy đo (cần đối chiếu danh sách font.* đã duyệt) — khai rõ 'missing', không gắn nhãn H.
  out.push(MISSING('UI-02', 'M', 'M — chưa cài máy đo (chữ là <text> + dùng font trong font.*); gói E 0.3.0 chưa phủ.',
    'M — not implemented yet (text as <text> elements + uses a font.* font); not covered by package E 0.3.0.'));
  return out;
}

function motionChecks(buf) {
  const r = lottieMod.lottieOk(buf);
  const out = [R('MO-01', 'M', r.ok, { bytes: buf.length, maxBytes: lottieMod.MAX_BYTES, reason: r.reason || null },
    `Lottie ${r.ok ? 'hợp lệ' : 'KHÔNG hợp lệ (' + r.reason + ')'}, ${buf.length} byte (≤${lottieMod.MAX_BYTES} byte).`,
    `Lottie ${r.ok ? 'valid' : 'INVALID (' + r.reason + ')'}, ${buf.length} bytes (≤${lottieMod.MAX_BYTES} bytes).`)];
  // Review #6: MO-02 (thời lượng 0,4–1,0s/≤1,2s) và MO-03 (ô chữ sửa được + tiếng Việt đủ dấu, mức M+H) là
  // M (MO-03 nửa M) — chưa cài máy đo, khai 'missing' thay vì xếp nhầm vào H.
  out.push(MISSING('MO-02', 'M', 'M — chưa cài máy đo thời lượng theo loại mẫu (0,4–1,0s chuyển cảnh / ≤1,2s tiêu đề); gói E 0.3.0 chưa phủ.',
    'M — not implemented yet (duration by template type: 0.4-1.0s transition / ≤1.2s title); not covered by package E 0.3.0.'));
  out.push(MISSING('MO-03', 'M + H', 'M + H — phần M (ô chữ sửa được + tiếng Việt đủ dấu) chưa cài máy đo; gói E 0.3.0 chưa phủ.',
    'M + H — the M part (editable text fields + full Vietnamese diacritics) not implemented yet; not covered by package E 0.3.0.'));
  return out;
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
  else if (cls.group === 'audio') checks.push(...await audioChecks(filePath, { ...opts, isMusic: cls.isMusic, isSfx: cls.isSfx }));
  else if (cls.group === 'ui') checks.push(...uiChecks(buf));
  else if (cls.group === 'motion') checks.push(...motionChecks(buf));
  else if (cls.group === 'font') checks.push(R('FO-01', 'M', true, { detected: sn.detected }, `Định dạng font nhận diện được: ${sn.detected} (kiểm sâu cmap/giấy phép ngoài phạm vi 0.3.0 gói E).`,
    `Recognised font format: ${sn.detected} (deep cmap/license checks out of scope for 0.3.0 package E).`));

  return finish(checks, slotCode, cls);
}

function finish(checks, slotCode, cls) {
  // Review #5: pass=false (ở mức M) mới chặn hẳn ('rework'); pass=null (bất kỳ mức — chưa đo/chỉ tham khảo)
  // chưa chắc chắn ⇒ 'review' (không được tự ngầm coi là đạt im lặng).
  const mFail = checks.filter((c) => c.level === 'M' && c.pass === false);
  const pending = checks.filter((c) => c.pass === null);
  const verdict = mFail.length ? 'rework' : pending.length ? 'review' : 'pass';
  const summary_vi = verdict === 'pass' ? `Đạt mọi tiêu chí máy kiểm cho ô ${slotCode}.`
    : verdict === 'rework' ? `Trượt ${mFail.length} tiêu chí máy (${mFail.map((c) => c.code).join(', ')}) — làm lại.`
    : `Qua máy kiểm, còn ${pending.length} tiêu chí chưa đo/cần Ryan xác nhận (${pending.map((c) => c.code).join(', ')}).`;
  const summary_en = verdict === 'pass' ? `All machine checks passed for slot ${slotCode}.`
    : verdict === 'rework' ? `Failed ${mFail.length} machine criteria (${mFail.map((c) => c.code).join(', ')}) — rework needed.`
    : `Machine checks passed, ${pending.length} criteria still not measured/need Ryan's eye (${pending.map((c) => c.code).join(', ')}).`;
  return { verdict, group: cls.group, checks, summary_vi, summary_en };
}

module.exports = { runChecks, classify };
