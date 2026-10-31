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
DB lỗi, magic bytes audio/video sai…) — để script/CI gọi lệnh biết mà dừng lại thay vì âm thầm bỏ qua; `2` khi
cờ `--only`/`--source` thiếu giá trị (lỗi cách dùng, in usage, không chạm DB). SVG bên thứ ba bị `svgOk` từ
chối **không** phải lỗi (nguồn ngoài, không sửa được) — vào `report.skipped`, không tính vào exit code.

## Ánh xạ file → mã ô · File → slot mapping (`server/kit-map.js`)

Theo thứ tự:

1. **OVERRIDES** — ánh xạ tay theo `(mã phiếu MR, tên file)` cho hàng đã nộp với tên tự do (MUSE.md §3 không ép
   tên theo mã ô). Hiện có: MR-044 (Nhi · thiết kế 3D gốc → `nhi.id.01`), MR-045 (Nhi · bảng xoay →
   `nhi.id.02..05`), MR-046 (Vy · thiết kế 3D gốc → `vy.id.01`), MR-047 (Vy · bảng xoay → `vy.id.02..05`),
   MR-052 (Ryan · toàn thân 3D → `ryan.id.01`), MR-053 (Ryan · bảng xoay → `ryan.id.02..05`) — mọi phiếu "bảng
   xoay" đều có file sheet tổng hợp `*-turnaround-sheet-3840x2160.png` cố ý **không** gắn ô (chỉ là ảnh preview
   4-góc-trong-một, không phải một ô riêng).
2. **Tên file CHUẨN = đúng mã ô** (`docs/MUSE-CONNECT.md`, vd `nhi.expr.08.png`, `fx.manpu.03.png`,
   `audio.sfx.pop.03.wav`) — MỘT quy ước cho hàng Muse nộp mới, khớp trực tiếp nếu mã đó có trong
   `seed/kit-slots.json`.
3. **`<subject>-00-base.ext`** (MR-063 bước 1): ảnh gốc dùng để sửa-ra các biểu cảm bằng image-to-image, cố ý
   **không** gắn ô (mã ô bắt đầu từ `01`, không có `.00`).
4. **Mẫu tên số CŨ** `<subject>-<NN>-<slug>.<png|jpg|jpeg|webp>` ⇒ `fx-NN-*` thử `fx.manpu.<NN>`; còn lại thử
   `<subject>.expr.<NN>` rồi `<subject>.pose.<NN>` (ví dụ `nhi-21-sulking.png` ⇒ `nhi.expr.21`) — GIỮ TƯƠNG
   THÍCH cho hàng đã nộp trước khi chốt quy ước §2 (xem `library/requests/MR-063-nhi-bieu-cam-v2.md`, vẫn dùng
   mẫu cũ) **và** hàng về từ Drive trên VPS đã nộp theo mẫu cũ
   (`/opt/gen-studio/data/inbox/drive/03_Hoan-thanh/<MR>/nhi-NN-slug.png` — dùng `--source` để trỏ thẳng vào
   thư mục đó; hàng Drive nộp đúng quy ước mới ở mục §2 cũng khớp được).

Không khớp cả bốn ⇒ **không ánh xạ được** — vẫn `asset.put` (tạo asset trong kho) **nhưng không tạo lần nộp**
(không có `kit_slot` để gắn vào, Gen/Ryan gắn tay sau qua `asset.meta`/`slot.assign`), báo rõ lý do trong báo
cáo cuối lệnh (không đoán mò). Lưu ý: `MR-048/050/054` (bộ 12 biểu cảm cũ, tên `nhi-expr-NN-slug.png`) **cố ý**
không tự ánh xạ theo số thứ tự dù tên gần giống mẫu trên — nội dung/thứ tự của bộ cũ KHÔNG khớp bảng 40 biểu
cảm chính thức của `nhi.expr.*` (ví dụ `nhi-expr-02-explaining.png` ≠ `nhi.expr.02` = "Khẩu hình a") nên map
theo số sẽ SAI; cần người xem lại nội dung rồi thêm override tay nếu muốn giữ, hoặc chờ lô v2
(`MR-063/065/066`) thay thế.

## Nguồn không có `meta.json` · `--source` without `meta.json`

Thư mục `--source` (vd Drive) có thể chưa có `meta.json` theo lược đồ `library/inbox/meta.schema.json`. Khi
thiếu, `cli/import-kit.js` tự dựng danh sách file từ phần mở rộng nhận diện được (`png/jpg/jpeg/webp/gif/svg/
wav/mp3/ogg/mp4/webm`, vai trò mặc định `main`, chất lượng khai mặc định `A` — chỉ vào `quality_claimed`, xem
dưới). Gói C.2 (Gen, bổ sung cổng — sửa cortex CNS-M1-10): máy kiểm gói E **vẫn chạy** cho nhóm file này như
mọi nhánh khác (trước đây bỏ qua hẳn, khiến "chưa kiểm" và "kiểm đạt" trông giống nhau trên màn hàng chờ).

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

Sau khi ghi thật (không `--dry-run`), lệnh xuất `data/kit-status.json` — **MỘT công thức duy nhất**, đọc thẳng
từ view `v_kit_coverage` (migrations/0011, DB-GK-0.1 §13, STANDARD-KIT-v1 §5), không tự tính lại:

