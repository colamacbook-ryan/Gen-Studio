# Nhập kho hàng hiện có · Import existing library into the Kit

VI: `genstudio import` quét `library/catalog.json` (hàng cũ, trước Bộ Neo) và `library/inbox/MR-xxx-*/`
(hàng Muse đã nộp, hoặc `--source <dir>` cho nguồn khác, vd Drive), ánh xạ từng file sang mã ô `kit_slots.code`
(457 ô, STANDARD-KIT-v1), rồi ghi vào DB qua `write()`: `asset.put` (tạo asset **LUÔN**, kể cả file không ánh
xạ được ô — khoá chống trùng là `sha256`, chạy lại không tạo thêm), `asset.meta` (gắn ô nếu có + phân loại
nguồn/quyền dùng/chất lượng), `submission.import` + `submission.set_state` (ghi lần nộp, chỉ khi có ô), và
`submission.record_checks` nếu `server/checks/` (gói E) có mặt.

EN: `genstudio import` scans `library/catalog.json` (legacy inventory, pre-Kit) and `library/inbox/MR-xxx-*/`
(submitted Muse batches, or `--source <dir>` for another source, e.g. Drive), maps each file to a
`kit_slots.code` (457 slots, STANDARD-KIT-v1), then writes to the DB through `write()`: `asset.put` (creates
the asset **ALWAYS**, even for files that don't map to a slot — dedup key is `sha256`, re-running creates
nothing new), `asset.meta` (assigns the slot if any + classifies source/usage rights/quality),
`submission.import` + `submission.set_state` (records the submission, only when a slot was found), and
`submission.record_checks` if `server/checks/` (package E) is present.

## Chạy · Run

```bash
genstudio import --dry-run          # chỉ báo cáo, không ghi DB · report only, no writes
genstudio import                    # ghi thật + xuất data/kit-status.json
genstudio import --only MR-044      # chỉ một phiếu (bỏ qua catalog.json)
genstudio import --source /opt/gen-studio/data/inbox/drive/03_Hoan-thanh   # thư mục chứa trực tiếp MR-xxx-*/ (Drive), bỏ qua catalog.json
genstudio import --allow-errors     # có lỗi (vd SVG bị allowlist chặn) vẫn thoát mã 0
```

Không cần `studio` đang chạy (`genstudio start`) — lệnh mở thẳng `data/studio.db` qua `DATA_DIR`.
Chạy ngoài container (dev/test tay): `DATA_DIR=<thư mục scratch> node cli/import-kit.js [--dry-run] [--only MR-xxx]`
— **luôn đặt `DATA_DIR` trỏ ra thư mục tạm khi thử nghiệm**, đừng để mặc định `./data` (ghi đè DB thật của
worktree); `server/config.js` đọc biến `DATA_DIR` (không phải `GENSTUDIO_DATA_DIR`).

Mã thoát: `0` khi không có lỗi (hoặc có `--allow-errors`); `1` khi `report.errors` không rỗng (file hỏng, ghi
DB lỗi, SVG bên thứ ba bị từ chối…) — để script/CI gọi lệnh biết mà dừng lại thay vì âm thầm bỏ qua.

## Ánh xạ file → mã ô · File → slot mapping (`server/kit-map.js`)

Theo thứ tự:

1. **OVERRIDES** — ánh xạ tay theo `(mã phiếu MR, tên file)` cho hàng đã nộp với tên tự do (MUSE.md §3 không ép
   tên theo mã ô). Hiện có: MR-044 (Nhi · thiết kế 3D gốc → `nhi.id.01`), MR-045 (Nhi · bảng xoay →
   `nhi.id.02..05`), MR-046 (Vy · thiết kế 3D gốc → `vy.id.01`), MR-047 (Vy · bảng xoay → `vy.id.02..05`),
   MR-052 (Ryan · toàn thân 3D → `ryan.id.01`), MR-053 (Ryan · bảng xoay → `ryan.id.02..05`) — mọi phiếu "bảng
   xoay" đều có file sheet tổng hợp `*-turnaround-sheet-3840x2160.png` cố ý **không** gắn ô (chỉ là ảnh preview
   4-góc-trong-một, không phải một ô riêng).
