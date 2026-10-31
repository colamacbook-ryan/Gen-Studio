-- fk-off
-- © 2026 Gen Labs — All rights reserved.
-- 0006 (Gen-Studio 0.3.0, gói A — DB-GK-0.1 §4.1/§4.7/§4.8/§13, STANDARD-KIT-v1 §1–§6): hợp đồng dữ liệu kho Gen Kit.
-- Phạm vi gói A (thu hẹp theo brief 0.3.0-A, không mở rộng): cột quyền dùng/công khai trên `assets`, danh mục `kit_slots`
-- (457 ô Bộ Neo), kết quả kiểm máy `asset_checks`, chứng nhận `kit_certs`, và bảng `asset_submissions` TỐI GIẢN (chỉ đủ cho
-- `submission.record_checks`/`submission.auto_rework`/`submission.propose` đếm lần làm lại — KHÔNG phải toàn bộ pipeline
-- Muse của DB-GK-0.1 §4.3–§4.6/§8 (asset_requests, submission_files, upload_sessions, nhập catalog, tool MCP): để gói khác).
-- `-- fk-off`: dựng lại `assets` (thêm cột CHECK nhiều-cột không ALTER được) ngoài ràng buộc khoá ngoại, rồi foreign_key_check.

-- 1) kit_slots trước (assets.kit_slot tham chiếu tới) — không prefix, khoá = mã ô (STANDARD-KIT-v1 §2).
CREATE TABLE IF NOT EXISTS kit_slots (
  code TEXT PRIMARY KEY CHECK (code GLOB '[a-z]*' AND code NOT GLOB '*[A-Z]*'),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  group_code TEXT NOT NULL CHECK (group_code IN ('NB-01','NB-02','NB-03','NB-04','NB-05','NB-06','NB-07','NB-08','NB-09','NB-10')),
  title_vi TEXT NOT NULL, title_en TEXT NOT NULL,
  spec TEXT,                                   -- JSON: khung/thông số (đọc từ STANDARD-KIT-v1, không bắt buộc ở gói A)
  added_in TEXT NOT NULL DEFAULT 'v1',
  retired_in TEXT,
  subject_rev TEXT                              -- phiên bản nhân vật (vd 'nhi@r1'); NULL = không áp dụng (ô ngoài nhóm nhân vật)
);
CREATE INDEX IF NOT EXISTS ix_kit_slots_group ON kit_slots(group_code, retired_in);
-- mã ô bất biến, không tái dùng (STANDARD-KIT-v1 §6): cấm sửa code/group_code/added_in, cấm xoá.
CREATE TRIGGER IF NOT EXISTS tr_kit_slots_immutable BEFORE UPDATE OF code, group_code, added_in ON kit_slots
BEGIN SELECT RAISE(ABORT, 'kit_slots.code/group_code/added_in bất biến (mã ô không tái dùng)'); END;
CREATE TRIGGER IF NOT EXISTS tr_kit_slots_nodelete BEFORE DELETE ON kit_slots
BEGIN SELECT RAISE(ABORT, 'kit_slots không xoá — đánh retired_in thay vì xoá'); END;

