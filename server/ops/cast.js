// © 2026 Gen Labs — All rights reserved.
// Gói V (SPEC-0.2.0 §3, §10, §13.2): kiểm công thức nhân vật phía server + chốt/cho nghỉ nhân vật + móc cho đạo diễn.
//   • cast.save (đã có ở lõi, quyền compose) được BỌC bằng ctx.around('cast.save', …): công thức qua validateRecipe (lược đồ §3.5, cổng engine, luật cứng §3.4 so với nhân vật khác cùng kênh)
//     TRƯỚC khi ghi — sai ⇒ từ chối bằng chữ người đọc được, KHÔNG tạo version. `status` nhận draft | candidate; approved/retired chỉ qua cast.approve / cast.retire.
//   • cast.approve / cast.retire: CHỈ owner trên phiên UI (allow.ownerUi) — agent, trợ lý, CLI, runner, owner qua HTTP đều bị từ chối (§10). Cố ý KHÔNG có tool MCP.
//     Bản dựng dùng approved_version (server/pipeline.js loadBundle); sửa nhân vật đã chốt ⇒ current_version > approved_version = "approved · có thay đổi chờ chốt" (suy ra, không lưu cột).
//   • hook plan.input: nhét plan.persona từ công thức (kinh thánh tính cách) cho đạo diễn; hook plan.after: nhét bảng tâm trạng plan.moods (trang sân khấu không đọc được file JSON).
// register(op, ctx): ctx = { db, ws, err, byRef, need, allow, … , around, ext } — xem server/write.js.
'use strict';

const OWNER = 'V (và K cho dữ liệu)';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SAVE_STATUS = ['draft', 'candidate'];

