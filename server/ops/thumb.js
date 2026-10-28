// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §2.4, §13.2): gói T sở hữu file này và thay bằng bản thật. Hiện là no-op (có test "no-op" trong test/h-hooks.test.js).
// Sẽ có: ctx.ext.lessonExt.register({name:'thumbnail', columns:['thumbnail'], validate}) + bật luật policy.thumbnail_required; ctx.ext.channelDefaults.register(() => ({policy:{thumbnail_required:true}, brand:preset})) cho kênh mới (CNS-123); ctx.ext.hooks.on('plan.after', …) đặt plan.thumbs; ctx.ext.gates.register('G-THUMB', …); op thumbnail.pick (chỉ owner + UI).
// register(op, ctx): ctx = { db, ws, err, byRef, need, allow, isOwner, agentHas, nonEmpty, newVersion, getSetting, putSetting, checkPolicy, ext, rights, op, around, validateBlock }
//   • op(name, who, run) — who: khoá trong ctx.allow (owner | ownerUi | compose | run | suggest | system …) hoặc hàm (actor) → boolean; run(c) → {result, entity:[kiểu,id], before, after}; c = {a (actor), p (payload), by, actor, entry}
//   • ctx.around(opName, wrap) — bọc op đã có · ctx.ext.{lessonExt, channelDefaults, suggestionApply, gates, hooks} — xem server/hooks.js
'use strict';

function register(op, ctx) { /* no-op: gói T viết phần thật */ }

module.exports = { register, OWNER: 'T' };
