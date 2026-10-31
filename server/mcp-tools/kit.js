// © 2026 Gen Labs — All rights reserved.
// Tool MCP Muse/review cho Gen Kit (0.3.0-B, SPEC-GK-0.1): nộp hàng theo ô Bộ Neo + chạy máy kiểm thường trực.
// Muse (scope assets.submit): kit_list · kit_claim · kit_get_input · kit_submit · kit_upload_chunk · kit_report_blocked.
// Review (scope assets.review): kit_review_list · kit_propose · kit_certify (chỉ owner — xem ghi chú ở tool).
// "theo phiếu": gói A không dựng asset_requests (xem ghi chú đầu migrations/0006_kit_library.sql) nên ở đây "phiếu" =
// nhóm ô (group_code, STANDARD-KIT-v1 §2.1 NB-01..NB-10) — quyết định tự chọn gói B, chờ asset_requests ở gói sau.
'use strict';
const fs = require('node:fs');
const { kit } = require('./_kit.js');
const pipeline = require('../pipeline.js');
const queueMod = require('../queue.js');
const { toDbResults } = require('../checks/to-db.js');

const PAGE_MAX = 200;
const page = (a) => Math.max(1, parseInt(a.page, 10) || 1);
const pageSize = (a) => Math.min(PAGE_MAX, Math.max(1, parseInt(a.page_size, 10) || 50));

