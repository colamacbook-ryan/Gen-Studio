// © 2026 Gen Labs — All rights reserved.
// Chọn adapter theo vendor (bảng tĩnh — không nạp module theo chuỗi DB; fake khi config.fakeProviders) + lớp lỗi ProviderError dùng chung.
'use strict';

class ProviderError extends Error {
  // code: 'quota' | 'auth' | 'transient' | 'bad_output'
  constructor(code, text_human, { retryAfterSec = null, detail = null } = {}) {
    super(text_human);
    this.name = 'ProviderError';
    this.code = code;
    this.text_human = text_human;
    this.retryAfterSec = retryAfterSec;
    this.detail = detail;
  }
}

// vendor → adapter. Thêm nhà cung cấp = thêm một dòng ở đây + VENDORS ở server/write.js (INT-06).
const ADAPTERS = {
  gemini: () => require('./gemini'),
  offline: (config) => require('./offline').bind(config),   // sidecar `voice` (GS_VOICE_URL)
};
function get(config = {}, vendor = 'gemini') {
  if (config.fakeProviders) return require('./fake');
  if (!Object.hasOwn(ADAPTERS, vendor)) throw new ProviderError('bad_output', 'Nhà cung cấp chưa được hỗ trợ.', { detail: String(vendor).slice(0, 40) });
  return ADAPTERS[vendor](config);
}

module.exports = { get, ProviderError, VENDORS: Object.keys(ADAPTERS) };
