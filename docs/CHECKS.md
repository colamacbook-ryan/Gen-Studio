# Máy kiểm thường trực Bộ Neo · Standing Kit Checker

VI: Module `server/checks/` đo tự động các tiêu chí **M** (máy kiểm được) của `STANDARD-KIT-v1.md` trên một
tệp asset đơn lẻ, không cần DB (gói A nối bảng `asset_checks` sau — 0.3.0+). Dùng qua CLI
`genstudio check <file> --slot <mã ô>` hoặc hàm `runChecks(filePath, slotCode, opts)`.

EN: `server/checks/` auto-measures the **M** (machine-checkable) criteria of `STANDARD-KIT-v1.md` for a
single asset file, no DB required (package A wires `asset_checks` later — 0.3.0+). Use via CLI
`genstudio check <file> --slot <slot code>` or `runChecks(filePath, slotCode, opts)`.

## Bảng tiêu chí → hàm · Criteria → function map

| Mã · Code | Tiêu chí (VI) | Criterion (EN) | Hàm · Function |
|---|---|---|---|
| GEN-FMT | Đúng định dạng khai (magic bytes) | Declared format matches content (magic bytes) | `magic.sniff()` |
| GEN-SPEC | Mã ô đúng ngữ pháp Bộ Neo | Slot code matches Bộ Neo grammar | `index.classify()` |
| CH-01 / PR-01 / FX-01 | Kích thước đúng + không đệm mép (>4px) | Exact size + no edge padding band (>4px) | `geom.sizePad()` |
| CH-02 | Nền 4 góc 64×64 đúng màu #00B140 | 4×64×64 corners match #00B140 | `geom.cornerColor()` |
| CH-03 / PR-02 / FX-02 | Không lẫn màu nền vào nhân vật/vật/ký hiệu | No bg color bleeding into subject | `geom.chromaBleed()` |
| CH-04 | Khoá khung biểu cảm so với `.expr.00` | Expression frame-lock vs `.expr.00` | `geom.overlayDiff()` — **M\*** (chưa có dò mốc mặt ⇒ `pass:null` luôn, chỉ so chồng mờ tham khảo cho Ryan) |
| CH-05 | Vai chạm hai mép (expr) | Shoulders touch both edges (expr) | `geom.shouldersTouchEdges()` |
| CH-07 | Chân chạm đường đất (pose) | Feet on ground line (pose) | `geom.feetTouchGround()` |
| SC-01 | Kích thước bối cảnh 3840×2160 | Scene size 3840×2160 | `geom.sizePad()` |
| SC-02 | Tiền cảnh RGBA ≥50% trong suốt | Foreground RGBA ≥50% transparent | `geom.alphaRatio()` |
| AU-01 | WAV 48 kHz / 24-bit | WAV 48 kHz / 24-bit | `audio.formatOk()` |
| AU-02 | Đỉnh true peak ≤ −1 dBFS | True peak ≤ −1 dBFS | `audio.loudnessChecks()` (ebur128, `media/mix.js`) |
| AU-03 | Độ to −16 LUFS ± 1 | Loudness −16 LUFS ± 1 | `audio.loudnessChecks()` |
| AU-04 | SFX không lặng đầu > 50 ms | SFX no lead silence > 50 ms | `audio.noLeadSilence()` (ffmpeg silencedetect) |
| UI-01 | SVG ≤ 2 MB qua `svgOk` | SVG ≤ 2 MB via `svgOk` | `svg.svgOk()` |
| UI-02 | Chữ là `<text>`, dùng font trong `font.*` | Text is `<text>`, uses a `font.*` font | **M, chưa cài máy đo** · **M, not implemented yet** — `pass:null` ("missing") |
| MO-01 | Lottie ≤ 5 MB, không expression/URL ngoài | Lottie ≤ 5 MB, no expression/external URL | `lottie.lottieOk()` |
| MO-02 | Thời lượng theo loại mẫu (0,4–1,0s chuyển cảnh / ≤1,2s tiêu đề) | Duration by template type | **M, chưa cài máy đo** · **M, not implemented yet** — `pass:null` ("missing") |
| MO-03 | Ô chữ sửa được + tiếng Việt đủ dấu | Editable text fields + full Vietnamese diacritics | **M + H, phần M chưa cài máy đo** · **M + H, M part not implemented yet** — `pass:null` ("missing") |

Mọi hàng ghi **"chưa cài máy đo"** trả một mục `checks[]` có `code` đúng (UI-02/MO-02/MO-03), `level:'M'`
(hoặc `'M + H'`), `pass:null`, `measured:{missing:true}` — **không** gắn nhãn H và **không** bị bỏ sót âm thầm:
`pass:null` khiến `verdict` không thể là `'pass'` (xem §Verdict).

## Chưa phủ (vì sao) · Not covered (why)

- **CH-06** (khẩu hình chỉ khác miệng), **CH-08** (cùng tỉ lệ so với `.id.01`): cần toạ độ hộp miệng/đầu chưa
  có trong spec máy kiểm hiện hành — để làm cùng đợt với CH-04 khi có dò mốc mặt thật (spike riêng).
- **UI-02, MO-02, MO-03** (xem bảng trên): là tiêu chí **M** (MO-03 nửa M) — không phải H; `pass:null`
  ("missing") thay vì gắn nhãn H sai mức (sửa theo review PR #32 mục 6).
- **FO-02…04** (phủ tiếng Việt, giấy phép, đọc tốt ở cỡ nhỏ): nằm ngoài danh sách tiêu chí máy kiểm được
  brief 0.3.0 gói E liệt kê rõ; `magic.js` đã nhận diện đúng định dạng font (woff2/ttf/otf) cho **FO-01**.
- Mọi tiêu chí mức **H** thật sự (CH-09…11, SC-03…05, PR-03/04, FX-03/04, UI-03, AU-05…07, MO-04, FO-04): cần
  mắt/tai Ryan theo định nghĩa của STANDARD-KIT-v1.md — không tự động hoá.

## pass: true / false / null

- `true` — đạt. `false` — trượt (chỉ mức **M** `false` mới chặn `verdict:'rework'`).
- `null` — **chưa đo chắc chắn**: hoặc tiêu chí **M chưa cài máy đo** (UI-02/MO-02/MO-03, `measured.missing:true`),
  hoặc tiêu chí **M\*/H có số đo tham khảo nhưng không tự kết luận** (CH-04 — so chồng mờ, cần Ryan xác nhận).
  `pass:null` ở BẤT KỲ mức nào đều khiến `verdict` không thể là `'pass'` im lặng.

## Verdict

`runChecks()` trả `verdict`:
- `pass` — mọi tiêu chí đều `pass:true` (không còn `false` lẫn `null`).
- `rework` — có tiêu chí **M** `pass:false` (Gen tự trả về làm lại theo INTENT INT-GK-04, nối ở gói A).
- `review` — hết tiêu chí M `false`, nhưng còn tiêu chí `pass:null` (chưa đo hoặc chỉ tham khảo) chờ Ryan.

## Dùng thử · Try it

```sh
genstudio check library/inbox/MR-063/nhi.expr.08.png --slot nhi.expr.08
genstudio check out.wav --slot audio.sfx.whoosh.01 --json
```
