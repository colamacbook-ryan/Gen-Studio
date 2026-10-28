// © 2026 Gen Labs — All rights reserved.
// Hợp đồng chung 0.2.0 do gói P0a cố định (SPEC-0.2.0 §2.1, §6.5, CNS-113) — không phải file test. Gói V/U/T dùng lại fixture + bộ kiểm này.

// Plan v2: các trường MỚI và mặc định của chúng (§2.1). Plan v1 + mặc định = plan v2 hợp lệ ⇒ bài cũ dựng lại đúng như trước.
const PLAN_V2_DEFAULTS = { kind: 'lesson', variant: 'full', actors: null, cursor: null, screens: null, thumbs: [], assetRefs: [], persona: {} };
function withV2Defaults(plan) {
  const out = Object.assign({}, plan);
  for (const [k, v] of Object.entries(PLAN_V2_DEFAULTS)) if (out[k] === undefined) out[k] = JSON.parse(JSON.stringify(v));
  out.style = Object.assign({ brand: null }, plan.style);
  return out;
}

// Lược đồ plan.assetRefs: [{ asset: string, label?: string, maxPx?: [w,h] }] (chuỗi trần cũng được = { asset })
function assetRefsErrors(refs) {
  const e = [];
  if (!Array.isArray(refs)) return ['assetRefs phải là mảng'];
  refs.forEach((r, i) => {
    const o = typeof r === 'string' ? { asset: r } : r;
    if (!o || typeof o !== 'object' || typeof o.asset !== 'string' || !o.asset) e.push(`assetRefs[${i}].asset phải là chuỗi không rỗng`);
    if (o && o.label !== undefined && typeof o.label !== 'string') e.push(`assetRefs[${i}].label phải là chuỗi`);
    if (o && o.maxPx !== undefined && !(Array.isArray(o.maxPx) && o.maxPx.length === 2 && o.maxPx.every((n) => Number.isFinite(n) && n > 0))) e.push(`assetRefs[${i}].maxPx phải là [w,h] dương`);
  });
  return e;
}

// Lược đồ plan.cursor (§6.5): { keys:[{t,x,y,kind,press}], clicks:[{t,x,y}], typing:[{t0,t1,target,text}], moves:[{t0,t1}] }; null = bài không phải tutorial.
// t* tính ms trên trục clip, x/y toạ độ khung 1920×1080 sau máy quay; thời gian không giảm; kind ∈ arrow|hand|ibeam.
const CURSOR_KINDS = ['arrow', 'hand', 'ibeam'];
function cursorSchemaErrors(c) {
  if (c === null) return [];
  const e = [], num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['cursor phải là object hoặc null'];
  for (const k of Object.keys(c)) if (!['keys', 'clicks', 'typing', 'moves'].includes(k)) e.push('cursor có khoá lạ: ' + k);
  for (const k of ['keys', 'clicks', 'typing', 'moves']) if (!Array.isArray(c[k])) e.push(`cursor.${k} phải là mảng`);
  if (e.length) return e;
  let prev = -Infinity;
  c.keys.forEach((k, i) => {
    if (!num(k.t) || !num(k.x) || !num(k.y)) e.push(`keys[${i}] cần t,x,y là số`);
    if (!CURSOR_KINDS.includes(k.kind)) e.push(`keys[${i}].kind ∉ ${CURSOR_KINDS.join('|')}`);
    if (typeof k.press !== 'boolean') e.push(`keys[${i}].press phải là boolean`);
    if (num(k.t)) { if (k.t < prev) e.push(`keys[${i}].t giảm dần`); prev = k.t; }
  });
  c.clicks.forEach((k, i) => { if (!num(k.t) || !num(k.x) || !num(k.y)) e.push(`clicks[${i}] cần t,x,y là số`); });
  c.typing.forEach((k, i) => {
    if (!num(k.t0) || !num(k.t1) || k.t1 < k.t0) e.push(`typing[${i}] cần t0 ≤ t1`);
    if (typeof k.target !== 'string' || typeof k.text !== 'string') e.push(`typing[${i}] cần target,text là chuỗi`);
  });
  c.moves.forEach((k, i) => { if (!num(k.t0) || !num(k.t1) || k.t1 < k.t0) e.push(`moves[${i}] cần t0 ≤ t1`); });
  return e;
}
// Fixture hợp lệ: một đường đi → bấm → gõ chữ → đi tiếp (V dùng cho đạo diễn `typing`/`point`, U dùng làm mẫu đầu ra compileCursor)
const CURSOR_FIXTURE = {
  keys: [
    { t: 0, x: 960, y: 540, kind: 'arrow', press: false },
    { t: 700, x: 1500, y: 300, kind: 'hand', press: false },
    { t: 760, x: 1500, y: 300, kind: 'hand', press: true },
    { t: 900, x: 1500, y: 300, kind: 'hand', press: false },
    { t: 1700, x: 700, y: 620, kind: 'ibeam', press: false },
    { t: 3200, x: 700, y: 620, kind: 'ibeam', press: false },
  ],
  clicks: [{ t: 760, x: 1500, y: 300 }],
  typing: [{ t0: 1800, t1: 3000, target: 'in_name', text: 'Lớp AI Bình Dân' }],
  moves: [{ t0: 0, t1: 700 }, { t0: 900, t1: 1700 }],
};

// Chữ ký renderStill / __still (§2.2) — test h-still kiểm bằng cách gọi thật
const STILL_MODES = ['thumb', 'frame', 'brand', 'cast'];

module.exports = { PLAN_V2_DEFAULTS, withV2Defaults, assetRefsErrors, cursorSchemaErrors, CURSOR_FIXTURE, CURSOR_KINDS, STILL_MODES };
