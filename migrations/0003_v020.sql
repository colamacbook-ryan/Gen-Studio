-- fk-off
-- © 2026 Gen Labs — All rights reserved.
-- 0003: Gen-Studio 0.2.0 — SPEC-0.2.0 §9. Forward-only; bộ chạy migration ghi schema_migrations nên không chạy lại; câu tạo mới dùng IF NOT EXISTS khi được.
-- `-- fk-off`: dựng lại gate_results ngoài ràng buộc khoá ngoại (như 0002), rồi foreign_key_check.
-- Nguyên tắc v2 (CNS-090): danh sách mở rộng được (tên cổng, loại bài) KHÔNG khoá bằng CHECK; write()/pipeline kiểm theo registry (GATES, kinds).

-- 1. lesson_versions: kind/variant/thumbnail/screens/host/music (JSON ở dạng TEXT). Không CHECK trên kind.
ALTER TABLE lesson_versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'lesson';
ALTER TABLE lesson_versions ADD COLUMN variant TEXT;
ALTER TABLE lesson_versions ADD COLUMN thumbnail TEXT;
ALTER TABLE lesson_versions ADD COLUMN screens TEXT;
ALTER TABLE lesson_versions ADD COLUMN host TEXT;
ALTER TABLE lesson_versions ADD COLUMN music TEXT;
DROP TRIGGER IF EXISTS tr_lv_immutable;
CREATE TRIGGER tr_lv_immutable BEFORE UPDATE OF lesson_id, version, camera_hints, note, work_order_id, submitted_by, created_at, created_by,
  kind, variant, thumbnail, screens, host, music ON lesson_versions
BEGIN SELECT RAISE(ABORT, 'lesson_versions bất biến: tạo version mới thay vì sửa'); END;

-- 2. gate_results: dựng lại, bỏ CHECK trên gate (giữ CHECK result, subject_kind); copy hàng, tạo lại index + trigger bất biến
DROP TABLE IF EXISTS gate_results_new;
CREATE TABLE gate_results_new (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('voice_clip','render')), subject_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail','unknown')), measure TEXT, run_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
INSERT INTO gate_results_new(id, workspace_id, display_id, subject_kind, subject_id, gate, result, measure, run_id, attempt, created_at, created_by, updated_at)
  SELECT id, workspace_id, display_id, subject_kind, subject_id, gate, result, measure, run_id, attempt, created_at, created_by, updated_at FROM gate_results;
DROP TABLE gate_results;
ALTER TABLE gate_results_new RENAME TO gate_results;
CREATE INDEX ix_gate_subject ON gate_results(subject_kind, subject_id, gate);
CREATE INDEX IF NOT EXISTS ix_gate_subject_result ON gate_results(subject_kind, subject_id, result);
CREATE TRIGGER tr_gate_immutable BEFORE UPDATE ON gate_results BEGIN SELECT RAISE(ABORT, 'gate_results bất biến'); END;
CREATE TRIGGER tr_gate_nodelete BEFORE DELETE ON gate_results BEGIN SELECT RAISE(ABORT, 'gate_results không xoá'); END;

-- 3. renders: ảnh bìa được chọn, xuất/đăng, mốc chờ duyệt
ALTER TABLE renders ADD COLUMN thumbnail_pick TEXT;
ALTER TABLE renders ADD COLUMN thumbnail_picked_by TEXT;
ALTER TABLE renders ADD COLUMN thumbnail_picked_at TEXT;
ALTER TABLE renders ADD COLUMN exported_at TEXT;
ALTER TABLE renders ADD COLUMN published_at TEXT;
ALTER TABLE renders ADD COLUMN published_by TEXT;
ALTER TABLE renders ADD COLUMN published_source TEXT CHECK (published_source IS NULL OR published_source IN ('export','manual'));
ALTER TABLE renders ADD COLUMN awaiting_review_at TEXT;
-- backfill: lần đầu vào awaiting_review theo audit_log (render.awaiting_review, entity_id = display_id)
UPDATE renders SET awaiting_review_at = (
  SELECT MIN(a.ts) FROM audit_log a WHERE a.entity_type='render' AND a.entity_id=renders.display_id AND a.action='render.awaiting_review')
  WHERE awaiting_review_at IS NULL;
-- awaiting_review_at ghi một lần (CNS-091)
CREATE TRIGGER tr_render_awaiting_once BEFORE UPDATE OF awaiting_review_at ON renders
WHEN OLD.awaiting_review_at IS NOT NULL AND NEW.awaiting_review_at IS NOT OLD.awaiting_review_at
BEGIN SELECT RAISE(ABORT, 'renders.awaiting_review_at chỉ ghi một lần'); END;
-- outputs chỉ khoá khi Render đã rời pipeline (CNS-104, CNS-119); trong pipeline state.js vẫn gộp dần
CREATE TRIGGER tr_render_outputs_once BEFORE UPDATE OF outputs ON renders
WHEN OLD.state IN ('awaiting_review','approved','changes_requested','rejected','superseded') AND NEW.outputs IS NOT OLD.outputs
BEGIN SELECT RAISE(ABORT, 'renders.outputs bất biến sau khi bản dựng rời pipeline'); END;

-- 4. cast_members: trạng thái nhân vật (hàng cũ ⇒ draft)
ALTER TABLE cast_members ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','candidate','approved','retired'));
ALTER TABLE cast_members ADD COLUMN approved_version INTEGER;
ALTER TABLE cast_members ADD COLUMN approved_by TEXT;
ALTER TABLE cast_members ADD COLUMN approved_at TEXT;

-- 5. asset_rights: chỉ thêm hàng, giữ lịch sử (CNS-125). Hiện trạng = hàng mới nhất của asset.
CREATE TABLE IF NOT EXISTS asset_rights (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  action TEXT NOT NULL CHECK (action IN ('attest','revoke')),
  basis TEXT CHECK (basis IS NULL OR basis IN ('owner_upload','own_product','licensed','owner_responsibility')),   -- NULL khi revoke
  pii_redacted INTEGER NOT NULL DEFAULT 0, note TEXT,
  by TEXT NOT NULL REFERENCES users(id), at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_asset_rights_asset ON asset_rights(asset_id, at);
CREATE TRIGGER IF NOT EXISTS tr_asset_rights_noupdate BEFORE UPDATE ON asset_rights BEGIN SELECT RAISE(ABORT, 'asset_rights chỉ thêm'); END;
CREATE TRIGGER IF NOT EXISTS tr_asset_rights_nodelete BEFORE DELETE ON asset_rights BEGIN SELECT RAISE(ABORT, 'asset_rights chỉ thêm'); END;

-- 9. Index
CREATE INDEX IF NOT EXISTS ix_runs_kind_state ON runs(kind, state, finished_at);
CREATE INDEX IF NOT EXISTS ix_renders_published ON renders(state, published_at);
CREATE INDEX IF NOT EXISTS ix_renders_awaiting_at ON renders(awaiting_review_at);
CREATE INDEX IF NOT EXISTS ix_reviews_created ON reviews(created_at);
CREATE INDEX IF NOT EXISTS ix_cast_status ON cast_members(channel_id, status);
CREATE INDEX IF NOT EXISTS ix_assets_created ON assets(created_at);
