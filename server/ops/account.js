// © 2026 Gen Labs — All rights reserved.
// Brief Gen 31/10/2026 — "nơi đổi mật khẩu đăng nhập": user.change_password (route POST /api/me/password, server/api.js).
//   Quyền: actor.type==='user' tự đổi mật khẩu của CHÍNH MÌNH (c.a.id) — owner lẫn reviewer, không cần vai trò riêng.
//   Không có route/tool MCP tương ứng (cố ý, giống §10 studio-owner.js): agent không tự đổi được mật khẩu người dùng.
'use strict';
const secrets = require('../secrets.js');
const { validatePassword } = require('../auth.js');

function register(op, ctx) {
  const { db, err } = ctx;

  op('user.change_password', (a) => a.type === 'user', (c) => {
    const p = c.p;
    const u = db.get('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', c.a.id);
    if (!u) throw err('forbidden', 'Không tìm thấy người dùng của phiên hiện tại.', null);
    if (!secrets.verifyPassword(String(p.current_password || ''), u.password_hash)) {
      throw err('invalid', 'Mật khẩu hiện tại không đúng.', null);
    }
    validatePassword(p.new_password);
    if (secrets.verifyPassword(String(p.new_password), u.password_hash)) {
      throw err('invalid', 'Mật khẩu mới phải khác mật khẩu hiện tại.', null);
    }
    db.update('users', u.id, { password_hash: secrets.hashPassword(p.new_password) });
    // Huỷ mọi phiên khác của người này (giữ lại phiên hiện tại nếu route truyền keep_token_hash — không đẩy chính mình ra ngoài).
    if (p.keep_token_hash) db.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', u.id, p.keep_token_hash);
    else db.run('DELETE FROM sessions WHERE user_id=?', u.id);
    return { result: { ok: true }, entity: ['user', u.display_id], before: null, after: { password_changed: true } };
  });
}

module.exports = { register, OWNER: 'd-account' };
