-- © 2026 Gen Labs — All rights reserved.
-- 0005 (F7, SPEC-0.2.0-F7 §3.4): tỉ lệ khung. Không CHECK trên giá trị (danh sách mở rộng được — kiểm theo render/aspects.json ở write(), như CNS-090).
-- Forward-only theo khuôn 0003/0004: bảng schema_migrations bảo đảm chạy một lần (nâng cấp có backup trước migrate). Trigger được DROP IF EXISTS rồi dựng lại (bất biến lesson_versions gồm cả `aspect`).
ALTER TABLE lesson_versions ADD COLUMN aspect TEXT;          -- NULL = '16:9' (hàng trước 0.2.0)
ALTER TABLE work_orders     ADD COLUMN aspect TEXT;          -- NULL = theo kênh
DROP TRIGGER IF EXISTS tr_lv_immutable;
CREATE TRIGGER tr_lv_immutable BEFORE UPDATE OF lesson_id, version, camera_hints, note, work_order_id, submitted_by, created_at, created_by,
  kind, variant, thumbnail, screens, host, music, aspect ON lesson_versions
BEGIN SELECT RAISE(ABORT, 'lesson_versions bất biến: tạo version mới thay vì sửa'); END;
CREATE INDEX IF NOT EXISTS ix_lv_aspect ON lesson_versions(aspect);
