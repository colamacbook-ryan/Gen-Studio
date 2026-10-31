-- fk-off
-- © 2026 Gen Labs — All rights reserved.
-- 0010 (Gen-Studio 0.3.0, gói B — bổ sung cổng M1 cortex, trùng hướng review #36): asset_submissions thêm
-- `decided_by` (FK users, ai THỰC SỰ bấm quyết — tách khỏi `decided_actor` là chuỗi actor tự do) + CHECK
-- "chỉ Ryan (decision_kind='owner') mới đặt state approved/rejected" (DB-GK-0.1 §5 điều 4 — spec gốc có CHECK này,
-- 0006 khi dựng bảng tối giản cho gói A làm mất, không có ở prod main vì 0006 chưa release). Dựng lại asset_submissions
-- ngoài ràng buộc khoá ngoại (thêm cột + CHECK nhiều-cột không ALTER được), copy dữ liệu, giữ UNIQUE/CHECK/index khác.

DROP TABLE IF EXISTS asset_submissions_new;
CREATE TABLE asset_submissions_new (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), display_id TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id),
  kit_slot TEXT REFERENCES kit_slots(code),
  asset_id TEXT REFERENCES assets(id),
  previous_id TEXT REFERENCES asset_submissions(id),
  attempt INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'submitted' CHECK (state IN ('submitted','approved','rework','rejected','blocked')),
  checks_level TEXT CHECK (checks_level IS NULL OR checks_level IN ('ok','warn','fail')),
  decision_kind TEXT CHECK (decision_kind IS NULL OR decision_kind IN ('owner','auto')),
  decided_actor TEXT,
  decided_by TEXT REFERENCES users(id),   -- +0010: ai (owner) THỰC SỰ bấm quyết — NULL khi decision_kind='auto' (Gen không phải user)
  decision_reason TEXT,
  created_at TEXT NOT NULL, created_by TEXT, updated_at TEXT NOT NULL, row_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, display_id),
  CHECK (state <> 'rework' OR length(trim(coalesce(decision_reason,''))) >= 10),
  -- +0010: chỉ Ryan (decision_kind='owner') mới được đặt approved/rejected — Gen (auto) chỉ được rework/blocked (INT-GK-04).
  -- dùng `IS` (không phải `=`) vì SQLite coi CHECK đạt khi biểu thức ra NULL (không chỉ TRUE) — decision_kind NULL thì
  -- `decision_kind = 'owner'` ra NULL, lọt CHECK; `decision_kind IS 'owner'` luôn ra 0/1, đúng ý.
  CHECK (state NOT IN ('approved','rejected') OR decision_kind IS 'owner')
);
INSERT INTO asset_submissions_new (id, workspace_id, display_id, agent_id, kit_slot, asset_id, previous_id, attempt,
  state, checks_level, decision_kind, decided_actor, decided_by, decision_reason, created_at, created_by, updated_at, row_version)
  SELECT id, workspace_id, display_id, agent_id, kit_slot, asset_id, previous_id, attempt,
    state, checks_level, decision_kind, decided_actor, NULL, decision_reason, created_at, created_by, updated_at, row_version
  FROM asset_submissions;
DROP TABLE asset_submissions;
ALTER TABLE asset_submissions_new RENAME TO asset_submissions;

CREATE INDEX IF NOT EXISTS ix_sub_state ON asset_submissions(state, created_at);
CREATE INDEX IF NOT EXISTS ix_sub_agent ON asset_submissions(agent_id, state);
CREATE INDEX IF NOT EXISTS ix_sub_previous ON asset_submissions(previous_id);
