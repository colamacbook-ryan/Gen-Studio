-- © 2026 Gen Labs — All rights reserved.
-- 0004 (gói V, SPEC-0.2.0 §3.4/§3.5): nguồn gốc nhân vật do SERVER đặt (không bao giờ từ payload) — 'seed' | 'migration' | 'owner' | 'agent'.
-- Hàng có sẵn (0.1.x) ⇒ 'migration'. server/ops/cast.js đặt 'owner' / 'agent' khi tạo mới; chỉ 'seed' / 'migration' được dùng lược đồ công thức cũ (legacy) và chỉ khi owner/system lưu.
ALTER TABLE cast_members ADD COLUMN origin TEXT NOT NULL DEFAULT 'migration' CHECK (origin IN ('seed','migration','owner','agent'));