function tools(ctx) {
  const { db, write, S, N, fail, actorOf } = kit(ctx);

  const slotStatus = (row, nowIso) => {
    const certified = !!db.get('SELECT 1 AS x FROM kit_certs WHERE kit_slot=? LIMIT 1', row.code);
    if (certified) return 'certified';
    const claimed = row.claimed_by && row.claim_expires_at && row.claim_expires_at > nowIso;
    if (claimed) return 'claimed';
    const submitted = !!db.get("SELECT 1 AS x FROM asset_submissions WHERE kit_slot=? AND state='submitted' LIMIT 1", row.code);
    if (submitted) return 'submitted';
    // 'blocked' (PR #33 review #5 — lần 3 liên tiếp, chờ Ryan áp dụng đề xuất) hiển thị gộp vào "rework" cho Muse:
    // dù sao cũng không claim/nộp lại được cho tới khi Ryan quyết — chi tiết xem kit_get_input.rework.
    const rework = !!db.get("SELECT 1 AS x FROM asset_submissions WHERE kit_slot=? AND state IN ('rework','blocked') LIMIT 1", row.code);
    if (rework) return 'rework';
    return 'free';
  };

  const slotText = (s) => `${s.code} [${s.status}] ${s.title_vi}`;

  return [
    { name: 'kit_list', scope: 'assets.submit', description: 'Danh sách ô Bộ Neo theo trạng thái (free|claimed|submitted|rework|certified) và/hoặc nhóm (group_code NB-01..NB-10, dùng tạm thay "phiếu" — chưa có asset_requests). Phân trang.',
      schema: { state: S, group: S, page: N, page_size: N }, required: [], handler: (a) => {
        const now = db.now();
        let rows = db.all('SELECT * FROM kit_slots WHERE workspace_id=? AND retired_in IS NULL ORDER BY code', db.ws);
        rows = rows.map((r) => ({ code: r.code, group_code: r.group_code, title_vi: r.title_vi, title_en: r.title_en, status: slotStatus(r, now) }));
        if (a.group) rows = rows.filter((r) => r.group_code === a.group);
        if (a.state) rows = rows.filter((r) => r.status === a.state);
        const pg = page(a), sz = pageSize(a), total = rows.length;
        const items = rows.slice((pg - 1) * sz, pg * sz);
        return { text: items.map(slotText).join('\n') || 'Không có ô khớp bộ lọc.', data: { items, page: pg, page_size: sz, total } };
      } },
    { name: 'kit_claim', scope: 'assets.submit', description: 'Nhận một ô Bộ Neo để làm (⇒ "Đang làm"), khoá theo agent, hết hạn claim sau 2 giờ không nộp.',
      schema: { kit_slot: S }, required: ['kit_slot'], handler: (a, c) => {
        const r = write(actorOf(c), 'kit.claim', { kit_slot: a.kit_slot });
        return { text: `Đã nhận ô ${r.kit_slot}, hết hạn claim lúc ${r.claim_expires_at}.`, data: r };
      } },
    { name: 'kit_get_input', scope: 'assets.submit', description: 'Ảnh gốc/tham chiếu + chuẩn của một ô (spec, nhóm, tiêu chí) — và lần nộp gần nhất của bạn nếu đang "rework" (lý do + tiêu chí trượt).',
      schema: { kit_slot: S }, required: ['kit_slot'], handler: (a, c) => {
        const slot = db.get('SELECT * FROM kit_slots WHERE workspace_id=? AND code=?', db.ws, a.kit_slot);
        if (!slot) throw fail('not_found', `Không tìm thấy ô "${a.kit_slot}".`);
        const out = { kit_slot: slot.code, group_code: slot.group_code, title_vi: slot.title_vi, title_en: slot.title_en, spec: slot.spec ? JSON.parse(slot.spec) : null };
        // tham chiếu tốt nhất hiện có: asset đã chứng nhận cho CHÍNH ô này (nếu có)
        const cert = db.get('SELECT asset_id FROM kit_certs WHERE kit_slot=? ORDER BY at DESC LIMIT 1', slot.code);
        if (cert) { const as = db.get('SELECT * FROM assets WHERE id=?', cert.asset_id); if (as) out.reference_asset = { display_id: as.display_id, url: '/media/' + as.display_id, mime: as.mime }; }
        // lần nộp gần nhất CỦA AGENT NÀY cho ô này đang chờ làm lại (rework) — mang theo lý do + tiêu chí trượt
        const rw = db.get("SELECT * FROM asset_submissions WHERE kit_slot=? AND agent_id=? AND state='rework' ORDER BY created_at DESC LIMIT 1", slot.code, c.agent.id);
        if (rw) {
          const checks = db.all("SELECT criterion, level, detail FROM asset_checks WHERE submission_id=? AND level='fail' ORDER BY created_at", rw.id);
          out.rework = { submission: rw.display_id, attempt: rw.attempt, reason: rw.decision_reason, failed_criteria: checks.map((x) => ({ criterion: x.criterion, detail: x.detail })) };
        }
        return { text: `Ô ${slot.code}: ${slot.title_vi}` + (out.rework ? ` — ĐANG LÀM LẠI lần ${rw.attempt + 1}: ${rw.decision_reason}` : ''), data: out };
      } },
    { name: 'kit_submit', scope: 'assets.submit', description: 'Nộp nội dung cho một ô (nên kit_claim trước). Nội dung nhỏ ≤256 KB: gửi data_base64 hoặc text. Tệp lớn tới 50 MB: tải trước bằng kit_upload_chunk rồi gửi upload_session thay cho data_base64. Chạy máy kiểm ngay sau khi lưu; trượt tiêu chí M thì tự trả về làm lại (tối đa 2 lần tự động, lần 3 chờ Ryan). Nộp lại sau khi làm lại: gọi lại đúng kit_slot — server TỰ nối vào lần nộp trước (đang "rework") của bạn, không nhận tham số previous.',
      schema: { kit_slot: S, declared_mime: S, data_base64: S, text: S, upload_session: S }, required: ['kit_slot'], handler: async (a, c) => {
        let buf, tmpToClean = null;
        if (a.upload_session) {
          // kit_upload_chunk(action=finish) có thể đã đóng phiên trước đó — chỉ finish lại nếu còn "open" (tránh lỗi "đã done").
          // review Gen (0.3.0-B, mục 4 [nên], IDOR): kiểm agent_id NGAY ở đây cho CẢ HAI nhánh (trước chỉ nhánh
          // 'open' đi qua write('upload.finish') — op đó tự kiểm chủ; nhánh state≠'open' trước đây dùng thẳng `row`
          // không kiểm, cho phép đọc/nộp bằng phiên tải của agent khác nếu đoán/dò được id phiên — IDOR.
          const row = db.get('SELECT * FROM upload_sessions WHERE workspace_id=? AND id=?', db.ws, a.upload_session);
          if (!row || row.agent_id !== c.agent.id) throw fail('not_found', 'Không tìm thấy phiên tải.', { session: a.upload_session });
          const fin = row.state === 'open' ? write(actorOf(c), 'upload.finish', { session: a.upload_session }) : row;
          buf = fs.readFileSync(fin.tmp_path);
          tmpToClean = fin.tmp_path;
          if (!a.declared_mime && fin.declared_mime) a.declared_mime = fin.declared_mime;
        } else if (a.data_base64) {
          buf = Buffer.from(a.data_base64, 'base64');
        } else if (a.text) {
          buf = Buffer.from(a.text, 'utf8');
        } else {
          throw fail('invalid', 'Cần data_base64, text, hoặc upload_session (tệp lớn — xem kit_upload_chunk).');
        }
        if (!buf || !buf.length) throw fail('invalid', 'Nội dung rỗng.');
        if (buf.length > 262144 && !a.upload_session) throw fail('invalid', `Nội dung ${buf.length} byte vượt 256 KB — dùng kit_upload_chunk cho tệp lớn.`);
        const subRes = write(actorOf(c), 'submission.submit', { kit_slot: a.kit_slot, bytes: buf, declared_mime: a.declared_mime || null });
        if (tmpToClean) { try { fs.unlinkSync(tmpToClean); } catch { /* best-effort, tệp tạm không chặn luồng */ } }
        const sub = subRes.submission, asset = subRes.asset;
        const file = pipeline.assetFile(db, asset.id).file;
        // máy kiểm chạy qua tiến trình con (gói E, cli/check-kit.js — không chặn vòng lặp sự kiện của server).
        let runResult;
        try {
          runResult = await queueMod.runAssetCheck(ctx, { file, slot: a.kit_slot });
        } catch (e) { throw fail('invalid', 'Máy kiểm lỗi khi đọc tệp: ' + ((e && e.message) || e)); }
        const verdict = runResult.verdict, checkList = runResult.checks;
        const runId = `kit-${sub.display_id}-${Date.now()}`;
        // record_checks/auto_rework đòi quyền 'review' (system hoặc assets.review) — máy kiểm chạy thay mặt hệ thống, không phải Muse đang nộp.
        const sysActor = { type: 'system', entry: 'system' };
        write(sysActor, 'submission.record_checks', { submission: sub.display_id, run_id: runId, results: toDbResults(runResult) });
        let state = 'submitted', reworkInfo = null;
        if (verdict === 'rework') {
          const rw = write(sysActor, 'submission.auto_rework', { submission: sub.display_id });
          if (rw && rw.blocked) { state = 'blocked_for_ryan'; reworkInfo = rw; }
          else { state = 'rework'; reworkInfo = rw; }
        }
        return { text: `Nộp ${sub.display_id} cho ô ${a.kit_slot}: ${verdict}${state === 'rework' ? ' (trả về làm lại)' : state === 'blocked_for_ryan' ? ' (lần 3 — chờ Ryan)' : ''}.`,
          data: { submission: sub.display_id, asset: asset.display_id, verdict, state, checks: checkList, rework: reworkInfo } };
      } },
    { name: 'kit_upload_chunk', scope: 'assets.submit', description: 'Tải nội dung lớn (tới 50 MB) theo chunk ≤1 MB cho kit_submit. action=start (mở phiên, trả session) | chunk (index từ 0, data_base64 ≤1 MB) | finish (đóng phiên, dùng session này làm upload_session của kit_submit).',
      schema: { action: S, session: S, kit_slot: S, declared_mime: S, index: N, data_base64: S }, required: ['action'], handler: (a, c) => {
        if (a.action === 'start') {
          if (!a.kit_slot) throw fail('invalid', 'Cần kit_slot để mở phiên tải.');
          const r = write(actorOf(c), 'upload.start', { kit_slot: a.kit_slot, declared_mime: a.declared_mime || null });
          return { text: `Phiên tải ${r.session} đã mở cho ô ${r.kit_slot}.`, data: r };
        }
        if (a.action === 'chunk') {
          if (!a.session) throw fail('invalid', 'Cần session.');
          const r = write(actorOf(c), 'upload.chunk', { session: a.session, index: a.index, data_base64: a.data_base64 });
          return { text: `Đã nhận chunk #${a.index}, tổng ${r.received_bytes} byte.`, data: r };
        }
        if (a.action === 'finish') {
          if (!a.session) throw fail('invalid', 'Cần session.');
          const r = write(actorOf(c), 'upload.finish', { session: a.session });
          return { text: `Phiên ${r.session} xong, ${r.bytes} byte — dùng upload_session="${r.session}" khi gọi kit_submit.`, data: { session: r.session, bytes: r.bytes, kit_slot: r.kit_slot } };
        }
        throw fail('invalid', 'action phải là start | chunk | finish.', { action: a.action });
      } },
    { name: 'kit_report_blocked', scope: 'assets.submit', description: 'Báo không nộp được ô đang giữ (thiếu tham chiếu, lỗi đề bài…) — ghi lý do và bỏ claim.',
      schema: { kit_slot: S, reason: S }, required: ['kit_slot', 'reason'], handler: (a, c) => {
        const r = write(actorOf(c), 'kit.report_blocked', { kit_slot: a.kit_slot, reason: a.reason });
        return { text: `Đã bỏ ô ${r.kit_slot}: ${a.reason}`, data: r };
      } },
    { name: 'kit_review_list', scope: 'assets.review', description: 'Danh sách lần nộp đang chờ xét (state=submitted mặc định), phân trang.',
      schema: { state: S, kit_slot: S, page: N, page_size: N }, required: [], handler: (a) => {
        const state = a.state || 'submitted';
        let rows = db.all('SELECT * FROM asset_submissions WHERE workspace_id=? AND state=?' + (a.kit_slot ? ' AND kit_slot=?' : '') + ' ORDER BY created_at',
          db.ws, state, ...(a.kit_slot ? [a.kit_slot] : []));
        const pg = page(a), sz = pageSize(a), total = rows.length;
        const items = rows.slice((pg - 1) * sz, pg * sz).map((r) => ({ submission: r.display_id, kit_slot: r.kit_slot, asset: db.get('SELECT display_id FROM assets WHERE id=?', r.asset_id).display_id, attempt: r.attempt, checks_level: r.checks_level, created_at: r.created_at }));
        return { text: items.map((x) => `${x.submission} · ${x.kit_slot} · lần ${x.attempt} · kiểm=${x.checks_level || '—'}`).join('\n') || 'Không có lần nộp nào khớp.', data: { items, page: pg, page_size: sz, total } };
      } },
    { name: 'kit_propose', scope: 'assets.review', description: 'Đề xuất quyết định (approve/rework/reject) cho một lần nộp — vào hàng chờ duyệt của Ryan, không tự đổi trạng thái.',
      schema: { submission: S, verdict: S, reason: S }, required: ['submission', 'verdict', 'reason'], handler: (a, c) => {
        const r = write(actorOf(c), 'submission.propose', { submission: a.submission, verdict: a.verdict, reason: a.reason });
        return { text: `Đã đề xuất ${a.verdict} cho ${a.submission} (${r.display_id}).`, data: { suggestion: r.display_id } };
      } },
    { name: 'kit_certify', scope: 'assets.review', description: 'Chứng nhận ô ngoài hàng chờ (kit.certify) — CHỈ chủ xưởng trên phiên UI thực hiện được (ownerUi, STANDARD-KIT-v1 §5); agent gọi tool này sẽ luôn nhận "forbidden". Đăng ký ở đây để có mặt trong tools/list theo scope assets.review, chờ phiên owner qua MCP ở gói sau.',
      schema: { asset: S, kit_slot: S, submission: S }, required: ['asset'], handler: (a, c) => {
        const r = write(actorOf(c), 'kit.certify', { asset: a.asset, kit_slot: a.kit_slot || null, submission: a.submission || null });
        return { text: `Đã chứng nhận ${a.asset}.`, data: { kit_certs: r.id } };
      } },
  ];
}

module.exports = { tools };
