// © 2026 Gen Labs — All rights reserved.
// MO-01 (STANDARD-KIT-v1.md §4.6 · DB-GK-0.1.md §7): Lottie JSON ≤ 5 MB, có đủ trường bắt buộc,
// từ chối expression (thuộc tính `x` là chuỗi mã) và tài nguyên ngoài (`u`/`p` là URL http(s)).
'use strict';

const MAX_BYTES = 5 * 1024 * 1024;
const REQUIRED = ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers'];

function hasExpression(node) {
  if (!node || typeof node !== 'object') return false;
  if (typeof node.x === 'string') return true; // thuộc tính động = chuỗi mã JS (expression)
  for (const k of Object.keys(node)) {
    if (k === 'x') continue;
    const v = node[k];
    if (v && typeof v === 'object' && hasExpression(v)) return true;
  }
  return false;
}

function hasExternalAsset(node) {
  if (!node || typeof node !== 'object') return false;
  if (typeof node.u === 'string' && /^https?:\/\//i.test(node.u)) return true;
  if (typeof node.p === 'string' && /^https?:\/\//i.test(node.p)) return true;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) { for (const it of v) if (hasExternalAsset(it)) return true; }
    else if (v && typeof v === 'object' && hasExternalAsset(v)) return true;
  }
  return false;
}

function lottieOk(buf) {
  if (buf.length > MAX_BYTES) return { ok: false, reason: 'quá 5 MB' };
  let j;
  try { j = JSON.parse(buf.toString('utf8')); } catch (e) { return { ok: false, reason: 'JSON không hợp lệ: ' + e.message }; }
  if (!j || typeof j !== 'object') return { ok: false, reason: 'không phải object JSON' };
  for (const k of REQUIRED) if (!(k in j)) return { ok: false, reason: 'thiếu trường "' + k + '"' };
  if (!Array.isArray(j.layers)) return { ok: false, reason: '"layers" không phải mảng' };
  if (hasExpression(j)) return { ok: false, reason: 'chứa expression (thuộc tính động dạng mã)' };
  if (hasExternalAsset(j)) return { ok: false, reason: 'tham chiếu tài nguyên ngoài qua URL http(s)' };
  return { ok: true };
}

module.exports = { lottieOk, MAX_BYTES, REQUIRED };
