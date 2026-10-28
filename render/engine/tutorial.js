// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §2.1, §13.2): gói U (video hướng dẫn) sở hữu file này và thay bằng bản thật.
// buildTutorialPlan(input) → plan — CÙNG cấu trúc với buildPlan (plan v2: kind 'tutorial', variant full|trailer, screens, cursor theo lược đồ test/h-fixtures.js `cursorSchemaErrors`,
// actors[].layout.mode 'pip', assetRefs của màn hình). input = đúng input của buildPlan (lesson.kind === 'tutorial', screens/host/music đi qua lesson hoặc input).
// Bản stub ném PlanError 'tutorial_unsupported' (điều kiện cắt F4 §13.4: tutorial chưa dựng được ⇒ pipeline chặn có chữ người đọc được, không sập).
'use strict';
const { PlanError } = require('./plan-error');

function buildTutorialPlan(input) {
  throw new PlanError('tutorial_unsupported', 'Loại bài "tutorial" chưa được cài ở bản này (gói F4 chưa bật).', { kind: 'tutorial' });
}

module.exports = { buildTutorialPlan };
