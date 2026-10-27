-- © 2026 Gen Labs — All rights reserved.
-- Gen-Studio schema v1 — hiện thực spec/DATABASE.md §4 (forward-only).

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi','en')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE id_counters (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), prefix TEXT NOT NULL, last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, prefix)
);
CREATE TABLE settings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), key TEXT NOT NULL, value TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY (workspace_id, key)
);
CREATE TABLE secrets (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL,
  ciphertext BLOB NOT NULL, nonce BLOB NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (workspace_id, name)
);
CREATE TABLE saved_views (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  grid TEXT NOT NULL, name TEXT NOT NULL, query TEXT, sort TEXT, columns TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  username TEXT NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','reviewer')), locale TEXT NOT NULL DEFAULT 'vi',
  last_login_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE UNIQUE INDEX ux_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf_secret TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, ua TEXT, ip TEXT
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  name TEXT NOT NULL, lang_primary TEXT NOT NULL DEFAULT 'vi', lang_terms TEXT NOT NULL DEFAULT 'en',
  current_version INTEGER NOT NULL DEFAULT 1, row_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_channels_ws ON channels(workspace_id) WHERE deleted_at IS NULL;
CREATE TABLE channel_versions (
  entity_id TEXT NOT NULL REFERENCES channels(id), version INTEGER NOT NULL, data TEXT NOT NULL,
  note TEXT, created_at TEXT NOT NULL, created_by TEXT, PRIMARY KEY (entity_id, version)
);

CREATE TABLE curriculum_nodes (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id), parent_id TEXT REFERENCES curriculum_nodes(id),
  ord INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, principle TEXT, prereq_ids TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  row_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_cu_order ON curriculum_nodes(channel_id, ord);
CREATE INDEX ix_cu_status ON curriculum_nodes(channel_id, status);

CREATE TABLE cast_members (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id), name TEXT NOT NULL, role_label TEXT,
  current_version INTEGER NOT NULL DEFAULT 1, row_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE cast_versions (
  entity_id TEXT NOT NULL REFERENCES cast_members(id), version INTEGER NOT NULL, data TEXT NOT NULL,
  note TEXT, created_at TEXT NOT NULL, created_by TEXT, PRIMARY KEY (entity_id, version)
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('internal','token','oauth')),
  scopes TEXT NOT NULL, cli TEXT, wake_limit_per_day INTEGER, last_call_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stalled','revoked')),
  row_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  agent_id TEXT NOT NULL REFERENCES agents(id), token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL,
  created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  agent_id TEXT NOT NULL REFERENCES agents(id), redirect_uris TEXT, name TEXT,
  created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY, code_hash TEXT, refresh_hash TEXT, client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  scopes TEXT, pkce_challenge TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE providers (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tts','judge','align','assistant','cli_agent')),
  vendor TEXT NOT NULL, model TEXT, secret_name TEXT, enabled INTEGER NOT NULL DEFAULT 1, scan TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE provider_usage (
  provider_id TEXT NOT NULL REFERENCES providers(id), day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, errors_429 INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (provider_id, day)
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id), curriculum_node_id TEXT REFERENCES curriculum_nodes(id),
  title TEXT NOT NULL, current_version INTEGER NOT NULL DEFAULT 1, latest_render_id TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT, deleted_by TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE work_orders (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  kind TEXT NOT NULL CHECK (kind IN ('new_lesson','revise','unblock','manual')),
  curriculum_node_id TEXT REFERENCES curriculum_nodes(id), lesson_id TEXT REFERENCES lessons(id),
  review_id TEXT, render_id TEXT, agent_id TEXT REFERENCES agents(id),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','assigned','fulfilled','stalled','cancelled')),
  brief TEXT, attempts INTEGER NOT NULL DEFAULT 0, opened_at TEXT NOT NULL, assigned_at TEXT, closed_at TEXT,
  summary TEXT, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_wo_state ON work_orders(state, opened_at);
CREATE INDEX ix_wo_agent ON work_orders(agent_id, state);
CREATE INDEX ix_wo_node ON work_orders(curriculum_node_id);
CREATE UNIQUE INDEX ux_wo_new_lesson_open ON work_orders(curriculum_node_id)
  WHERE kind='new_lesson' AND state IN ('open','assigned') AND curriculum_node_id IS NOT NULL;

CREATE TABLE lesson_versions (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id), version INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'submitted' CHECK (state IN ('draft','submitted','superseded')),
  camera_hints TEXT, note TEXT, work_order_id TEXT REFERENCES work_orders(id), submitted_by TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (lesson_id, version)
);
CREATE TABLE lines (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  lesson_version_id TEXT NOT NULL REFERENCES lesson_versions(id), ord INTEGER NOT NULL,
  cast_member_id TEXT NOT NULL REFERENCES cast_members(id), say TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'vi' CHECK (lang IN ('vi','en')), terms_declared TEXT, subtitle TEXT, mood TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (lesson_version_id, display_id)
);
CREATE INDEX ix_lines_ver ON lines(lesson_version_id, ord);
CREATE TABLE beats (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  lesson_version_id TEXT NOT NULL REFERENCES lesson_versions(id), ord INTEGER NOT NULL,
  block_type TEXT NOT NULL, block_version INTEGER NOT NULL DEFAULT 1, params TEXT NOT NULL,
  anchor_line_display_id TEXT NOT NULL CHECK (length(anchor_line_display_id) > 0),
  anchor_word_index INTEGER NOT NULL CHECK (anchor_word_index >= 0), asset_ids TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (lesson_version_id, display_id)
);
CREATE INDEX ix_beats_ver ON beats(lesson_version_id, ord);

CREATE TABLE assets (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('svg','image','audio','video','subtitle','cover','logo','manifest')),
  sha256 TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL, mime TEXT, meta TEXT,
  media_present INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','system')),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id), UNIQUE (workspace_id, sha256)
);
CREATE TABLE voice_clips (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE, provider_id TEXT REFERENCES providers(id), model TEXT, voice TEXT,
  say TEXT NOT NULL, style TEXT, asset_id TEXT REFERENCES assets(id), raw_asset_id TEXT REFERENCES assets(id),
  duration_ms INTEGER, word_times TEXT, envelope TEXT, terms_detected TEXT, transcript TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE renders (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  lesson_version_id TEXT NOT NULL REFERENCES lesson_versions(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','voicing','judging','aligning','rendering','mixing',
    'gating','awaiting_review','approved','changes_requested','rejected','waiting_quota','retrying','blocked','superseded')),
  state_changed_at TEXT NOT NULL, waiting_until TEXT, blocked_reason TEXT, progress REAL NOT NULL DEFAULT 0,
  manifest TEXT, outputs TEXT, duration_ms INTEGER, frames INTEGER,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_renders_state ON renders(state, state_changed_at);
CREATE INDEX ix_renders_ver ON renders(lesson_version_id);
CREATE TABLE gate_results (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('voice_clip','render')), subject_id TEXT NOT NULL,
  gate TEXT NOT NULL CHECK (gate IN ('G-WAV','G-SCRIPT','G-PRON','G-LOUD','G-SYNC','G-MOTION','G-FRAMES','G-MUX')),
  result TEXT NOT NULL CHECK (result IN ('pass','fail','unknown')), measure TEXT, run_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_gate_subject ON gate_results(subject_kind, subject_id, gate);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  render_id TEXT NOT NULL REFERENCES renders(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','changes_requested','rejected')),
  decided_by TEXT NOT NULL REFERENCES users(id), review_seconds INTEGER, work_order_id TEXT REFERENCES work_orders(id),
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE review_notes (
  id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id),
  pin_kind TEXT NOT NULL CHECK (pin_kind IN ('line','beat','time')), pin_ref TEXT NOT NULL,
  at_ms INTEGER, text TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('agent_wake','tts','judge','align','render','mix','gate','export',
    'voicing','judging','aligning','rendering','mixing','gating')),
  render_id TEXT REFERENCES renders(id), work_order_id TEXT REFERENCES work_orders(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','done','failed','waiting_quota','cancelled')),
  attempt INTEGER NOT NULL DEFAULT 0, started_at TEXT, finished_at TEXT, progress REAL NOT NULL DEFAULT 0,
  cost TEXT, error TEXT, log_path TEXT, lease_until TEXT, worker_id TEXT, waiting_until TEXT, payload TEXT, result TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_runs_lease ON runs(state, lease_until);
CREATE INDEX ix_runs_render ON runs(render_id);
CREATE INDEX ix_runs_wo ON runs(work_order_id);
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  target_kind TEXT NOT NULL, target_id TEXT, diff TEXT,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','applied','dismissed')),
  applied_by TEXT REFERENCES users(id), applied_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, display_id)
);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  ts TEXT NOT NULL, actor TEXT NOT NULL,
  entry TEXT NOT NULL CHECK (entry IN ('ui','http','mcp','cli','assistant','runner','system')),
  action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, before TEXT, after TEXT, request_id TEXT,
  UNIQUE (workspace_id, display_id)
);
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_ts ON audit_log(ts);