2. **`<subject>-00-base.ext`** (MR-063 bước 1): ảnh gốc dùng để sửa-ra các biểu cảm bằng image-to-image, cố ý
   **không** gắn ô (mã ô bắt đầu từ `01`, không có `.00`).
3. **Mẫu tên số** `<subject>-<NN>-<slug>.<png|jpg|jpeg|webp>` ⇒ `fx-NN-*` thử `fx.manpu.<NN>`; còn lại thử
   `<subject>.expr.<NN>` rồi `<subject>.pose.<NN>` (ví dụ `nhi-21-sulking.png` ⇒ `nhi.expr.21`). Đây là mẫu tên
   khuyến nghị cho lô Muse **sau này** nộp thẳng theo ô (xem `library/requests/MR-063-nhi-bieu-cam-v2.md` —
   ticket đang `todo` dùng đúng mẫu này, vd `nhi-00-base.png`, `nhi-07-laughing.png`) **và** cho hàng về từ
   Drive trên VPS (`/opt/gen-studio/data/inbox/drive/03_Hoan-thanh/<MR>/nhi-NN-slug.png` v.v. — dùng
   `--source` để trỏ thẳng vào thư mục đó).

Không khớp cả ba ⇒ **không ánh xạ được** — vẫn `asset.put` (tạo asset trong kho) **nhưng không tạo lần nộp**
(không có `kit_slot` để gắn vào, Gen/Ryan gắn tay sau qua `asset.meta`/`slot.assign`), báo rõ lý do trong báo
cáo cuối lệnh (không đoán mò). Lưu ý: `MR-048/050/054` (bộ 12 biểu cảm cũ, tên `nhi-expr-NN-slug.png`) **cố ý**
không tự ánh xạ theo số thứ tự dù tên gần giống mẫu trên — nội dung/thứ tự của bộ cũ KHÔNG khớp bảng 40 biểu
cảm chính thức của `nhi.expr.*` (ví dụ `nhi-expr-02-explaining.png` ≠ `nhi.expr.02` = "Khẩu hình a") nên map
theo số sẽ SAI; cần người xem lại nội dung rồi thêm override tay nếu muốn giữ, hoặc chờ lô v2
(`MR-063/065/066`) thay thế.

## Nguồn không có `meta.json` · `--source` without `meta.json`

Thư mục `--source` (vd Drive) có thể chưa có `meta.json` theo lược đồ `library/inbox/meta.schema.json`. Khi
thiếu, `cli/import-kit.js` tự dựng danh sách file từ phần mở rộng nhận diện được (`png/jpg/jpeg/webp/gif/svg/
wav/mp3/mp4`, vai trò mặc định `main`, chất lượng mặc định `A`) — **không chạy máy kiểm gói E** cho các file
này (thiếu `self_check`/role đáng tin để biết file nào là bản chính) và ghi nhận `quality='A'` không qua kiểm.

## Quyết định đã duyệt · Decisions already made

Theo `HANDOFF-LOCAL.md` §4 mục C (Ryan 31/10/2026), mã hoá trong `DECISIONS` ở `cli/import-kit.js`:

| MR | Trạng thái ghi vào `asset_submissions.state` |
|---|---|
| MR-044, MR-046, MR-052 | `approved` (`decision_kind='owner'`, `decided_actor='ryan'`) |
| MR-047 | `submitted` + một đề xuất `SG-` (`submission.propose`) cho Ryan xác nhận |
| Mọi MR khác có hàng trong inbox | `submitted` (chờ kiểm, chưa có quyết định) |

Gói C **không** có `submission.approve/reject` (thuộc pipeline Muse đầy đủ, gói khác). Thứ tự ghi cho một file
**có ô**: `submission.import` tạo hàng ở `submitted` → `submission.record_checks` (ghi kiểm **trong khi còn
`submitted`** — op này chặn ghi khi submission không còn `submitted`) → nếu quyết định là `approved`,
`submission.set_state` nâng trạng thái sau cùng, kèm `decision_reason`.

