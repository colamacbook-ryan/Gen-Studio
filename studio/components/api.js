// © 2026 Gen Labs — All rights reserved.
// Client REST: cookie phiên + X-CSRF cho thao tác ghi; lỗi chuẩn hoá {code,text_human,detail}.
import { normalizeError } from './util.js';

let csrf = '';
export function setCsrf(v) { csrf = v ? String(v) : ''; }
export function getCsrf() { return csrf; }

export async function api(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    if (csrf) opts.headers['X-CSRF'] = csrf;
    opts.body = JSON.stringify(body == null ? {} : body);
  }
  let res;
  try { res = await fetch(path, opts); } catch (e) {
    throw { code: 'network', text_human: '', detail: e && e.message ? e.message : 'fetch failed', status: 0 };
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const err = normalizeError(data && (data.error || data.text_human) ? (data.error || data) : { detail: text.slice(0, 300) });
    err.status = res.status;
    if (!err.code || err.code === 'error') err.code = 'http_' + res.status;
    throw err;
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b);

// /api/me -> {user, csrf}; trả null nếu chưa đăng nhập.
export async function loadMe() {
  try {
    const me = await get('/api/me');
    setCsrf(me && (me.csrf || me.csrf_token || (me.user && me.user.csrf)));
    return me;
  } catch (e) {
    if (e.status === 401) return null;
    throw e;
  }
}
