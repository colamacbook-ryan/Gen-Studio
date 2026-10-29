// © 2026 Gen Labs — All rights reserved.
// Chuỗi giao diện của gói UI-P2 (= UI-TUT) — Bài học: cột Loại/Tỉ lệ, nút "Tạo lệnh bản …", tab Màn hình & bước (views/lessons.js)
// Chữ tỉ lệ khung (badge, bộ chọn, lớp phủ, "Tạo lệnh bản …", lý do tutorial chỉ 16:9) dùng khoá `aspect.*` của studio/i18n/aspect.js.
// vi và en CÙNG bộ khoá; khoá không trùng module khác. `lane.cursor`: nhãn làn Con trỏ của Phòng chiếu (gói U).
export const vi = {
  'lane.cursor': 'Con trỏ',
  // ---- lưới + Inspector ----
  'kind.lesson': 'Bài học', 'kind.tutorial': 'Hướng dẫn', 'lsn.variant.trailer': 'Trailer',
  'lsn.f.kind': 'Loại', 'lsn.f.all': 'Tất cả',
  'lsn.channel': 'Kênh', 'lsn.aspect_from_channel': 'theo kênh',
  'lsn.make_title': 'Tạo lệnh sản xuất bản {v}',
  'lsn.make_hint': 'Agent soạn lại «{title}» cho khung {v} ({w}×{h}). Bài gốc giữ nguyên; bản mới đi qua đủ cổng như mọi bài.',
  'lsn.make_brief_label': 'Lời giao việc cho agent',
  'lsn.make_brief': 'Làm bản {v} của {id} «{title}». Giữ ý chính, chữ và khối trong vùng an toàn của khung {v}.',
  'lsn.make_target': ' Thời lượng nên trong {a}–{b} giây.',
  'lsn.make_submit': 'Tạo lệnh', 'lsn.make_done': 'Đã tạo lệnh {id} — agent nhận ở lượt kế tiếp.',
  'lsn.make_owner_only': 'Chỉ chủ xưởng tạo được lệnh sản xuất.',
  'lsn.tab.screens': 'Màn hình & bước', 'lsn.no_screens': 'Bài này chưa khai màn hình nào.',
  'lsn.screen.mock': 'Màn giả lập · {theme}', 'lsn.screen.asset': 'Ảnh chụp {id}',
  'lsn.screen.targets': '{n} đích', 'lsn.screen.redact': '{n} vùng che', 'lsn.screen.size': '{w}×{h}',
  'lsn.steps': 'Các bước con trỏ', 'lsn.no_steps': 'Chưa có bước con trỏ nào.',
  'lsn.col.step': 'Bước', 'lsn.col.action': 'Hành động', 'lsn.col.target': 'Đích', 'lsn.col.anchor': 'Neo', 'lsn.col.caption': 'Chú thích',
  'lsn.screen.edit_later': 'Toạ độ đích do agent khai theo pixel ảnh gốc. Kéo khung để sửa sẽ có ở bản sau; hiện sửa qua lệnh "Yêu cầu sửa" ở Phòng chiếu.',
};
export const en = {
  'lane.cursor': 'Cursor',
  'kind.lesson': 'Lesson', 'kind.tutorial': 'Tutorial', 'lsn.variant.trailer': 'Trailer',
  'lsn.f.kind': 'Type', 'lsn.f.all': 'All',
  'lsn.channel': 'Channel', 'lsn.aspect_from_channel': 'from channel',
  'lsn.make_title': 'New production order · {v} version',
  'lsn.make_hint': 'The agent rewrites «{title}» for a {v} frame ({w}×{h}). The original lesson stays as is; the new version goes through every gate like any lesson.',
  'lsn.make_brief_label': 'Brief for the agent',
  'lsn.make_brief': 'Make a {v} version of {id} «{title}». Keep the key ideas; keep text and blocks inside the {v} safe area.',
  'lsn.make_target': ' Aim for {a}–{b} seconds.',
  'lsn.make_submit': 'Create order', 'lsn.make_done': 'Order {id} created — the agent picks it up on its next round.',
  'lsn.make_owner_only': 'Only the studio owner can create production orders.',
  'lsn.tab.screens': 'Screens & steps', 'lsn.no_screens': 'This lesson declares no screens.',
  'lsn.screen.mock': 'Mock screen · {theme}', 'lsn.screen.asset': 'Screenshot {id}',
  'lsn.screen.targets': '{n} targets', 'lsn.screen.redact': '{n} redactions', 'lsn.screen.size': '{w}×{h}',
  'lsn.steps': 'Cursor steps', 'lsn.no_steps': 'No cursor steps yet.',
  'lsn.col.step': 'Step', 'lsn.col.action': 'Action', 'lsn.col.target': 'Target', 'lsn.col.anchor': 'Anchor', 'lsn.col.caption': 'Caption',
  'lsn.screen.edit_later': 'Targets are declared by the agent in source-image pixels. Drag-to-edit comes in a later version; for now request changes from the Review room.',
};
