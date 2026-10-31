# Nhập kho hàng hiện có · Import existing library into the Kit

VI: `genstudio import` quét `library/catalog.json` (hàng cũ, trước Bộ Neo) và `library/inbox/MR-xxx-*/`
(hàng Muse đã nộp), ánh xạ từng file sang mã ô `kit_slots.code` (457 ô, STANDARD-KIT-v1), rồi ghi vào DB qua
`write()`: `asset.put` (tạo asset — khoá chống trùng là `sha256`, chạy lại không tạo thêm), `asset.meta`
(gắn ô + phân loại nguồn/quyền dùng/chất lượng), `submission.import` (ghi lần nộp, INSERT thẳng trạng thái
đích), và `submission.record_checks` nếu `server/checks/` (gói E) có mặt.

EN: `genstudio import` scans `library/catalog.json` (legacy inventory, pre-Kit) and `library/inbox/MR-xxx-*/`
(submitted Muse batches), maps each file to a `kit_slots.code` (457 slots, STANDARD-KIT-v1), then writes to
the DB through `write()`: `asset.put` (creates the asset — dedup key is `sha256`, re-running creates nothing
new), `asset.meta` (assigns the slot + classifies source/usage rights/quality), `submission.import` (records
the submission, inserting straight into its target state), and `submission.record_checks` if `server/checks/`
(package E) is present.

## Chạy · Run

```bash
genstudio import --dry-run          # chỉ báo cáo, không ghi DB · report only, no writes
genstudio import                    # ghi thật + xuất data/kit-status.json
genstudio import --only MR-044      # chỉ một phiếu (bỏ qua catalog.json)
```

Không cần `studio` đang chạy (`genstudio start`) — lệnh mở thẳng `data/studio.db` qua `DATA_DIR`.
Chạy ngoài container (dev): `DATA_DIR=./data node cli/import-kit.js [--dry-run] [--only MR-xxx]`.

## Ánh xạ file → mã ô · File → slot mapping (`server/kit-map.js`)

Hai tầng, theo thứ tự:

1. **OVERRIDES** — ánh xạ tay theo `(mã phiếu MR, tên file)` cho hàng đã nộp với tên tự do (MUSE.md §3 không ép
   tên theo mã ô). Hiện có: MR-044 (Nhi · thiết kế 3D gốc → `nhi.id.01`), MR-046 (Vy · thiết kế 3D gốc →
   `vy.id.01`), MR-047 (Vy · bảng xoay → `vy.id.02..05`, file sheet tổng hợp cố ý không gắn ô), MR-052 (Ryan ·
   toàn thân 3D → `ryan.id.01`).
2. **Mẫu tên số** `<subject>-<NN>-<slug>.<png|jpg|jpeg|webp>` ⇒ thử `<subject>.expr.<NN>` rồi
   `<subject>.pose.<NN>` (ví dụ `nhi-21-sulking.png` ⇒ `nhi.expr.21`). Đây là mẫu tên khuyến nghị cho lô Muse
   **sau này** nộp thẳng theo ô (xem `library/requests/MR-063-nhi-bieu-cam-v2.md` — ticket đang `todo` dùng
   đúng mẫu này, vd `nhi-00-base.png`, `nhi-07-laughing.png`).

Không khớp cả hai ⇒ **không ánh xạ được**, báo rõ lý do trong báo cáo cuối lệnh (không đoán mò). Lưu ý:
`MR-048/050/054` (bộ 12 biểu cảm cũ, tên `nhi-expr-NN-slug.png`) **cố ý** không tự ánh xạ theo số thứ tự dù
tên gần giống mẫu trên — nội dung/thứ tự của bộ cũ KHÔNG khớp bảng 40 biểu cảm chính thức của `nhi.expr.*`
(ví dụ `nhi-expr-02-explaining.png` ≠ `nhi.expr.02` = "Khẩu hình a") nên map theo số sẽ SAI; cần người xem lại
nội dung rồi thêm override tay nếu muốn giữ, hoặc chờ lô v2 (`MR-063/065/066`) thay thế.