-- ===== Bất biến (R4) =====
CREATE TRIGGER tr_lv_immutable BEFORE UPDATE OF lesson_id, version, camera_hints, note, work_order_id, submitted_by, created_at, created_by ON lesson_versions
BEGIN SELECT RAISE(ABORT, 'lesson_versions bất biến: tạo version mới thay vì sửa'); END;
CREATE TRIGGER tr_lines_immutable BEFORE UPDATE ON lines BEGIN SELECT RAISE(ABORT, 'lines bất biến: tạo lesson_version mới'); END;
CREATE TRIGGER tr_beats_immutable BEFORE UPDATE ON beats BEGIN SELECT RAISE(ABORT, 'beats bất biến: tạo lesson_version mới'); END;
CREATE TRIGGER tr_vc_immutable BEFORE UPDATE OF content_hash, provider_id, model, voice, say, style, asset_id, raw_asset_id, duration_ms ON voice_clips
BEGIN SELECT RAISE(ABORT, 'voice_clips bất biến'); END;
-- các cột do align/judge điền một lần: chỉ được ghi khi còn NULL
CREATE TRIGGER tr_vc_fill_once BEFORE UPDATE OF word_times, envelope, terms_detected, transcript ON voice_clips
WHEN (OLD.word_times IS NOT NULL AND NEW.word_times IS NOT OLD.word_times)
  OR (OLD.envelope IS NOT NULL AND NEW.envelope IS NOT OLD.envelope)
  OR (OLD.terms_detected IS NOT NULL AND NEW.terms_detected IS NOT OLD.terms_detected)
  OR (OLD.transcript IS NOT NULL AND NEW.transcript IS NOT OLD.transcript)