-- 2) assets: dựng lại để thêm CHECK nhiều cột `ck_public_ok` (ALTER TABLE của SQLite không thêm được CHECK bảng).
-- Cột mới (DB-GK-0.1 §4.1, thu hẹp theo brief — KHÔNG thêm family_id/version/catalog_id/title/license/tier ở gói A):
--   source_kind  = nguồn tạo (muse/in-house/external); redistribution = quyền phát lại dạng tệp rời;
--   quality/commercial_ok/subject/kit_slot = đầu vào của CHECK ck_public_ok và của STANDARD-KIT-v1 §5 (ô «đạt»);
--   public_ok = cờ công khai (luôn 0 ở gói A — chưa có op asset.publish; tạo cột + CHECK trước để 0007/gói kho công khai không phải dựng lại bảng).
DROP TABLE IF EXISTS assets_new;
CREATE TABLE assets_new (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('svg','image','audio','video','subtitle','cover','logo','manifest')),
  sha256 TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL, mime TEXT, meta TEXT,
  media_present INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','system')),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'external' CHECK (source_kind IN ('muse','in-house','external')),
  redistribution TEXT CHECK (redistribution IS NULL OR redistribution IN ('ok','in-product-only','no-standalone')),
  quality TEXT CHECK (quality IS NULL OR quality IN ('A','B')),
  commercial_ok INTEGER CHECK (commercial_ok IS NULL OR commercial_ok IN (0,1)),
  subject TEXT CHECK (subject IS NULL OR subject IN ('nhi','vy','ryan')),
  kit_slot TEXT REFERENCES kit_slots(code),
  public_ok INTEGER NOT NULL DEFAULT 0 CHECK (public_ok IN (0,1)),
  CHECK (
    public_ok = 0 OR (
      source_kind IN ('muse','in-house') AND redistribution = 'ok' AND commercial_ok = 1 AND quality = 'A'
      AND coalesce(subject,'') <> 'ryan'
      AND (kit_slot IS NULL OR (substr(kit_slot,1,5) <> 'ryan.' AND kit_slot <> 'audio.voice.ryan'))
    )
  ),
  UNIQUE (workspace_id, display_id), UNIQUE (workspace_id, sha256)
);
-- copy nguyên hàng cũ; source_kind: 'system'→'in-house' (áp ở UPDATE dưới), còn lại mặc định 'external' cho tới khi owner sửa (DB-GK-0.1 §4.1).
INSERT INTO assets_new (id, workspace_id, display_id, kind, sha256, path, bytes, mime, meta, media_present, source, created_at, created_by, updated_at)
  SELECT id, workspace_id, display_id, kind, sha256, path, bytes, mime, meta, media_present, source, created_at, created_by, updated_at FROM assets;
UPDATE assets_new SET source_kind = 'in-house' WHERE source = 'system';
DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;

-- cùng luật bất biến như 0001 (cột gốc) — cột mô tả (source_kind, redistribution, quality, commercial_ok, subject trừ khoá
-- một chiều ryan, kit_slot) sửa được qua op gắn ô (`slot.assign`) ở gói này; `public_ok` chưa có đường ghi ở gói A.
CREATE TRIGGER tr_assets_immutable BEFORE UPDATE OF kind, sha256, path, bytes, mime, meta, source, created_at ON assets
BEGIN SELECT RAISE(ABORT, 'assets bất biến (chỉ media_present đổi được)'); END;
-- chân dung Ryan không bao giờ công khai / không đổi được khỏi 'ryan' một khi đã gắn (Ryan chốt 31/10, INT-GK-11).
CREATE TRIGGER tr_assets_ryan_lock BEFORE UPDATE OF subject ON assets
WHEN OLD.subject = 'ryan' AND NEW.subject IS NOT 'ryan'
BEGIN SELECT RAISE(ABORT, 'assets.subject: chân dung Ryan không đổi được khỏi "ryan" (INT-GK-11)'); END;
CREATE INDEX ix_assets_created ON assets(created_at);
CREATE INDEX IF NOT EXISTS ix_assets_kind_q ON assets(kind, quality);
CREATE INDEX IF NOT EXISTS ix_assets_slot ON assets(kit_slot) WHERE kit_slot IS NOT NULL;

-- 3) asset_submissions — TỐI GIẢN cho gói A (đếm lần làm lại; không claim/upload/lease — xem ghi chú đầu file).
CREATE TABLE IF NOT EXISTS asset_submissions (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id),
  kit_slot TEXT REFERENCES kit_slots(code),
  asset_id TEXT REFERENCES assets(id),          -- tệp đang xét (gói A: 1 tệp/lần nộp, đơn giản hoá submission_files)
  previous_id TEXT REFERENCES asset_submissions(id),  -- chuỗi làm lại
  attempt INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'submitted' CHECK (state IN ('submitted','approved','rework','rejected','blocked')),  -- 'blocked' = lần trả về tự động thứ 3, chờ Ryan quyết (review #5)
  checks_level TEXT CHECK (checks_level IS NULL OR checks_level IN ('ok','warn','fail')),
  decision_kind TEXT CHECK (decision_kind IS NULL OR decision_kind IN ('owner','auto')),
  decided_actor TEXT, decision_reason TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, row_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, display_id),
  CHECK (state <> 'rework' OR length(trim(coalesce(decision_reason,''))) >= 10)
);
CREATE INDEX IF NOT EXISTS ix_sub_state ON asset_submissions(state, created_at);
CREATE INDEX IF NOT EXISTS ix_sub_agent ON asset_submissions(agent_id, state);
CREATE INDEX IF NOT EXISTS ix_sub_previous ON asset_submissions(previous_id);