## Quyết định đã duyệt · Decisions already made

Theo `HANDOFF-LOCAL.md` §4 mục C (Ryan 31/10/2026), mã hoá trong `DECISIONS` ở `cli/import-kit.js`:

| MR | Trạng thái ghi vào `asset_submissions.state` |
|---|---|
| MR-044, MR-046, MR-052 | `approved` (`decision_kind='owner'`, `decided_actor='ryan'`) |
| MR-047 | `submitted` + một đề xuất `SG-` (`submission.propose`) cho Ryan xác nhận |
| Mọi MR khác có hàng trong inbox | `submitted` (chờ kiểm, chưa có quyết định) |

Gói C **không** có `submission.approve/reject` (thuộc pipeline Muse đầy đủ, gói khác) — "approved" ở đây là
`asset_submissions` state đích được **INSERT thẳng** một lần (đúng cách DB-GK-0.1 §8 mô tả cho importer),
không đi qua cạnh chuyển trạng thái bình thường.

## Chống trùng khi chạy lại · Re-run idempotency

- Asset: `asset.put` khoá theo `sha256` — file giống hệt ⇒ `deduped:true`, không tạo hàng mới.
- Mô tả (`asset.meta`): chỉ `UPDATE` cột nào thực sự khác giá trị cũ; khớp sẵn ⇒ `changed:false`.
- Lần nộp (`submission.import`): khoá theo cặp `(asset_id, kit_slot)` — đã có lần nộp cho đúng cặp này thì bỏ
  qua, không tạo thêm (không có đường "nộp lại" ở gói C).
- Máy kiểm chỉ chạy khi vừa tạo lần nộp **mới** trong lần chạy đó (tránh ghi `asset_checks` trùng mỗi lần
  `import` lại).

## `data/kit-status.json`

Sau khi ghi thật (không `--dry-run`), lệnh xuất `data/kit-status.json`:

```json
{
  "generated_at": "2026-10-31T12:00:00.000Z",
  "slots": {
    "nhi.id.01": { "asset_id": "AS-0003", "state": "approved", "checks_level": null },
    "nhi.id.02": null
  }
}
```

`slots[code]` là `null` khi ô chưa có hàng, hoặc `{asset_id, state, checks_level}` của asset/lần-nộp mới nhất
gắn vào ô đó (`checks_level` chỉ có giá trị khi kiểm được ghi qua `submission` — kiểm ghi qua `asset` trực
tiếp, như import vẫn làm để tránh ràng buộc `state` của `submission.record_checks`, không cập nhật cột này;
xem `asset_checks` theo `asset_id` để biết chi tiết).

File này **không** gọi Google Sheet API — script `deploy/gcp/tickets-sheet.py sync` (nhánh `main`, đã có trên
VM) đọc file này để đồng bộ sổ phiếu, tách rời khỏi gói C.

## Giới hạn đã biết · Known limitations (gói C, 0.3.0)

- `library/catalog.json` chỉ nhập được các `type` có `kind` tương ứng trong `assets.kind`
  (`character-still/illustration/background`→`image`/`svg`, `character-clip/broll`→`video`, `sfx/music`→
  `audio`); `icon-set`/`font`/`lottie`/`motion-template` (tập nhiều tệp hoặc `kind` chưa có trong gói C) bị
  bỏ qua, báo trong "File không ánh xạ được".
- SVG của bên thứ ba không qua được allowlist `svgOk` (`server/write.js`, chặn `<use>`/`<style>`/thực thể…)
  bị từ chối — ghi vào mục "Lỗi" của báo cáo, không làm hỏng cả lượt nhập.
- Ánh xạ file → ô chỉ theo **tên file**, không đọc nội dung ảnh — vì vậy cố ý hẹp (xem mục MR-048/050/054 ở
  trên) thay vì đoán sai.