**"Approved" không có nghĩa là đã certify.** Ryan chốt duyệt các phiếu này theo mắt thật (HANDOFF-LOCAL.md),
**không phải** theo kết quả máy kiểm — máy kiểm vẫn chạy và ghi vào `asset_checks`/`decision_reason` như bình
thường. Nếu còn tiêu chí M `fail` lúc nhập, `decision_reason` ghi rõ cảnh báo và lệnh **in một khối CẢNH BÁO
riêng ở cuối** liệt kê từng file/ô còn fail — kho vẫn ở trạng thái "approved" (Ryan đã duyệt) nhưng **chưa
certify được** (`kit.certify` sẽ chặn cho tới khi làm lại hoặc Ryan `check.waive` từng tiêu chí).

## Chống trùng khi chạy lại · Re-run idempotency

- Asset: `asset.put` khoá theo `sha256` — file giống hệt ⇒ `deduped:true`, không tạo hàng mới. Áp dụng cho
  **mọi** file quét được, kể cả file không ánh xạ được ô.
- Mô tả (`asset.meta`): chỉ `UPDATE` cột nào thực sự khác giá trị cũ; khớp sẵn ⇒ `changed:false`.
- Lần nộp (`submission.import`): khoá theo cặp `(asset_id, kit_slot)` — đã có lần nộp cho đúng cặp này (ở bất
  kỳ trạng thái nào) thì bỏ qua, không tạo thêm, không chạy lại máy kiểm, không gọi `submission.set_state`
  lần nữa (không có đường "nộp lại" ở gói C).

## `data/kit-status.json`

Sau khi ghi thật (không `--dry-run`), lệnh xuất `data/kit-status.json`:

```json
{
  "generated_at": "2026-10-31T12:00:00.000Z",
  "slots": {
    "nhi.id.01": { "asset_id": "AS-0003", "state": "approved", "checks_level": "fail" },
    "nhi.id.02": null
  }
}
```

`slots[code]` là `null` khi ô chưa có hàng, hoặc `{asset_id, state, checks_level}` của lần nộp **ưu tiên
`approved` gần nhất**, lọc đúng `workspace_id` (nếu không có lần nộp nào `approved`, lấy asset mới nhất gắn ô
đó). `checks_level` nay phản ánh đúng kết quả máy kiểm cuối cùng (`ok`/`warn`/`fail`) vì kiểm được ghi khi
submission còn `submitted` (xem mục "Quyết định đã duyệt").

**TODO (chưa làm ở gói C):** file này **chưa nối** với script sổ phiếu `deploy/gcp/tickets-sheet.py` trên VM
— script đó hiện đọc nguồn khác. Việc đọc `data/kit-status.json` để đồng bộ Google Sheet để lại cho gói F/Sheet
(không gọi Google Sheet API ở gói này).

## Giới hạn đã biết · Known limitations (gói C, 0.3.0)

- `library/catalog.json` chỉ nhập được các `type` có `kind` tương ứng trong `assets.kind`
  (`character-still/illustration/background`→`image`/`svg`, `character-clip/broll`→`video`, `sfx/music`→
  `audio`); `icon-set`/`font`/`lottie`/`motion-template` (tập nhiều tệp hoặc `kind` chưa có trong gói C) bị
  bỏ qua, báo trong "File không ánh xạ được".
- SVG của bên thứ ba không qua được allowlist `svgOk` (`server/write.js`, chặn `<use>`/`<style>`/thực thể…)
  bị từ chối — ghi vào mục "Lỗi" của báo cáo (exit 1 trừ khi `--allow-errors`), không làm hỏng cả lượt nhập.
- Ánh xạ file → ô chỉ theo **tên file**, không đọc nội dung ảnh — vì vậy cố ý hẹp (xem mục MR-048/050/054 ở
  trên) thay vì đoán sai.
- `--source` chưa có `meta.json` ⇒ không chạy máy kiểm gói E cho nhóm file đó (xem mục riêng ở trên).