BEGIN SELECT RAISE(ABORT, 'voice_clips bất biến: cột đã điền không sửa được'); END;
CREATE TRIGGER tr_assets_immutable BEFORE UPDATE OF kind, sha256, path, bytes, mime, meta, source, created_at ON assets
BEGIN SELECT RAISE(ABORT, 'assets bất biến (chỉ media_present đổi được)'); END;
CREATE TRIGGER tr_gate_immutable BEFORE UPDATE ON gate_results BEGIN SELECT RAISE(ABORT, 'gate_results bất biến'); END;
CREATE TRIGGER tr_reviews_immutable BEFORE UPDATE ON reviews BEGIN SELECT RAISE(ABORT, 'reviews bất biến'); END;
CREATE TRIGGER tr_rnotes_immutable BEFORE UPDATE ON review_notes BEGIN SELECT RAISE(ABORT, 'review_notes bất biến'); END;
CREATE TRIGGER tr_render_manifest BEFORE UPDATE OF manifest ON renders
WHEN OLD.manifest IS NOT NULL AND NEW.manifest IS NOT OLD.manifest
BEGIN SELECT RAISE(ABORT, 'renders.manifest bất biến sau khi đóng băng'); END;
CREATE TRIGGER tr_render_lv BEFORE UPDATE OF lesson_version_id ON renders
BEGIN SELECT RAISE(ABORT, 'renders.lesson_version_id bất biến'); END;

CREATE TRIGGER tr_audit_noupdate BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log chỉ thêm'); END;
CREATE TRIGGER tr_audit_nodelete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log chỉ thêm'); END;
CREATE TRIGGER tr_lv_nodelete BEFORE DELETE ON lesson_versions BEGIN SELECT RAISE(ABORT, 'lesson_versions không xoá'); END;
CREATE TRIGGER tr_lines_nodelete BEFORE DELETE ON lines BEGIN SELECT RAISE(ABORT, 'lines không xoá'); END;
CREATE TRIGGER tr_beats_nodelete BEFORE DELETE ON beats BEGIN SELECT RAISE(ABORT, 'beats không xoá'); END;
CREATE TRIGGER tr_gate_nodelete BEFORE DELETE ON gate_results BEGIN SELECT RAISE(ABORT, 'gate_results không xoá'); END;
CREATE TRIGGER tr_reviews_nodelete BEFORE DELETE ON reviews BEGIN SELECT RAISE(ABORT, 'reviews không xoá'); END;
CREATE TRIGGER tr_rnotes_nodelete BEFORE DELETE ON review_notes BEGIN SELECT RAISE(ABORT, 'review_notes không xoá'); END;
