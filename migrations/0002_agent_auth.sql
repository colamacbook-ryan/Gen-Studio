-- fk-off
-- require-empty: oauth_grants
-- © 2026 Gen Labs — All rights reserved.
-- 0002: duyệt quyền MCP cho agent (OAuth 2.1 + ghép thiết bị). DATABASE §4.6.
-- `-- fk-off`: bộ chạy migration tắt foreign_keys NGOÀI transaction, chạy file trong transaction rồi foreign_key_check (lỗi ⇒ rollback), rồi bật lại.
-- `-- require-empty: <bảng>`: tiền kiểm — bảng có hàng thì dừng migrate và báo lỗi, không xoá dữ liệu im lặng.
-- oauth_clients/oauth_grants chưa có route nào dùng ở 0001 nên dựng lại; client cũ (nếu có, vd client demo của seed) nhận kind='dcr', created_channel='loopback'.

DROP TABLE IF EXISTS oauth_clients_new;
CREATE TABLE oauth_clients_new (
  client_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL DEFAULT 'dcr' CHECK (kind IN ('dcr','device')),             -- device = dev_<ulid>, server tự tạo cho mỗi yêu cầu ghép thiết bị
  agent_id TEXT REFERENCES agents(id), redirect_uris TEXT, name TEXT,
  created_channel TEXT NOT NULL DEFAULT 'loopback' CHECK (created_channel IN ('internal','loopback','public')), created_ip TEXT,
  expires_at TEXT, last_used_at TEXT, created_at TEXT NOT NULL, revoked_at TEXT   -- expires_at: client chưa có agent sống 1 h; trạng thái quyết định chỉ nằm ở auth_requests
);
INSERT INTO oauth_clients_new(client_id, workspace_id, agent_id, redirect_uris, name, created_at, revoked_at)
  SELECT client_id, workspace_id, agent_id, redirect_uris, name, created_at, revoked_at FROM oauth_clients;
DROP TABLE IF EXISTS oauth_grants;
DROP TABLE oauth_clients;
ALTER TABLE oauth_clients_new RENAME TO oauth_clients;
CREATE INDEX idx_oauth_clients_expires ON oauth_clients(expires_at) WHERE agent_id IS NULL;
CREATE INDEX idx_oauth_clients_agent ON oauth_clients(agent_id);

-- Một yêu cầu quyền, dùng chung cho luồng oauth (authorize) và device (ghép thiết bị). channel = kênh vào.
CREATE TABLE IF NOT EXISTS auth_requests (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('oauth','device')),
  channel TEXT NOT NULL CHECK (channel IN ('internal','loopback','public')),
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id), client_name TEXT,
  user_code_hash TEXT, device_code_hash TEXT,
  scopes_requested TEXT NOT NULL, scopes_granted TEXT,
  redirect_uri TEXT, pkce_challenge TEXT, state TEXT, resource TEXT, source_ip TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  expires_at TEXT NOT NULL, last_poll_at TEXT,
  decided_by TEXT REFERENCES users(id), decided_at TEXT, agent_id TEXT REFERENCES agents(id), replaces_agent_id TEXT REFERENCES agents(id),
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_requests_user_code ON auth_requests(user_code_hash) WHERE status='pending' AND user_code_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_requests_device ON auth_requests(device_code_hash) WHERE device_code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_requests_status ON auth_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_requests_channel ON auth_requests(channel, status);
CREATE INDEX IF NOT EXISTS idx_auth_requests_client ON auth_requests(client_id);

-- code (60 s, dùng 1 lần) và refresh (xoay vòng theo parent_id/child_id, 30 ngày trượt). token_hash = băm của code hoặc gsr_…
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL CHECK (kind IN ('code','refresh')),
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id), agent_id TEXT NOT NULL REFERENCES agents(id), auth_request_id TEXT REFERENCES auth_requests(id),
  scopes TEXT, pkce_challenge TEXT, redirect_uri TEXT, resource TEXT,
  expires_at TEXT NOT NULL, used_at TEXT, parent_id TEXT REFERENCES oauth_grants(id), child_id TEXT, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_oauth_grants_agent ON oauth_grants(agent_id);
CREATE INDEX idx_oauth_grants_parent ON oauth_grants(parent_id);
CREATE INDEX idx_oauth_grants_expires ON oauth_grants(expires_at);

-- access token gsa_… (1 giờ, audience = server_id, scopes đã hạ) nằm chung bảng với token tay gst_… (scopes NULL → theo agent)
ALTER TABLE agent_tokens ADD COLUMN kind TEXT NOT NULL DEFAULT 'static' CHECK (kind IN ('static','access'));
ALTER TABLE agent_tokens ADD COLUMN expires_at TEXT;
ALTER TABLE agent_tokens ADD COLUMN audience TEXT;
ALTER TABLE agent_tokens ADD COLUMN scopes TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_tokens_agent ON agent_tokens(agent_id, kind);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires ON agent_tokens(expires_at) WHERE kind='access';

-- audit_log: entry nhận thêm 'oauth' (/oauth/* không xác thực, actor client:<id>/agent:<id>); dựng lại và tạo lại trigger chỉ-thêm
CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  ts TEXT NOT NULL, actor TEXT NOT NULL,
  entry TEXT NOT NULL CHECK (entry IN ('ui','http','mcp','cli','assistant','runner','system','oauth')),
  action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, before TEXT, after TEXT, request_id TEXT,
  UNIQUE (workspace_id, display_id)
);
INSERT INTO audit_log_new SELECT id, workspace_id, display_id, ts, actor, entry, action, entity_type, entity_id, before, after, request_id FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_ts ON audit_log(ts);
CREATE TRIGGER tr_audit_noupdate BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log chỉ thêm'); END;
CREATE TRIGGER tr_audit_nodelete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log chỉ thêm'); END;
