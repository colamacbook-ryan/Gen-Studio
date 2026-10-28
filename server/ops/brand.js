// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §2.4, §13.2): gói B sở hữu file này và thay bằng bản thật. Hiện là no-op (có test "no-op" trong test/h-hooks.test.js).
// Sẽ có: brand.propose (agent tạo SG- target_kind channel_brand) + ctx.ext.suggestionApply.register('channel_brand', {validate, apply}) để owner áp dụng một chạm; kiểm brand (brand.check) khi lưu.
// register(op, ctx): ctx = { db, ws, err, byRef, need, allow, isOwner, agentHas, nonEmpty, newVersion, getSetting, putSetting, checkPolicy, ext, rights, op, around, validateBlock }
//   • op(name, who, run) — who: khoá trong ctx.allow (owner | ownerUi | compose | run | suggest | system …) hoặc hàm (actor) → boolean; run(c) → {result, entity:[kiểu,id], before, after}; c = {a (actor), p (payload), by, actor, entry}
//   • ctx.around(opName, wrap) — bọc op đã có · ctx.ext.{lessonExt, channelDefaults, suggestionApply, gates, hooks} — xem server/hooks.js
'use strict';

function register(op, ctx) { /* no-op: gói B viết phần thật */ }

module.exports = { register, OWNER: 'B' };
