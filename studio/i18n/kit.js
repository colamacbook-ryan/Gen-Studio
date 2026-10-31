// © 2026 Gen Labs — All rights reserved.
// Chuỗi giao diện Gói D (0.3.0) — UI Kho song ngữ: A1 Tổng quan kho · A2 Hàng chờ duyệt · A3 Chi tiết ô ·
// A4 Phiếu/Muse (token + claim) · A5 Nhật ký kiểm · A6 Cài đặt kho. Nằm trong SHARED (không MODULES, test h-studio khoá
// danh sách MODULES) — cùng luật với aspect.js: vi và en CÙNG bộ khoá, không trùng khoá module khác.
export const vi = {
  'nav.kho': 'Kho', 'nav.kho_queue': 'Hàng chờ duyệt', 'nav.kho_tokens': 'Phiếu & Muse', 'nav.kho_audit': 'Nhật ký kiểm', 'nav.kho_settings': 'Cài đặt kho',

  // ---- A1 Tổng quan kho ----
  'kho.title': 'Kho — Tổng quan', 'kho.desc': '457 ô Bộ Neo theo 10 nhóm · % đạt tính từ chứng nhận ô.',
  'kho.pct_overall': 'Tổng thể', 'kho.pct_todo': 'TODO: dùng v_kit_coverage khi C.2 bổ sung view — hiện tính trực tiếp từ kit_certs.',
  'kho.group': 'Nhóm', 'kho.slots': 'ô', 'kho.certified_of': '{c}/{t} đã chứng nhận ({pct}%)',
  'kho.st.empty': 'Trống', 'kho.st.submitted': 'Chờ kiểm', 'kho.st.rework': 'Làm lại', 'kho.st.blocked': 'Chờ chủ xưởng', 'kho.st.approved': 'Đã duyệt', 'kho.st.certified': 'Đạt',
  'kho.claims_title': 'Ô đang bị giữ (claim còn hạn)', 'kho.claims_empty': 'Không có ô nào đang bị Muse giữ.',
  'kho.claims_by': '{agent} giữ tới {at}', 'kho.open_slot': 'Mở ô {code}', 'kho.loading': 'Đang tải…',
  'kho.legend': 'Chú giải màu', 'kho.err_load': 'Không tải được tổng quan kho.',

  // ---- A2 Hàng chờ duyệt ----
  'queue.title': 'Hàng chờ duyệt', 'queue.desc': 'Bài nộp của Muse — Duyệt, Trả làm lại hoặc Bỏ trước khi vào kho.',
  'queue.empty': 'Không có gì chờ duyệt.',
  'queue.tab.pending': 'Chờ duyệt', 'queue.tab.auto_rework': 'Gen trả về', 'queue.tab.blocked': 'Chờ chủ xưởng', 'queue.tab.approved': 'Đã duyệt', 'queue.tab.rejected': 'Từ chối', 'queue.tab.all': 'Tất cả',
  'queue.approve': 'Duyệt', 'queue.rework': 'Trả làm lại', 'queue.reject': 'Bỏ', 'queue.reopen': 'Mở lại để tự quyết',
  'queue.reason': 'Lý do (tối thiểu 10 ký tự)', 'queue.reason_ph': 'Vì sao trả lại / từ chối…',
  'queue.approved_ok': 'Đã duyệt lần nộp', 'queue.reworked_ok': 'Đã trả làm lại', 'queue.rejected_ok': 'Đã bỏ lần nộp', 'queue.reopened_ok': 'Đã mở lại — chờ duyệt',
  'queue.tab_checks': 'Kiểm máy', 'queue.tab_file': 'Tệp', 'queue.tab_history': 'Lịch sử',
  'queue.criterion': 'Tiêu chí', 'queue.severity': 'Mức', 'queue.level': 'Kết quả', 'queue.measured': 'Đo được', 'queue.waive': 'Miễn tiêu chí',
  'queue.waive_reason': 'Lý do miễn (tối thiểu 10 ký tự)', 'queue.waived_ok': 'Đã miễn tiêu chí',
  'queue.lv.ok': 'Đạt', 'queue.lv.warn': 'Cảnh báo', 'queue.lv.fail': 'Trượt', 'queue.lv.waived': 'Đã miễn', 'queue.lv.pending': 'Chưa đo',
  'queue.no_checks': 'Chưa có kết quả kiểm máy.', 'queue.open_file': 'Mở tệp', 'queue.play': 'Phát',
  'queue.certify_section': 'Xác nhận ô (tick đủ M*/H)', 'queue.certify_do': 'Xác nhận ô', 'queue.certify_ok': 'Đã chứng nhận ô',
  'queue.certify_hint': 'Tick đủ các tiêu chí M*/H bên dưới rồi bấm Xác nhận ô — không bắt buộc để Duyệt.',
  'queue.h_tick_missing': 'Còn {n} tiêu chí chưa tick.', 'queue.attempt': 'Lần nộp thứ {n}', 'queue.decided_by': 'Quyết bởi {who} · {kind}',
  'queue.open_slot': 'Xem ô Bộ Neo',

  // ---- A3 Chi tiết ô ----
  'slot.title': 'Chi tiết ô', 'slot.not_found': 'Không tìm thấy ô này.', 'slot.group': 'Nhóm', 'slot.subject_rev': 'Phiên bản nhân vật',
  'slot.required_m': 'Tiêu chí M bắt buộc', 'slot.required_mh': 'Tiêu chí M*/H cần tick khi chứng nhận',
  'slot.history': 'Lịch sử nộp', 'slot.history_empty': 'Ô này chưa có lần nộp nào.',
  'slot.certs': 'Chứng nhận', 'slot.certs_empty': 'Ô này chưa được chứng nhận.', 'slot.cert_via': 'Qua {via} · {at}',
  'slot.current_asset': 'Tài sản hiện hành', 'slot.added_in': 'Thêm từ', 'slot.retired': 'Đã retired ở {v}',

  // ---- A4 Phiếu & Muse (token + claim) ----
  'tok.title': 'Phiếu & Muse', 'tok.desc': 'Token của agent Muse (nộp tài nguyên) và Gen (kiểm hàng); ô đang bị giữ.',
  'tok.new': 'Tạo token Muse', 'tok.scope.submit': 'assets.submit — nộp tài nguyên', 'tok.scope.review': 'assets.review — kiểm hàng',
  'tok.scope_hint': 'Muse chỉ cần "Nộp tài nguyên". "Kiểm hàng" dành cho Gen (đọc kết quả kiểm, không duyệt/xoá).',
  'tok.claims': 'Ô đang bị giữ', 'tok.claims_empty': 'Không có ô nào đang bị giữ.', 'tok.released_hint': 'Hết hạn giữ 2 giờ nếu Muse không nộp.',

  // ---- A5 Nhật ký kiểm/audit ----
  'klog.title': 'Nhật ký kiểm', 'klog.desc': 'Nhật ký ghi/sửa liên quan kho: kiểm máy, chứng nhận, lần nộp, miễn tiêu chí.',

  // ---- A6 Cài đặt kho ----
  'kset.title': 'Cài đặt kho', 'kset.desc': 'Danh mục ô Bộ Neo và tài khoản.',
  'kset.sync': 'Đồng bộ danh mục 457 ô', 'kset.sync_hint': 'Nạp lại seed/kit-slots.json — không xoá ô cũ, chỉ thêm/sửa tên.',
  'kset.sync_ok': 'Đã đồng bộ: {created} ô mới, {updated} ô sửa tên, tổng {total} ô.',
  'kset.account': 'Tài khoản', 'kset.account_hint': 'Đổi mật khẩu ở nút chìa khoá trên thanh bên.',

  // ---- cột dùng chung ở bảng A3 (không có sẵn trong col.* lõi) ----
  'col.state': 'Trạng thái', 'col.decision_reason': 'Lý do quyết',
};

