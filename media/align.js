// © 2026 Gen Labs — All rights reserved.
// Căn mốc từng từ: dùng word_times của giám khảo nếu hợp lệ, dự phòng chia theo ký tự (±0,3 s).
'use strict';

function fromJudge(wt, duration_ms) {
  if (!Array.isArray(wt) || !wt.length) return null;
  const out = [];
  for (const x of wt) {
    if (!x || typeof x.w !== 'string' || !Number.isFinite(x.t0) || !Number.isFinite(x.t1)) return null;
    out.push({ w: x.w, t0: Math.max(0, Math.min(duration_ms, x.t0)), t1: Math.max(0, Math.min(duration_ms, x.t1)) });
  }
  out.sort((a, b) => a.t0 - b.t0);
  let prev = 0;
  for (const o of out) { if (o.t0 < prev) o.t0 = prev; if (o.t1 < o.t0) o.t1 = o.t0; prev = o.t1; }
  return out;
}

function align({ say, duration_ms, judgeWordTimes = null }) {
  const j = fromJudge(judgeWordTimes, duration_ms);
  const words = String(say || '').split(/\s+/).filter(Boolean);
  // Chỉ tin giám khảo khi số từ không lệch quá xa kịch bản
  if (j && Math.abs(j.length - words.length) <= Math.max(1, Math.ceil(words.length * 0.3))) return j;
  const total = words.reduce((a, w) => a + w.length + 1, 0);
  let acc = 0;
  return words.map((w) => {
    const t0 = Math.round((acc / total) * duration_ms);
    acc += w.length + 1;
    return { w, t0, t1: Math.round((acc / total) * duration_ms) };
  });
}

module.exports = { align };