function register(op, ctx) {
  const { db, err, need, byRef, around, ext } = ctx;
  if (!db || !around) return;   // test cũ gọi register với ctx rỗng: không có gì để đăng ký
  const { validateRecipe } = require('../../render/cast/validate.js');
  const castLib = require('../../render/cast');
  const direct = require('../../render/engine/direct.js');

  const dataOf = (m, ver) => { const r = db.json(db.get('SELECT data FROM cast_versions WHERE entity_id=? AND version=?', m.id, ver)); return r && r.data; };
  const channelInfo = (chId) => {
    const ch = db.get('SELECT * FROM channels WHERE id=?', chId);
    const cv = ch && db.json(db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, ch.current_version));
    const brand = cv && cv.data && isObj(cv.data.brand) ? cv.data.brand : null;
    return { name: ch ? ch.name : '', brand };
  };
  // nhân vật KHÁC cùng kênh (không tính đã xoá/đã nghỉ); bản đang dùng để dựng: approved_version nếu đã chốt, không thì current_version
  const siblingsOf = (chId, selfId) => db.all("SELECT * FROM cast_members WHERE channel_id=? AND deleted_at IS NULL AND status<>'retired'", chId)
    .filter((m) => m.id !== selfId)
    .map((m) => ({ ref: m.display_id, name: m.name, data: dataOf(m, m.status === 'approved' && m.approved_version ? m.approved_version : m.current_version) || {} }));
  // so khớp cast mặc định đóng gói bằng JSON chuẩn hoá khoá (thứ tự khoá không quan trọng)
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  const SHIPPED = Object.values(castLib.defaults().cast).map((r) => JSON.stringify(canon(r)));
  // Chế độ do SERVER quyết (không bao giờ theo dữ liệu khách):
  //   • agent (mọi đường token/OAuth/MCP): luôn v2 — không legacy, không light, cổng engine chạy mỗi lần;
  //   • legacy chỉ khi cột cast_members.origin (server đặt) ∈ {seed, migration} VÀ người lưu là owner/system; light chỉ cho owner (giữ chỗ vô hại, không bao giờ chốt được);
  //   • shipped = công thức TRÙNG NỘI DUNG cast mặc định đóng gói (là chính nó, không có gì mới để va chạm).
  function check(data, chId, selfId, extra, actor) {
    const info = channelInfo(chId), shipped = SHIPPED.includes(JSON.stringify(canon(data)));
    const cur = selfId ? db.get('SELECT * FROM cast_members WHERE id=?', selfId) : null;
    const agentActor = !actor || actor.type === 'agent' || !(actor.type === 'user' || actor.type === 'system');
    const trusted = !agentActor && !!cur && (cur.origin === 'seed' || cur.origin === 'migration');
    const allowLegacy = trusted, allowLight = !agentActor;
    return validateRecipe(data, Object.assign({ shipped: shipped && allowLegacy, allowLegacy, allowLight, library: castLib.library(), brand: info.brand, channelName: info.name, siblings: siblingsOf(chId, selfId) }, extra));
  }
  function reject(v) {
    const first = v.errors.slice(0, 3).map((e) => (e.path ? `${e.path}: ` : '') + e.text_human).join(' · ');
    const more = v.errors.length > 3 ? ` (+${v.errors.length - 3} lỗi nữa)` : '';
    return err('invalid', `Công thức nhân vật không hợp lệ — ${first}${more}`, { errors: v.errors, warnings: v.warnings });
  }

  // ---- cast.save: kiểm công thức rồi mới ghi ----
  around('cast.save', (prev) => (c) => {
    const p = c.p;
    if (p.status !== undefined && !SAVE_STATUS.includes(p.status)) {
      throw err('invalid', 'Khi lưu chỉ đặt được trạng thái "draft" hoặc "candidate". Chốt dùng (approved) và cho nghỉ (retired) là việc của chủ xưởng trên giao diện.', { status: p.status });
    }
    let warnings = [];
    if (p.data && typeof p.data === 'object') {   // data thiếu/sai kiểu: để op lõi báo lỗi quen thuộc
      const m = p.id ? need('cast_members', p.id, 'nhân vật') : null;
      const chId = m ? m.channel_id : need('channels', p.channel, 'kênh').id;
      const v = check(p.data, chId, m ? m.id : null, { strict: p.status === 'candidate' }, c.a);
      if (!v.ok) throw reject(v);
      warnings = v.warnings;
    }
    const r = prev(c), out = r.result;   // run của op trả { result, entity, before, after }
    const m = need('cast_members', out.display_id, 'nhân vật');
    if (!p.id) db.update('cast_members', m.id, { origin: c.a.type === 'user' ? 'owner' : 'agent' });   // nguồn gốc do server đặt, không bao giờ từ payload
    // chỉ chuyển giữa draft ↔ candidate; nhân vật đã chốt/đã nghỉ giữ nguyên trạng thái (sửa đã chốt ⇒ "có thay đổi chờ chốt")
    if (p.status !== undefined && SAVE_STATUS.includes(m.status) && m.status !== p.status) db.update('cast_members', m.id, { status: p.status });
    const now = byRef('cast_members', m.id);
    const result = Object.assign({}, out, { status: now.status, approved_version: now.approved_version === undefined ? null : now.approved_version }, warnings.length ? { warnings } : {});
    return Object.assign({}, r, { result, after: Object.assign({}, r.after, { status: now.status }) });
  });

  // ---- cast.approve / cast.retire: chỉ owner + phiên UI ----
  op('cast.approve', 'ownerUi', (c) => {
    const m = need('cast_members', c.p.cast || c.p.id, 'nhân vật');
    if (m.status === 'retired') throw err('conflict', 'Nhân vật đã cho nghỉ — không chốt dùng được.', { status: m.status });
    const ver = c.p.version === undefined ? m.current_version : c.p.version;
    if (!Number.isInteger(ver) || ver < 1 || ver > m.current_version) throw err('invalid', `Phiên bản ${ver} không có (nhân vật có v1…v${m.current_version}).`, { version: ver });
    const data = dataOf(m, ver);
    const v = check(data || {}, m.channel_id, m.id, { strict: true }, c.a);
    if (!v.ok) throw reject(v);
    const u = db.get('SELECT id FROM users WHERE id=?', c.a.id);
    const f = { status: 'approved', approved_version: ver, approved_by: u ? u.id : null, approved_at: db.now() };
    db.update('cast_members', m.id, f);
    return { result: byRef('cast_members', m.id), entity: ['cast_member', m.display_id], before: { status: m.status, approved_version: m.approved_version === undefined ? null : m.approved_version }, after: { status: 'approved', approved_version: ver } };
  });
  op('cast.retire', 'ownerUi', (c) => {
    const m = need('cast_members', c.p.cast || c.p.id, 'nhân vật');
    if (m.status === 'retired') throw err('conflict', 'Nhân vật đã nghỉ rồi.', { status: m.status });
    db.update('cast_members', m.id, { status: 'retired' });
    return { result: byRef('cast_members', m.id), entity: ['cast_member', m.display_id], before: { status: m.status }, after: { status: 'retired' } };
  });

  // ---- móc pipeline cho đạo diễn (render/engine/direct.js) ----
  if (ext && ext.hooks) {
    // kinh thánh tính cách của từng nhân vật có lời → plan.persona (khoá = mã nhân vật). Chỗ khác (gói U) đã đặt thì giữ nguyên.
    ext.hooks.on('plan.input', ({ B, input }) => {
      const persona = Object.assign({}, isObj(input.persona) ? input.persona : {});
      for (const l of B.lines || []) {
        const id = l.cast && l.cast.display_id, d = l.cast_data;
        if (!id || persona[id] || !d || !isObj(d.persona)) continue;
        persona[id] = Object.assign({}, d.persona, isObj(d.running_gag) ? { running_gag: d.running_gag } : {}, isObj(d.catchphrase) ? { catchphrase: d.catchphrase } : {}, isObj(d.dynamic) ? { dynamic: d.dynamic } : {});
      }
      input.persona = persona;
    });
    ext.hooks.on('plan.after', ({ plan }) => { if (plan && !plan.moods) plan.moods = direct.MOODS; });
  }
}

module.exports = { register, OWNER };
