-- fk-off
-- © 2026 Gen Labs — All rights reserved.
-- 0009 (Gen-Studio 0.3.0, gói B — review Gen PR #36 mục 1): thêm mức 'pending' vào asset_checks.level cho tiêu chí M
-- CHƯA có máy đo (server/checks/to-db.js pass=null → 'pending'; server/ops/kit.js recomputeChecksLevel loại 'pending'
-- khi tính checks_level). KHÔNG sửa 0006 nữa — 0006 đã chạy ở prod (main), sửa trong migration đã áp dụng làm vỡ DB
-- thật (CHECK cũ không nhận 'pending' ⇒ ghi lỗi ngay). Dựng lại asset_checks ngoài ràng buộc khoá ngoại (giữ nguyên
-- mọi cột/CHECK khác, chỉ nới `level`), copy dữ liệu, giữ trigger chỉ-thêm + index.
-- `-- fk-off`: bộ chạy migration tắt foreign_keys NGOÀI transaction, chạy file trong transaction rồi foreign_key_check.

DROP TRIGGER IF EXISTS tr_checks_noupdate;
DROP TRIGGER IF EXISTS tr_checks_nodelete;

DROP TABLE IF EXISTS asset_checks_new;
CREATE TABLE asset_checks_new (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
  submission_id TEXT REFERENCES asset_submissions(id),
  asset_id TEXT REFERENCES assets(id),
  criterion TEXT NOT NULL,
  severity TEXT CHECK (severity IS NULL OR severity IN ('M','M*','H')),
  kit_ver TEXT NOT NULL DEFAULT 'KIT-v1',
  level TEXT NOT NULL CHECK (level IN ('ok','warn','fail','waived','pending')),   -- +'pending' (0009): tiêu chí M chưa có máy đo — không chặn, không coi là đạt
  measured TEXT, detail TEXT,
  checker TEXT NOT NULL CHECK (checker IN ('system','gen','owner')),
  checker_ref TEXT,
  reason TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK ((submission_id IS NOT NULL) <> (asset_id IS NOT NULL)),
  CHECK (level <> 'waived' OR (checker = 'owner' AND length(trim(coalesce(reason,''))) >= 10))
);
INSERT INTO asset_checks_new SELECT * FROM asset_checks;
DROP TABLE asset_checks;
ALTER TABLE asset_checks_new RENAME TO asset_checks;

CREATE INDEX IF NOT EXISTS ix_checks_sub ON asset_checks(submission_id, criterion, created_at);
CREATE INDEX IF NOT EXISTS ix_checks_asset ON asset_checks(asset_id, criterion, created_at);
CREATE TRIGGER tr_checks_noupdate BEFORE UPDATE ON asset_checks BEGIN SELECT RAISE(ABORT, 'asset_checks chỉ thêm'); END;
CREATE TRIGGER tr_checks_nodelete BEFORE DELETE ON asset_checks BEGIN SELECT RAISE(ABORT, 'asset_checks chỉ thêm'); END;
