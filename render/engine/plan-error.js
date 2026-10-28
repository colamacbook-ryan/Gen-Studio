// © 2026 Gen Labs — All rights reserved.
// Lỗi dựng plan có mã + chữ người đọc được (pipeline đổi thành Block). Tách riêng để timeline.js và tutorial.js dùng chung mà không vòng require.
'use strict';

class PlanError extends Error {
  constructor(code, text_human, detail) { super(text_human); this.name = 'PlanError'; this.code = code; this.text_human = text_human; this.detail = detail || null; }
}

module.exports = { PlanError };
