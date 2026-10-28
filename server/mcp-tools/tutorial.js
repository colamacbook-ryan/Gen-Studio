// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §2.4): gói U sở hữu file này. Hiện không đăng ký tool nào (có test "no-op" trong test/h-hooks.test.js).
// Sẽ có: tool cho bài tutorial (vd validate_screens, get_mock_ui_schema), capabilities() thêm 14 thành phần DSL màn giả lập. asset.attest KHÔNG có tool (chỉ owner + UI, §10).
// tools(ctx) → [{ name, scope: 'read'|'compose'|'run', description, schema: {…properties}, required: [], handler(args, c) → {text, data, images?} }]
//   ctx = { db, write, config, deps?, caps } — dùng require('./_kit.js').kit(ctx) lấy: fail, S/N/O (kiểu schema), actorOf(c), need(bảng, ref, tên), channelOf, chanData, castOf, assigned, renderOf, ext.
//   c = { agent, scopes } (agent gọi tool). Tên tool phải DUY NHẤT toàn hệ thống (test h-contracts kiểm).
// capabilities(ctx, args) → object — gộp vào get_capabilities (không đè khoá lõi).
'use strict';

function tools(ctx) { return []; }
function capabilities(ctx, args) { return {}; }

module.exports = { tools, capabilities };