-- 4) asset_checks — kết quả kiểm máy, chỉ thêm (DB-GK-0.1 §4.7). Gói A: gắn vào `asset_submissions` hoặc `assets`
-- trực tiếp (không có submission_files ở gói này — xem ghi chú đầu file).
CREATE TABLE IF NOT EXISTS asset_checks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
  submission_id TEXT REFERENCES asset_submissions(id),
  asset_id TEXT REFERENCES assets(id),
  criterion TEXT NOT NULL,                      -- mã STANDARD-KIT-v1 (CH-01…FO-04) hoặc GEN-FMT/GEN-SPEC
  severity TEXT CHECK (severity IS NULL OR severity IN ('M','M*','H')),  -- mức bắt buộc của tiêu chí (server/kit-criteria.js); NULL = chưa biết (hàng cũ/ghi tay)
  kit_ver TEXT NOT NULL DEFAULT 'KIT-v1',
  level TEXT NOT NULL CHECK (level IN ('ok','warn','fail','waived')),
  measured TEXT, detail TEXT,
  checker TEXT NOT NULL CHECK (checker IN ('system','gen','owner')),
  checker_ref TEXT,
  reason TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK ((submission_id IS NOT NULL) <> (asset_id IS NOT NULL)),     -- đúng một trong hai
  CHECK (level <> 'waived' OR (checker = 'owner' AND length(trim(coalesce(reason,''))) >= 10))
);
CREATE INDEX IF NOT EXISTS ix_checks_sub ON asset_checks(submission_id, criterion, created_at);
CREATE INDEX IF NOT EXISTS ix_checks_asset ON asset_checks(asset_id, criterion, created_at);
CREATE TRIGGER IF NOT EXISTS tr_checks_noupdate BEFORE UPDATE ON asset_checks BEGIN SELECT RAISE(ABORT, 'asset_checks chỉ thêm'); END;
CREATE TRIGGER IF NOT EXISTS tr_checks_nodelete BEFORE DELETE ON asset_checks BEGIN SELECT RAISE(ABORT, 'asset_checks chỉ thêm'); END;

-- 5) kit_certs — chứng nhận ô của Ryan, chỉ thêm (DB-GK-0.1 §4.8). Ghi qua `kit.certify` (ownerUi) ở gói A.
CREATE TABLE IF NOT EXISTS kit_certs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  kit_slot TEXT NOT NULL REFERENCES kit_slots(code),
  kit_major INTEGER NOT NULL DEFAULT 1,
  subject_rev TEXT,
  h_ticks TEXT,                                 -- JSON: mã tiêu chí M*/H đã tick
  m_snapshot TEXT,                               -- JSON: [{criterion, level, check_id}] lúc chứng nhận
  via TEXT NOT NULL CHECK (via IN ('approve','certify')),
  submission_id TEXT REFERENCES asset_submissions(id),
  by TEXT NOT NULL REFERENCES users(id), at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kit_certs ON kit_certs(asset_id, kit_slot, kit_major, coalesce(subject_rev,''));
CREATE TRIGGER IF NOT EXISTS tr_kit_certs_noupdate BEFORE UPDATE ON kit_certs BEGIN SELECT RAISE(ABORT, 'kit_certs chỉ thêm'); END;
CREATE TRIGGER IF NOT EXISTS tr_kit_certs_nodelete BEFORE DELETE ON kit_certs BEGIN SELECT RAISE(ABORT, 'kit_certs chỉ thêm'); END;
