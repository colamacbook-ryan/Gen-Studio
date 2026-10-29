// © 2026 Gen Labs — All rights reserved.
// Gói O (SPEC-0.2.0 §7.2 "Đã đăng", §10, §16): đánh dấu "đã đăng" để `runway` của Tổng quan có nghĩa khi chưa có Publication (GĐ2).
//   • render.mark_published / render.unmark_published — công tắc tay ở R3: CHỈ owner trong phiên UI (ownerUi).
//   • render.export_stamp — op nội bộ do hook `export.after` gọi (không có route/tool riêng): luôn đặt exported_at; chỉ khi người xuất là owner + phiên UI
//     VÀ hook báo entry 'ui' thì mới tự đặt published_at (published_source='export') nếu đang NULL. Agent gọi get_export (MCP) ⇒ chỉ exported_at.
//   • Quyền do op quyết theo ACTOR (không tin payload): hai lớp khoá — hook chỉ gửi mark=true khi entry==='ui', op chỉ nhận khi actor là owner UI.
//   • Trợ lý, CLI, runner không gọi được render.export_stamp (bị từ chối ở cổng write()). Mọi ô ✗ ở §10 có test âm trong test/g-overview.test.js.
// register(op, ctx): ctx = { db, ws, err, byRef, need, allow, isOwner, agentHas, nonEmpty, newVersion, getSetting, putSetting, checkPolicy, ext, rights, op, around, validateBlock }
'use strict';

const SYS = { type: 'system', id: 'publish', entry: 'system' };

function register(op, ctx) {
  const { db, need, err, allow, ext } = ctx;
  const view = (r) => ({ render: r.display_id, exported_at: r.exported_at || null, published_at: r.published_at || null, published_by: r.published_by || null, published_source: r.published_source || null });

  op('render.mark_published', 'ownerUi', (c) => {
    const r = need('renders', c.p.render, 'bản dựng');
    if (r.state !== 'approved') throw err('conflict', `Chỉ đánh dấu "đã đăng" được cho bản dựng đã duyệt (${r.display_id} đang "${r.state}").`, { render: r.display_id, state: r.state });
    const before = view(r);
    if (!r.published_at) db.update('renders', r.id, { published_at: db.now(), published_by: c.a.id, published_source: 'manual' });   // đã đăng rồi ⇒ giữ nguyên (idempotent)
    const after = view(need('renders', r.id, 'bản dựng'));
    return { result: after, entity: ['render', r.display_id], before, after };
  });

  op('render.unmark_published', 'ownerUi', (c) => {
    const r = need('renders', c.p.render, 'bản dựng');
    const before = view(r);
    if (r.published_at) db.update('renders', r.id, { published_at: null, published_by: null, published_source: null });
    const after = view(need('renders', r.id, 'bản dựng'));
    return { result: after, entity: ['render', r.display_id], before, after };
  });

  // Do hook export.after gọi qua write(actor, …): quyền 'run' (owner mọi entry · agent có scope run · system). Trợ lý, CLI, runner bị từ chối.
  op('render.export_stamp', 'run', (c) => {
    const r = need('renders', c.p.render, 'bản dựng');
    const before = view(r);
    const f = { exported_at: db.now() };
    if (c.p.mark === true && allow.ownerUi(c.a) && !r.published_at) Object.assign(f, { published_at: f.exported_at, published_by: c.a.id, published_source: 'export' });
    db.update('renders', r.id, f);
    const after = view(need('renders', r.id, 'bản dựng'));
    return { result: after, entity: ['render', r.display_id], before, after };
  });

  // Móc xuất gói (pipeline.exportRender): owner xuất từ UI ⇒ tự đánh dấu đã đăng; mọi đường khác chỉ ghi exported_at.
  // Không nuốt lỗi: ghi sai ⇒ ném ra để lệnh xuất báo lỗi.
  ext.hooks.on('export.after', ({ ctx: pctx, render, actor, entry }) => {
    if (!pctx || typeof pctx.write !== 'function') throw new Error('export.after: thiếu ctx.write');
    return pctx.write(actor || SYS, 'render.export_stamp', { render: render.display_id, mark: entry === 'ui' });
  });
}

module.exports = { register, OWNER: 'O' };
