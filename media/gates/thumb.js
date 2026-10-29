// © 2026 Gen Labs — All rights reserved.
// Cổng G-THUMB (SPEC-0.2.0 §5.5, §5.7): đo ảnh bìa theo T1–T11. Áp khi bài có `thumbnail` (media/gates/index.js GATES).
//   gateThumb({ variants, ffmpegPath }) → { gate:'G-THUMB', result:'pass'|'fail'|'unknown', measure:{ variants:[{index, pass, score, …}], passed:[…], text_human } }
//   variants = renderPlan().thumbs = [{ index, spec, measures (DOM, toạ độ canvas của mẫu), png, png_notext, jpg1280, jpg1920 }]
// F7 §5.1/§6.1: khung đo = canvas của mẫu (16:9 ⇒ 1280×720; 9:16 ⇒ 1080×1920), T1 theo aspects.thumbSizes(aspect) — jpg1280/jpg1920 là ảnh có CẠNH DÀI 1280/1920.
// Đo pixel bằng ffmpeg `-f rawvideo -pix_fmt rgb24` (giải mã chuẩn, không tự bọc — L-101). Mặt nạ chữ = pixel khác nhau (> 24/255) giữa bản CÓ chữ và KHÔNG chữ;
// tương phản = luminance trung bình của pixel chữ so với cùng các pixel đó ở bản không chữ (WCAG: (L1 + 0,05) / (L2 + 0,05)).
// `pass` ⇔ ≥ 1 phương án đạt toàn bộ T1–T11. Không đo được (thiếu tệp, ffmpeg lỗi) ⇒ `unknown` ⇒ chặn như mọi cổng (INT-08).
'use strict';
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const T = require('../../render/thumb.js');


// rgb24 W×H của một ảnh (hạ/phóng về 1280×720 bằng ffmpeg). Ném lỗi có mã nếu không giải được.
function decodeRgb(file, ffmpegPath, canvas) {
  const [W, H] = canvas || [1280, 720];
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw Object.assign(new Error('không chạy được ffmpeg: ' + r.error.message), { code: 'ffmpeg_missing' });
  if (r.status !== 0 || !r.stdout || r.stdout.length !== W * H * 3) throw Object.assign(new Error('ffmpeg không giải được ' + file + ' (' + String(r.stderr || '').slice(0, 120) + ')'), { code: 'decode_failed' });
  return r.stdout;
}
// luminance tương đối của 256 giá trị kênh (bảng tra)
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const lum = (buf, o) => 0.2126 * LIN[buf[o]] + 0.7152 * LIN[buf[o + 1]] + 0.0722 * LIN[buf[o + 2]];

// Tương phản chữ/nền từ hai ảnh (có chữ, không chữ) đã giải mã → { contrast|null, text_px }
function contrastOf(withText, noText, threshold, canvas) {
  const N = canvas ? canvas[0] * canvas[1] : 1280 * 720;
  const th = threshold == null ? T.RULES.mask_threshold : threshold;
  let n = 0, a = 0, b = 0;
  for (let i = 0; i < N; i++) {
    const o = i * 3;
    const d = Math.max(Math.abs(withText[o] - noText[o]), Math.abs(withText[o + 1] - noText[o + 1]), Math.abs(withText[o + 2] - noText[o + 2]));
    if (d > th) { n++; a += lum(withText, o); b += lum(noText, o); }
  }
  if (!n) return { contrast: null, text_px: 0 };
  return { contrast: T.contrastOfLum(a / n, b / n), text_px: n };
}
// tỉ lệ pixel khác nhau (> ngưỡng ở ít nhất một kênh) giữa hai ảnh cùng cỡ
function diffRatio(x, y, threshold, canvas) {
  const N = canvas ? canvas[0] * canvas[1] : 1280 * 720;
  const th = threshold == null ? T.RULES.diff_threshold : threshold;
  let n = 0;
  for (let i = 0; i < N; i++) {
    const o = i * 3;
    if (Math.abs(x[o] - y[o]) > th || Math.abs(x[o + 1] - y[o + 1]) > th || Math.abs(x[o + 2] - y[o + 2]) > th) n++;
  }
  return n / N;
}
// cỡ ảnh JPEG từ SOF (đọc tiêu đề, không giải mã) → [w,h] | null
function jpegSize(buf) {
  if (!(buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

function gateThumb(opts) {
  const { variants, ffmpegPath } = opts || {};
  const unknown = (text) => ({ gate: 'G-THUMB', result: 'unknown', measure: { text_human: text, variants: [], passed: [] } });
  if (!Array.isArray(variants) || !variants.length) return unknown('Không có phương án ảnh bìa nào được dựng.');
  if (!ffmpegPath) return unknown('Thiếu ffmpeg nên chưa đo được ảnh bìa.');
  const specs = [], doms = [], pxs = [], imgs = [];
  try {
    for (const v of variants) {
      if (!v || !v.spec || !v.measures) throw new Error('phương án thiếu spec/số đo DOM');
      for (const k of ['png', 'png_notext', 'jpg1280', 'jpg1920']) if (!v[k] || !fs.existsSync(v[k])) throw new Error(`phương án ${v.index + 1} thiếu tệp ${k}`);
      const j1 = fs.readFileSync(v.jpg1280), j2 = fs.readFileSync(v.jpg1920);
      const cv = T.canvasOf(v.spec.template);
      const withText = decodeRgb(v.png, ffmpegPath, cv), noText = decodeRgb(v.png_notext, ffmpegPath, cv);
      const c = contrastOf(withText, noText, undefined, cv);
      specs.push(v.spec); doms.push(v.measures);
      pxs.push({ dim1280: jpegSize(j1), dim1920: jpegSize(j2), magic1280: isJpeg(j1), magic1920: isJpeg(j2), bytes1280: j1.length, bytes1920: j2.length, contrast: c.contrast, text_px: c.text_px, diffs: {} });
      imgs.push({ rgb: withText, cv });
    }
    // T11: mọi cặp (j < i) — measure() chỉ phạt phương án sau nếu giống một phương án ĐÃ ĐẠT trước nó
    // (hai phương án khác tỉ lệ không so được — vô nghĩa, bài chỉ có một tỉ lệ; bỏ qua cặp đó)
    for (let i = 0; i < imgs.length; i++) for (let j = 0; j < i; j++) if (imgs[i].cv[0] === imgs[j].cv[0] && imgs[i].cv[1] === imgs[j].cv[1]) pxs[i].diffs[specs[j].index] = diffRatio(imgs[i].rgb, imgs[j].rgb, undefined, imgs[i].cv);
  } catch (e) {
    return unknown('Không đo được ảnh bìa: ' + e.message);
  }
  const m = T.measure(specs, doms, pxs);
  const best = m.variants.filter((v) => v.pass).sort((a, b) => b.score - a.score || a.index - b.index)[0];
  const text_human = best
    ? `${m.passed.length}/${m.variants.length} phương án đạt · chữ ${best.font_px} px · tương phản ${String(best.contrast).replace('.', ',')}:1`
    : 'Không phương án nào đạt: ' + m.variants.map((v) => `#${v.index + 1} ${[...new Set(v.fails.map((f) => f.rule))].join('/')}`).join(' · ');
  return { gate: 'G-THUMB', result: m.passed.length ? 'pass' : 'fail', measure: Object.assign({ text_human }, m) };
}

module.exports = { gateThumb, decodeRgb, contrastOf, diffRatio, jpegSize };
