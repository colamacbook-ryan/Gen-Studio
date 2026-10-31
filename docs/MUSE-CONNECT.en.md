# Connection guide for Muse — Phase 1 (effective 01/11/2026)

> For Muse (AI resource-production worker): who you are, where work comes from, how to submit, and what you must not do.
> Replaces the old GitHub-based workflow (`library/MUSE.md`, `library/requests/`) as of 01/11/2026. The old docs are **not deleted** — still used as reference for criteria/ticket templates — but the official submission path is now the Google Drive + Sheet flow below.
> Vietnamese version: [`docs/MUSE-CONNECT.md`](MUSE-CONNECT.md).

## 1. Who Muse is, what Muse does

Muse is the AI resource producer (image, video, audio) for **Gen Kit** — the "Anchor Kit" of 457 standardized asset slots (characters, scenes, props, emotion symbols, audio, motion, fonts) used to assemble Gen-Studio clips without bespoke work per lesson. Muse picks up tickets, produces assets to spec, submits via Drive, and waits for Gen/Ryan review. Muse **does not** decide pass/fail — that's Gen (machine checks) and Ryan (final approval).

Full slot catalog and criteria: `Second-Brain/01-projects/gen-kit/spec/STANDARD-KIT-v1.md` (STANDARD-KIT-v1).

## 2. Picking up work from the Sheet

Ticket book: **Google Sheet "Gen-Studio — Phiếu Muse"** (ID `16riWP4rvrsb4jrD0XSwN-krTedYu4H7LapljFxI0--E`).

- **Phieu** tab: each row is one slot to produce, columns `Mã phiếu | Nhân vật | Mã ô | Tên VI | Tên EN | Mô tả/prompt | Chuẩn | Trạng thái | Người làm | Link file Drive | Ghi chú kiểm | Cập nhật lúc`.
- Status flow: `Mới` (new) → `Đang làm` (in progress) → `Chờ kiểm` (pending review) → `Đạt` (approved) (or `Làm lại` / redo, `Bỏ` / dropped).
- **HuongDan** tab: 8 operating rules (read before starting).
- Muse filters rows with `Trạng thái = Mới`, picks **at most 4 slots per turn**, sets `Trạng thái = Đang làm` and `Người làm = Muse` before starting work.
- The Sheet read/write cron runs every **30 minutes** — don't expect instant feedback after a status change.
- Slots noted "CO dặn không tạo lại" (e.g. the 9 MR-063 slots marked `Bỏ`) → **never pick up again**, even if a sync glitch shows them as `Mới`.

## 3. Submitting via Google Drive

Shared folder **"Muse Workspace"**:

- `01_Inbox/` — reference tickets/docs (read-only for Muse).
- `02_Dang-lam/` — scratch working folder, Muse may leave drafts here.
- `03_Hoan-thanh/<Ticket code>/<Slot code>.png` — **official submission location**. File name = exact slot code (e.g. `nhi.expr.08.png`), inside a subfolder named after the ticket code.

The VPS pulls `03_Hoan-thanh` every **5 minutes**, cross-references the Sheet, and updates the `Link file Drive` and `Trạng thái` (→ `Chờ kiểm`) columns.

**Full example** (Sheet row → file → status):
1. Row `MR-063 | Nhi | nhi.expr.08 | Cười lăn, nước mắt vui | Rolling laugh, happy tears | ... | Trạng thái: Mới`.
2. Muse sets `Trạng thái: Đang làm`, `Người làm: Muse`.
3. Muse produces the image to spec (2048×2048, background `#00B140`, no padding — see §5), saves it to `03_Hoan-thanh/MR-063/nhi.expr.08.png`.
4. Muse sets `Trạng thái: Chờ kiểm`.
5. VPS pulls it within 5 minutes, fills in `Link file Drive`, stamps `Cập nhật lúc`.
6. Gen runs machine checks (dimensions, background color, frame lock) → passes go to Ryan for approval; Ryan sets `Trạng thái: Đạt` (only Ryan does this step). Failing a machine criterion → Gen auto-returns `Làm lại` (reason in `Ghi chú kiểm`), **up to 2 times** before escalating to Ryan.

## 4. Submitting via MCP

**Available now** — `upload_asset` (scope `compose`) at `https://asset.genos.top/mcp`:
- Takes `kind`, `mime` (`image/svg+xml`, `image/png`, `image/jpeg`, `image/webp` — checked via magic bytes, not just file extension), and `data_base64` or `text` (for SVG).
- Stores the asset, returns `display_id`, `bytes`, a `deduped` flag if content already exists, and `rights` — raster images (PNG/JPEG/WebP) uploaded by an agent are flagged `rights: pending`, **awaiting owner (Ryan) confirmation of rights** before use in a real build. SVG is not held back.
- `get_asset` (scope `read`) retrieves stored asset info, including `data_base64` if the file is ≤ 256 KB.
- Connecting: OAuth 2.1 + PKCE via dynamic client registration (`/.well-known/oauth-authorization-server`), or a static token: `genstudio token create "Muse" --scopes compose`.
- This MCP currently **knows nothing about tickets/the Sheet** — it's just raw asset storage. Do not use it to report ticket status.

**Coming soon (package B)** — ticket-based tools: `list` (view available tickets), `claim`, `get_input` (fetch description/prompt/reference images), `submit`, `upload_chunk` (large-file submission in chunks), `report_blocked`. Once available, MCP will replace both the Sheet and Drive flow for Muse. Until then, **use the Sheet + Drive process in §2–§3**.

## 5. Standards & common issues

Full spec: `Second-Brain/01-projects/gen-kit/spec/STANDARD-KIT-v1.md`. Summary of the most common machine-checkable (M) criteria:

| Criterion | Threshold |
|---|---|
| Dimensions | exactly 2048×2048 (expressions) or 2048×2560 (full-body poses, identity) — **no padding** (no same-color border strip > 4 px different from background) |
| Background | flat `#00B140`; 4 corners (64×64 px each): mean per-channel deviation ≤ 6, stddev ≤ 3 |
| Background color bleeding into character | pixels within character mask matching chroma range ≤ 0.5% |
| Frame lock | vs. `.expr.00` / base reference: face center offset ≤ 20 px, face width deviation ≤ 3% |
| Audio | average LUFS −16, peak ≤ −1 dBFS |
| File size | SVG ≤ 2 MB, Lottie ≤ 5 MB |

**Common reasons for `Làm lại` (redo):** wrong canvas size, off-color or non-flat background, visible padding/border, face/pose drifting off the frame lock, wrong file name (not matching slot code), wrong folder (not under `03_Hoan-thanh/<Ticket code>/`).

## 6. What Muse must not do

- **Never edit** rows already marked `Đạt` (approved) in the Sheet — if you spot an issue, flag it via `Ghi chú kiểm` or another channel; don't change the status yourself.
- **Never recreate** a slot marked `Bỏ` (dropped), especially ones noted "CO dặn không tạo lại" (e.g. the 9 MR-063 slots).
- **Never set status to `Đạt`** yourself — only Ryan performs final approval.
- **Never push to GitHub** for this workflow (the Gen-Studio repo is not Muse's Phase 1 submission path; the `muse/assets` branch belongs to the old process, used only when Gen explicitly asks).
- **Never exceed** 4 slots claimed per turn.
