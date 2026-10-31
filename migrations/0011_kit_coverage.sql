-- © 2026 Gen Labs — All rights reserved.
-- 0011 (Gen-Studio 0.3.0, gói C.2 — DB-GK-0.1 §13, STANDARD-KIT-v1 §5, cortex CNS-M1-09/07): view `v_kit_coverage`
-- (MỘT công thức «ô đạt» — `cli/import-kit.js` xuất data/kit-status.json từ đúng view này, không tự tính lại) +
-- cột `asset_submissions.quality_claimed` (hạng Muse TỰ KHAI, tách khỏi `assets.quality` — CNS-M1-07: nhập kho
-- không còn tự gán `assets.quality='A'` từ khai báo; Ryan đặt hạng khi duyệt/chứng nhận).
-- Không cần `-- fk-off`: chỉ ADD COLUMN (không CHECK nhiều cột) + CREATE VIEW, không đụng bảng có FK ràng buộc.

ALTER TABLE asset_submissions ADD COLUMN quality_claimed TEXT CHECK (quality_claimed IS NULL OR quality_claimed IN ('A','B'));

-- Ghi chú phạm vi (quyết định tự chọn builder gói C.2, xem CHANGELOG 0.3.0): schema gói A/C KHÔNG có
-- `assets.superseded_by`/`family_id`/`version` (thu hẹp theo brief gói A, migrations/0006) nên điều 1 của
-- STANDARD §5 ("gắn ô, HIỆN HÀNH, hạng A") ở đây chỉ còn "gắn ô, hạng A" — không có khái niệm phiên bản bị thay thế
-- ở gói này; `kit_major` hiện hành = 1 (KIT-v1, chưa có bộ v2) — hardcode, sửa khi có major mới.
-- review opus PR #38 mục 8 [minor]: biểu thức "quyền hiệu lực" (attested/exempt) xuất hiện 4 LẦN trong view dưới
-- đây — SQL view không có hàm/macro để gọi lại một CTE tương quan theo `a` ở nhiều độ sâu subquery khác nhau mà
-- không đổi kiến trúc truy vấn (rủi ro cao hơn lợi ích ở gói này). Nguồn sự thật DUY NHẤT của logic này vẫn là
-- `server/rights.js` `RIGHTS_SQL`/`needsRights`/`statusOf` — 4 chỗ dưới đây CHÉP Y HỆT ý nghĩa đó (không phải
-- chép nguyên văn chuỗi `RIGHTS_SQL` vì view cần dạng boolean `EXISTS`, `RIGHTS_SQL` trả chuỗi 'attested'/'pending'/
-- 'exempt'). Đổi luật quyền dùng ở `rights.js` ⇒ PHẢI sửa cả 4 chỗ ở đây cho khớp (không có kiểm tra tự động).
-- `đang làm` (STANDARD §5: "có phiếu MR nhắm ô chưa đóng") KHÔNG tính được ở gói này — chưa có bảng
-- `asset_requests` (ngoài phạm vi gói A/C, xem migrations/0006 ghi chú đầu file) — nhánh này luôn rơi xuống `thiếu`.
CREATE VIEW IF NOT EXISTS v_kit_coverage AS
SELECT
  ks.code AS code,
  ks.workspace_id AS workspace_id,
  ks.group_code AS group_code,
  ks.title_vi AS title_vi,
  ks.title_en AS title_en,
  ks.added_in AS added_in,
  ks.retired_in AS retired_in,
  ks.subject_rev AS subject_rev,
  -- review Gen (cổng C.2): ORDER BY của subquery không thấy được correlation CÁCH HAI CẤP (ks ở đây) trong SQLite
  -- (đo được: `WHERE a.kit_slot=ks.code` trong ORDER BY lỗi "no such column: ks.code", cùng biểu thức ở WHERE thì
  -- chạy được) — thay `ks.code`/`ks.subject_rev` bằng `a.kit_slot`/tra lại `kit_slots` qua `a.kit_slot` (chỉ cách
  -- MỘT cấp, đã kiểm chạy được).
  (
    SELECT a.display_id FROM assets a WHERE a.kit_slot = ks.code
    ORDER BY
      (EXISTS (
        SELECT 1 FROM kit_certs c WHERE c.asset_id = a.id AND c.kit_slot = a.kit_slot AND c.kit_major = 1
          AND coalesce(c.subject_rev,'') = coalesce((SELECT subject_rev FROM kit_slots WHERE code = a.kit_slot), '')
          AND a.quality = 'A'
          AND (
            (SELECT x.action FROM asset_rights x WHERE x.asset_id = a.id ORDER BY x.at DESC, x.rowid DESC LIMIT 1) = 'attest'
            OR NOT (
              a.source <> 'system' AND (a.mime IN ('image/png','image/jpeg','image/webp','image/gif') OR a.kind = 'audio' OR a.mime LIKE 'audio/%')
              AND a.created_at >= COALESCE((SELECT applied_at FROM schema_migrations WHERE version = 3), '9999')
            )
          )
      )) DESC,
      a.created_at DESC, a.id DESC LIMIT 1
  ) AS asset_id,
  (
    SELECT s.checks_level FROM asset_submissions s WHERE s.kit_slot = ks.code
    ORDER BY s.updated_at DESC, s.id DESC LIMIT 1
  ) AS checks_level,
  -- review opus PR #38 mục 6 [major]: `state` ưu tiên 'đạt' TRƯỚC nên CHE mất việc còn lần nộp MỞ của đường B
  -- (Muse qua MCP, submission.submit) đang chờ xem xét cho CÙNG ô dù ô đã 'đạt' qua đường khác (vd import) —
  -- Ryan nhìn "đạt" tưởng xong, không biết có bài đang chờ. Đếm riêng, không đổi logic `state`.
  (
    SELECT COUNT(*) FROM asset_submissions s WHERE s.kit_slot = ks.code AND s.state IN ('submitted','blocked')
  ) AS competing,
  CASE
    -- đạt (điều 1-5 §5): tài sản gắn ô hiện hành hạng A + quyền hiệu lực (attested/exempt) + kit_certs khớp
    -- major hiện hành (1) và subject_rev hiện hành của ô.
    WHEN EXISTS (
      SELECT 1 FROM assets a JOIN kit_certs c ON c.asset_id = a.id AND c.kit_slot = ks.code AND c.kit_major = 1
        AND coalesce(c.subject_rev,'') = coalesce(ks.subject_rev,'')
      WHERE a.kit_slot = ks.code AND a.quality = 'A'
        AND (
          (SELECT x.action FROM asset_rights x WHERE x.asset_id = a.id ORDER BY x.at DESC, x.rowid DESC LIMIT 1) = 'attest'
          OR NOT (
            a.source <> 'system' AND (a.mime IN ('image/png','image/jpeg','image/webp','image/gif') OR a.kind = 'audio' OR a.mime LIKE 'audio/%')
            AND a.created_at >= COALESCE((SELECT applied_at FROM schema_migrations WHERE version = 3), '9999')
          )
        )
    ) THEN 'đạt'
    -- cần kiểm lại: tài sản thoả điều 1-2 và CÓ kit_certs cho (asset, ô) nhưng không hàng nào khớp major/subject_rev hiện hành.
    WHEN EXISTS (
      SELECT 1 FROM assets a
      WHERE a.kit_slot = ks.code AND a.quality = 'A'
        AND (
          (SELECT x.action FROM asset_rights x WHERE x.asset_id = a.id ORDER BY x.at DESC, x.rowid DESC LIMIT 1) = 'attest'
          OR NOT (
            a.source <> 'system' AND (a.mime IN ('image/png','image/jpeg','image/webp','image/gif') OR a.kind = 'audio' OR a.mime LIKE 'audio/%')
            AND a.created_at >= COALESCE((SELECT applied_at FROM schema_migrations WHERE version = 3), '9999')
          )
        )
        AND EXISTS (SELECT 1 FROM kit_certs c WHERE c.asset_id = a.id AND c.kit_slot = ks.code)
        AND NOT EXISTS (
          SELECT 1 FROM kit_certs c2 WHERE c2.asset_id = a.id AND c2.kit_slot = ks.code AND c2.kit_major = 1
            AND coalesce(c2.subject_rev,'') = coalesce(ks.subject_rev,'')
        )
    ) THEN 'cần kiểm lại'
    -- cờ lỗi: lần nộp đang mở (submitted/blocked) nhắm ô CÓ tiêu chí M/GEN-FMT hiện hành 'fail' chưa miễn,
    -- hoặc lần kiểm (kit.recheck) mới nhất của một tài sản gắn ô có tiêu chí M/GEN-FMT hiện hành 'fail' chưa miễn.
    WHEN EXISTS (
      SELECT 1 FROM asset_checks ac JOIN asset_submissions s ON s.id = ac.submission_id
      WHERE s.kit_slot = ks.code AND s.state IN ('submitted','blocked')
        AND (ac.severity = 'M' OR ac.criterion = 'GEN-FMT') AND ac.level = 'fail'
        AND NOT EXISTS (
          SELECT 1 FROM asset_checks ac2 WHERE ac2.submission_id = ac.submission_id AND ac2.criterion = ac.criterion
            AND (ac2.created_at > ac.created_at OR (ac2.created_at = ac.created_at AND ac2.id > ac.id))
        )
    ) OR EXISTS (
      SELECT 1 FROM asset_checks ac JOIN assets a ON a.id = ac.asset_id
      WHERE a.kit_slot = ks.code
        AND (ac.severity = 'M' OR ac.criterion = 'GEN-FMT') AND ac.level = 'fail'
        AND NOT EXISTS (
          SELECT 1 FROM asset_checks ac2 WHERE ac2.asset_id = ac.asset_id AND ac2.criterion = ac.criterion
            AND (ac2.created_at > ac.created_at OR (ac2.created_at = ac.created_at AND ac2.id > ac.id))
        )
    ) THEN 'cờ lỗi'
    -- chờ duyệt: có lần nộp 'submitted' nhắm ô, hoặc tài sản thoả điều 1-2 nhưng chưa có kit_certs nào.
    WHEN EXISTS (SELECT 1 FROM asset_submissions s WHERE s.kit_slot = ks.code AND s.state = 'submitted')
      OR EXISTS (
        SELECT 1 FROM assets a
        WHERE a.kit_slot = ks.code AND a.quality = 'A'
          AND (
            (SELECT x.action FROM asset_rights x WHERE x.asset_id = a.id ORDER BY x.at DESC, x.rowid DESC LIMIT 1) = 'attest'
            OR NOT (
              a.source <> 'system' AND (a.mime IN ('image/png','image/jpeg','image/webp','image/gif') OR a.kind = 'audio' OR a.mime LIKE 'audio/%')
              AND a.created_at >= COALESCE((SELECT applied_at FROM schema_migrations WHERE version = 3), '9999')
            )
          )
          AND NOT EXISTS (SELECT 1 FROM kit_certs c WHERE c.asset_id = a.id AND c.kit_slot = ks.code)
      ) THEN 'chờ duyệt'
    -- đang làm: không tính được ở gói này (không có asset_requests) — luôn rơi xuống 'thiếu'.
    ELSE 'thiếu'
  END AS state
FROM kit_slots ks;
