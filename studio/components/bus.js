// © 2026 Gen Labs — All rights reserved.
// Bus sự kiện nhỏ: SSE 'change', trạng thái kết nối. Có debounce để dồn nhiều change thành 1 lần làm mới.
const subs = new Map();
export function on(evt, fn) {
  if (!subs.has(evt)) subs.set(evt, new Set());
  subs.get(evt).add(fn);
  return () => subs.get(evt).delete(fn);
}
export function emit(evt, payload) {
  for (const fn of subs.get(evt) || []) { try { fn(payload); } catch (e) { console.error(e); } }
}
export function onDebounced(evt, fn, ms = 250) {
  let timer = null;
  return on(evt, (p) => { clearTimeout(timer); timer = setTimeout(() => fn(p), ms); });
}