```json
{
  "generated_at": "2026-10-31T12:00:00.000Z",
  "slots": {
    "nhi.id.01": { "asset_id": "AS-0003", "state": "thiếu", "checks_level": "fail" },
    "nhi.id.02": null
  }
}
```

`slots[code]` là `null` khi ô chưa có asset nào, hoặc `{asset_id, state, checks_level}` — `state` ∈ `đạt` /
`cần kiểm lại` / `cờ lỗi` / `chờ duyệt` / `đang làm` / `thiếu` (bảng ưu tiên STANDARD-KIT-v1 §5); `asset_id` là
asset **tham khảo** (ưu tiên asset đã chứng nhận nếu có, không thì asset mới nhất gắn ô — Ryan/Gen có đường
vào xếp hạng/chứng nhận, **không** quyết định `state`). **Nhập kho "approved" KHÔNG tự ra `state: "đạt"`** —
`assets.quality` vẫn `NULL` sau nhập (xem mục dưới), điều 1 của STANDARD §5 chưa thoả cho tới khi Ryan xếp
hạng + `kit.certify`; đây là hành vi ĐÚNG theo định nghĩa, không phải thiếu sót.

`deploy/gcp/tickets-sheet.py sync` đọc file này qua env `GS_KIT_STATUS` (mặc định
`/opt/gen-studio/data/kit-status.json`) để chuyển dòng "Chờ kiểm" trên Sheet Muse sang "Đạt"/"Làm lại" theo
`state` — **không hạ** dòng đã "Đạt" (Ryan đặt tay); file thiếu/hỏng thì bỏ qua êm, phần đối chiếu file Drive
cũ của `sync` vẫn chạy bình thường. Tự động hoá phần nhập kho: `deploy/gcp/import-setup.sh` (`gs-import.timer`,
10 phút/lần) — xem `docs/OPS.md` §8.

## Hạng Muse tự khai · `quality_claimed`

**Không tự gán `assets.quality='A'`** từ khai báo của Muse (`meta.json.quality`, cortex CNS-M1-07) — nhánh
nhập hàng Muse (inbox) để `assets.quality` **NULL** sau nhập, lưu hạng tự khai vào
`asset_submissions.quality_claimed` (`A`/`B`). Ryan xếp hạng thật (`assets.quality`) khi duyệt qua
`asset.meta`/chứng nhận ô (`kit.certify`). Nhánh `catalog.json` (dữ liệu đã kiểm sẵn trong repo, không phải tự
khai của agent) giữ nguyên — `quality` lấy thẳng từ cột `quality` của mục catalog.

## Quyền dùng · `asset_rights`

Mọi asset nhập kho đều được ghi một hàng `asset_rights` (op mới `asset.attest_import`, idempotent theo asset —
cortex CNS-M1-18: thiếu bước này thì điều 2 "quyền hiệu lực" của STANDARD §5 không bao giờ thoả, % đầy đủ đứng
ở 0 vĩnh viễn và `rights.js` chặn render `rights_missing`). Nhánh Muse (inbox): `basis='licensed'`, ghi chú
`Meta-Muse-Output · <mã phiếu> · chờ điều khoản Meta`. Nhánh catalog: `basis='own_product'` cho
`source_kind='in-house'` (Gen-Labs-proprietary/Veo-Output/Google-Gemini-Output), `basis='licensed'` cho
`muse`/`external` (license ngoài), ghi chú = license + nguồn.

## Giới hạn đã biết · Known limitations (gói C, 0.3.0)

- `library/catalog.json` chỉ nhập được các `type` có `kind` tương ứng trong `assets.kind`
  (`character-still/illustration/background`→`image`/`svg`, `character-clip/broll`→`video`, `sfx/music`→
  `audio`); `icon-set`/`font`/`lottie`/`motion-template` (tập nhiều tệp hoặc `kind` chưa có trong gói C) bị
  bỏ qua, báo trong "File không ánh xạ được".
- SVG của bên thứ ba không qua được allowlist `svgOk` (`server/write.js`, chặn `<use>`/`<style>`/thực thể…)
  bị từ chối — ghi vào `report.skipped` (KHÔNG phải lỗi, không tính vào exit code), không làm hỏng cả lượt nhập.
- Audio/video khai sai nội dung (vd PNG đổi đuôi `.wav`) bị chặn bằng magic bytes TRƯỚC `asset.put` — vào
  `report.errors` (exit 1 trừ khi `--allow-errors`), không tạo asset giả danh.
- Ánh xạ file → ô chỉ theo **tên file**, không đọc nội dung ảnh — vì vậy cố ý hẹp (xem mục MR-048/050/054 ở
  trên) thay vì đoán sai.
- "Chống đụng ô" chỉ chặn khi ô đang có claim MCP **còn sống** (`kit.claim`); KHÔNG có UNIQUE ở DB ngăn nhiều
  asset cùng gắn một ô — đây là thiết kế cố ý (nhiều phương án cùng một ô, Ryan chọn khi certify, xem
  `server/kit-map.js` OVERRIDES).
