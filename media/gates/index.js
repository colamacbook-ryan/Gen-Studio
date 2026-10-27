// © 2026 Gen Labs — All rights reserved.
// 8 cổng kiểm R3: voiceGates (từng câu) + renderGates (bản dựng). 'unknown' luôn chặn.
'use strict';
const { voiceGates, tailSig } = require('./voice');
const { renderGates } = require('./render');

// Tổng hợp: có fail → 'fail'; không fail mà có unknown → 'unknown'; còn lại 'pass'.
function summarize(results) {
  return results.some((r) => r.result === 'fail') ? 'fail' : results.some((r) => r.result !== 'pass') ? 'unknown' : 'pass';
}

module.exports = { voiceGates, renderGates, tailSig, summarize };
