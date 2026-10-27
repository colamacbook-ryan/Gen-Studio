// © 2026 Gen Labs — All rights reserved.
// Chọn provider (fake khi config.fakeProviders) + lớp lỗi ProviderError dùng chung.
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

function get(config = {}) {
  return config.fakeProviders ? require('./fake') : require('./gemini');
}

module.exports = { get, ProviderError };
