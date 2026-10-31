-- © 2026 Gen Labs — All rights reserved.
-- 0007 (Gen-Studio 0.3.0, gói A — DB-GK-0.1 §12): nhật ký lượt tải qua token, tách khỏi 0006 để phát hành theo bước
-- (đúng DB-GK-0.1 "migration 0007, tách khỏi 0006"). Chỉ bảng `asset_fetch_log` + index ở gói A — `api_users`/`api_tokens`/
-- `asset_public` (kho công khai theo họ, mã công khai, luật chống quét) để gói sau (chưa có op/route dùng tới ở 0.3.0-A).
-- Không cần `-- fk-off`: bảng mới, không đụng bảng có dữ liệu.

CREATE TABLE IF NOT EXISTS asset_fetch_log (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  token_id TEXT,                                -- gói A: id của agent_tokens (token nội bộ scope assets.submit/assets.review); không FK cứng vì agent_tokens không có PK ổn định ngoài rowid
  asset_id TEXT REFERENCES assets(id),
  at TEXT NOT NULL,
  ip_hash TEXT,
  bytes INTEGER,
  result TEXT NOT NULL CHECK (result IN ('ok','quota','suspended','not_public')),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_fetch_log_token ON asset_fetch_log(token_id, at);
CREATE INDEX IF NOT EXISTS ix_fetch_log_asset ON asset_fetch_log(asset_id, at);
CREATE INDEX IF NOT EXISTS ix_fetch_log_at ON asset_fetch_log(at);
-- chỉ thêm; xoá chỉ cho hàng quá hạn giữ 180 ngày (DB-GK-0.1 §12), dọn bằng op `fetch_log.prune` (system).
CREATE TRIGGER IF NOT EXISTS tr_fetch_log_noupdate BEFORE UPDATE ON asset_fetch_log BEGIN SELECT RAISE(ABORT, 'asset_fetch_log chỉ thêm'); END;
CREATE TRIGGER IF NOT EXISTS tr_fetch_log_nodelete_recent BEFORE DELETE ON asset_fetch_log
WHEN OLD.at >= datetime('now','-180 days')
BEGIN SELECT RAISE(ABORT, 'asset_fetch_log: chỉ xoá hàng quá hạn giữ 180 ngày'); END;
