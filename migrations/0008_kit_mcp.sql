-- © 2026 Gen Labs — All rights reserved.
-- 0008 (Gen-Studio 0.3.0, gói B — SPEC-GK-0.1 Muse: list/claim/get_input/submit/upload_chunk/report_blocked; review:
-- record_checks/auto_rework/propose; DB-GK-0.1 §6): MCP nộp hàng theo phiếu + token nộp có hạn.
-- Không cần `-- fk-off`: chỉ ADD COLUMN trên bảng có sẵn (không CHECK nhiều-cột mới) + bảng mới.
-- `agents`/`agent_tokens` đã có `expires_at`/`revoked_at` từ 0001/0002 (gói A đã ghi chú) — KHÔNG thêm cột ở đây,
-- chỉ dùng chúng: `token.create --expires` ghi `agent_tokens.expires_at`, server kiểm hạn ở `verifyAgentToken` (mọi kind,
-- không riêng 'access' như trước 0.3.0-B).

-- 1) kit_slots: khoá nhận ô của Muse (kit_claim) — một ô chỉ một agent giữ tại một thời điểm, hết hạn 2 giờ không nộp
-- thì tự rảnh (claim_expires_at quá hạn ⇒ kit_list/kit_claim coi như rảnh, không cần job dọn riêng).
ALTER TABLE kit_slots ADD COLUMN claimed_by TEXT REFERENCES agents(id);
ALTER TABLE kit_slots ADD COLUMN claimed_at TEXT;
ALTER TABLE kit_slots ADD COLUMN claim_expires_at TEXT;
CREATE INDEX IF NOT EXISTS ix_kit_slots_claim ON kit_slots(claimed_by) WHERE claimed_by IS NOT NULL;

-- 2) upload_sessions — phiên tải lên theo chunk (kit_upload_chunk, tới 50 MB, chunk 1 MB). Tệp tạm nằm ngoài `media/`
-- (data/tmp/uploads/<id>.bin); `submission.submit` đọc xong thì xoá tệp tạm (dọn khi session 'aborted'/'done' quá 24 h
-- để lại rác hiếm khi lỗi giữa chừng — chưa có job dọn riêng ở gói B, ghi trong "Quyết định tự chọn").
CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  kit_slot TEXT NOT NULL REFERENCES kit_slots(code),
  declared_mime TEXT,
  tmp_path TEXT NOT NULL,
  received_bytes INTEGER NOT NULL DEFAULT 0,
  next_chunk INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'aborted')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_upload_sessions_agent ON upload_sessions(agent_id, state);
