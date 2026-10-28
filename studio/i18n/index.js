// © 2026 Gen Labs — All rights reserved.
// i18n vi (mặc định) + en: gộp chuỗi lõi (core.js) với chuỗi của từng gói UI (SPEC-0.2.0 §13.2: UI-D0 ov · UI-H1 brand · UI-L1 cast · UI-R2 review · UI-TUT lessons · UI-L5R3 lists).
// Mỗi module `studio/i18n/<tên>.js` export { vi, en } (vi và en CÙNG bộ khoá — test e-ui kiểm). Khoá trùng giữa các module ⇒ test h-studio đỏ (không im lặng đè nhau).
// studio/i18n.js là cửa cũ (export lại file này) nên mọi `import … from '../i18n.js'` giữ nguyên.
import * as core from './core.js';
import * as ov from './ov.js';
import * as brand from './brand.js';
import * as cast from './cast.js';
import * as review from './review.js';
import * as lessons from './lessons.js';
import * as lists from './lists.js';

export const MODULES = { core, ov, brand, cast, review, lessons, lists };
export const VI = Object.assign({}, ...Object.values(MODULES).map((m) => m.vi));
export const EN = Object.assign({}, ...Object.values(MODULES).map((m) => m.en));

const DICTS = { vi: VI, en: EN };
export const LANGS = ['vi', 'en'];
let lang = 'vi';

export function setLang(l) { if (DICTS[l]) lang = l; return lang; }
export function getLang() { return lang; }
export function has(key) { return Object.prototype.hasOwnProperty.call(DICTS[lang], key) || Object.prototype.hasOwnProperty.call(VI, key); }

export function t(key, vars) {
  let s = Object.prototype.hasOwnProperty.call(DICTS[lang], key) ? DICTS[lang][key] : Object.prototype.hasOwnProperty.call(VI, key) ? VI[key] : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
// Như t() nhưng trả `fallback` khi khoá không tồn tại (cột/trạng thái động).
export function tOr(key, fallback) { return has(key) ? t(key) : fallback; }
