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
| CH-04 | Khoá khung biểu cảm so với `.expr.00` | Expression frame-lock vs `.expr.00` | `geom.overlayDiff()` — **M\*** (tạm mức **H**: chưa có dò mốc mặt, chỉ so chồng mờ tham khảo) |
| CH-05 | Vai chạm hai mép (expr) | Shoulders touch both edges (expr) | `geom.shouldersTouchEdges()` |
| CH-07 | Chân chạm đường đất (pose) | Feet on ground line (pose) | `geom.feetTouchGround()` |
| SC-01 | Kích thước bối cảnh 3840×2160 | Scene size 3840×2160 | `geom.sizePad()` |
| SC-02 | Tiền cảnh RGBA ≥50% trong suốt | Foreground RGBA ≥50% transparent | `geom.alphaRatio()` |
| AU-01 | WAV 48 kHz / 24-bit | WAV 48 kHz / 24-bit | `audio.formatOk()` |
| AU-02 | Đỉnh true peak ≤ −1 dBFS | True peak ≤ −1 dBFS | `audio.loudnessChecks()` (ebur128, `media/mix.js`) |
| AU-03 | Độ to −16 LUFS ± 1 | Loudness −16 LUFS ± 1 | `audio.loudnessChecks()` |
| AU-04 | SFX không lặng đầu > 50 ms | SFX no lead silence > 50 ms | `audio.noLeadSilence()` (ffmpeg silencedetect) |
| UI-01 | SVG ≤ 2 MB qua `svgOk` | SVG ≤ 2 MB via `svgOk` | `svg.svgOk()` |
| MO-01 | Lottie ≤ 5 MB, không expression/URL ngoài | Lottie ≤ 5 MB, no expression/external URL | `lottie.lottieOk()` |

## Chưa phủ (vì sao) · Not covered (why)

- **CH-06** (khẩu hình chỉ khác miệng), **CH-08** (cùng tỉ lệ so với `.id.01`): cần toạ độ hộp miệng/đầu chưa
  có trong spec máy kiểm hiện hành — để làm cùng đợt với CH-04 khi có dò mốc mặt thật (spike riêng).
- **FO-02…04** (phủ tiếng Việt, giấy phép, đọc tốt ở cỡ nhỏ): nằm ngoài danh sách tiêu chí máy kiểm được
  brief 0.3.0 gói E liệt kê rõ; `magic.js` đã nhận diện đúng định dạng font (woff2/ttf/otf) cho **FO-01**.
- Mọi tiêu chí mức **H** (CH-09…11, SC-03…05, PR-03/04, FX-03/04, UI-02/03, AU-05…07, MO-02…04, FO-04): cần
  mắt/tai Ryan theo định nghĩa của STANDARD-KIT-v1.md — không tự động hoá.

## Verdict

`runChecks()` trả `verdict`:
- `pass` — mọi tiêu chí M đạt.
- `rework` — có tiêu chí M trượt (Gen tự trả về làm lại theo INTENT INT-GK-04, nối ở gói A).
- `review` — mọi tiêu chí M đạt, còn tiêu chí H/M\* chờ Ryan xác nhận.

## Dùng thử · Try it

```sh
genstudio check library/inbox/MR-063/nhi.expr.08.png --slot nhi.expr.08
genstudio check out.wav --slot audio.sfx.whoosh.01 --json
```