export const en = {
  'nav.kho': 'Library store', 'nav.kho_queue': 'Review queue', 'nav.kho_tokens': 'Requests & Muse', 'nav.kho_audit': 'Review log', 'nav.kho_settings': 'Store settings',

  'kho.title': 'Library — Overview', 'kho.desc': '457 Anchor Set slots across 10 groups · pass % from slot certification.',
  'kho.pct_overall': 'Overall', 'kho.pct_todo': 'TODO: use v_kit_coverage once C.2 adds the view — currently computed directly from kit_certs.',
  'kho.group': 'Group', 'kho.slots': 'slots', 'kho.certified_of': '{c}/{t} certified ({pct}%)',
  'kho.st.empty': 'Empty', 'kho.st.submitted': 'Pending review', 'kho.st.rework': 'Rework', 'kho.st.blocked': 'Awaiting owner', 'kho.st.approved': 'Approved', 'kho.st.certified': 'Certified',
  'kho.claims_title': 'Slots currently held (claim still live)', 'kho.claims_empty': 'No slot is currently held by Muse.',
  'kho.claims_by': 'Held by {agent} until {at}', 'kho.open_slot': 'Open slot {code}', 'kho.loading': 'Loading…',
  'kho.legend': 'Colour legend', 'kho.err_load': 'Could not load the store overview.',

  'queue.title': 'Review queue', 'queue.desc': "Muse's submissions — approve, request rework, or reject before they enter the store.",
  'queue.empty': 'Nothing waiting for review.',
  'queue.tab.pending': 'Pending', 'queue.tab.auto_rework': 'Returned by Gen', 'queue.tab.blocked': 'Awaiting owner', 'queue.tab.approved': 'Approved', 'queue.tab.rejected': 'Rejected', 'queue.tab.all': 'All',
  'queue.approve': 'Approve', 'queue.rework': 'Request rework', 'queue.reject': 'Reject', 'queue.reopen': 'Reopen to decide myself',
  'queue.reason': 'Reason (10+ characters)', 'queue.reason_ph': 'Why send it back / reject…',
  'queue.approved_ok': 'Submission approved', 'queue.reworked_ok': 'Sent back for rework', 'queue.rejected_ok': 'Submission rejected', 'queue.reopened_ok': 'Reopened — pending review',
  'queue.tab_checks': 'Machine checks', 'queue.tab_file': 'File', 'queue.tab_history': 'History',
  'queue.criterion': 'Criterion', 'queue.severity': 'Level', 'queue.level': 'Result', 'queue.measured': 'Measured', 'queue.waive': 'Waive criterion',
  'queue.waive_reason': 'Waiver reason (10+ characters)', 'queue.waived_ok': 'Criterion waived',
  'queue.lv.ok': 'Pass', 'queue.lv.warn': 'Warning', 'queue.lv.fail': 'Fail', 'queue.lv.waived': 'Waived', 'queue.lv.pending': 'Not measured',
  'queue.no_checks': 'No machine-check results yet.', 'queue.open_file': 'Open file', 'queue.play': 'Play',
  'queue.certify_section': 'Certify slot (tick all M*/H)', 'queue.certify_do': 'Certify slot', 'queue.certify_ok': 'Slot certified',
  'queue.certify_hint': 'Tick all the M*/H criteria below then press Certify slot — not required to Approve.',
  'queue.h_tick_missing': '{n} criteria still unticked.', 'queue.attempt': 'Submission attempt {n}', 'queue.decided_by': 'Decided by {who} · {kind}',
  'queue.open_slot': 'View Anchor Set slot',

  'slot.title': 'Slot detail', 'slot.not_found': 'Slot not found.', 'slot.group': 'Group', 'slot.subject_rev': 'Character revision',
  'slot.required_m': 'Required M criteria', 'slot.required_mh': 'M*/H criteria to tick when certifying',
  'slot.history': 'Submission history', 'slot.history_empty': 'No submission yet for this slot.',
  'slot.certs': 'Certifications', 'slot.certs_empty': 'This slot has not been certified yet.', 'slot.cert_via': 'Via {via} · {at}',
  'slot.current_asset': 'Current asset', 'slot.added_in': 'Added in', 'slot.retired': 'Retired in {v}',

  'tok.title': 'Requests & Muse', 'tok.desc': 'Tokens for the Muse agent (submit assets) and Gen (review assets); slots currently held.',
  'tok.new': 'Create Muse token', 'tok.scope.submit': 'assets.submit — submit assets', 'tok.scope.review': 'assets.review — review assets',
  'tok.scope_hint': 'Muse only needs "Submit assets". "Review assets" is for Gen (reads check results, cannot approve/delete).',
  'tok.claims': 'Slots currently held', 'tok.claims_empty': 'No slot is currently held.', 'tok.released_hint': 'The 2-hour hold expires automatically if Muse does not submit.',

  'klog.title': 'Review log', 'klog.desc': 'Writes related to the store: machine checks, certifications, submissions, waivers.',

  'kset.title': 'Store settings', 'kset.desc': 'Anchor Set catalog and account.',
  'kset.sync': 'Sync the 457-slot catalog', 'kset.sync_hint': 'Reloads seed/kit-slots.json — never deletes old slots, only adds/renames.',
  'kset.sync_ok': 'Synced: {created} new, {updated} renamed, {total} slots total.',
  'kset.account': 'Account', 'kset.account_hint': 'Change your password from the key button in the sidebar.',

  'col.state': 'State', 'col.decision_reason': 'Decision reason',
};
