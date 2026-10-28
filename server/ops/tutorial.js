// © 2026 Gen Labs — All rights reserved.
// STUB do gói P0b tạo (SPEC-0.2.0 §2.4, §13.2): gói U sở hữu file này và thay bằng bản thật. Hiện là no-op (có test "no-op" trong test/h-hooks.test.js).
// Sẽ có: ctx.ext.lessonExt.register({name:'tutorial', columns:['kind','variant','screens','host','music'], kinds:['tutorial'], validate}) (bỏ đăng ký ⇒ tutorial biến mất, điều kiện cắt F4 §13.4); asset.attest / asset.revoke_attest (owner + ConfirmModal/UI); ctx.ext.gates.register('G-CURSOR', …).
// register(op, ctx): ctx = { db, ws, err, byRef, need, allow, isOwner, agentHas, nonEmpty, newVersion, getSetting, putSetting, checkPolicy, ext, rights, op, around, validateBlock }
//   • op(name, who, run) — who: khoá trong ctx.allow (owner | ownerUi | compose | run | suggest | system …) hoặc hàm (actor) → boolean; run(c) → {result, entity:[kiểu,id], before, after}; c = {a (actor), p (payload), by, actor, entry}
//   • ctx.around(opName, wrap) — bọc op đã có · ctx.ext.{lessonExt, channelDefaults, suggestionApply, gates, hooks} — xem server/hooks.js
'use strict';

function register(op, ctx) { /* no-op: gói U viết phần thật */ }

module.exports = { register, OWNER: 'U' };
