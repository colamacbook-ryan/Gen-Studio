# Thư viện tài nguyên video (asset-lib) v1

> Hướng Ryan chốt 2026-10-30: **làm tài nguyên một lần, dùng lại nhiều lần**; ưu tiên miễn phí nhưng **chất lượng là trên hết**.
> Mỗi clip sau ghép từ thư viện này bằng Remotion, chi phí tài nguyên ≈ 0 đồng.

## 1. Danh mục là nguồn sự thật duy nhất
> Ryan: «gom cái xịn, đừng gom rác». **A = core** (đạt chuẩn showcase, kết quả mặc định khi tìm) · **B = reserve** (dùng được khi thiếu, bắt buộc tag `tier=reserve`) · **C = loại**, không ghi vào danh mục.

- `catalog.json` — **do máy sinh**, đừng sửa tay. Mỗi tài nguyên một mục: `id`, `type`, `title`, `tags`, `energy` (light/medium/heavy theo STD-17), `phase`, `path`/`url`, thời lượng/kích thước, `source`, `source_url`, `license`, `attribution`, `commercial_ok`, `quality` (A/B), `added`, `cost_usd`, `stored`, `how_made`, `reuse`.
- Lược đồ: `catalog.schema.json`. Mỗi mảng (area) ghi mục của mình vào `catalog.d/<area>.json` (một mảng JSON). `tools/build-catalog.mjs` gộp + kiểm tất cả → `catalog.json`.

| Mảng | File | Người lo |
|---|---|---|
| Nhân vật (ảnh + clip) | `catalog.d/characters.json` ← `node characters/src/catalog-entries.mjs` | agent nhân vật/motion |
| Motion-kit | `catalog.d/motion-kit.json` ← `node motion-kit/tools/catalog-entries.mjs` | agent nhân vật/motion |
| Âm thanh | `catalog.d/audio.json` | agent âm thanh |
| Hình ảnh, font | `catalog.d/visual.json`, `catalog.d/fonts.json` | agent hình ảnh |

### Tìm
```bash
node tools/find.mjs sfx whoosh energy=heavy          # loại + từ khoá + điều kiện
node tools/find.mjs character-still vy shock          # ảnh Vy sốc
node tools/find.mjs char clip                         # mọi clip nhân vật
node tools/find.mjs music phase=climax --paths        # chỉ in đường dẫn
node tools/find.mjs license=CC-BY-4.0 --json          # mọi thứ cần ghi công
```
**Mặc định chỉ hiện hạng A (tier core).** Thêm `tier=reserve` để xem hàng dự phòng (B), `tier=all` để xem hết.
Từ khoá so khớp với id/tiêu đề/tags/ghi chú, **không phân biệt dấu** (`soc` khớp `sốc`). `trường=giá trị` khớp đúng; trường mảng (tags, energy, phase) khớp nếu có chứa giá trị.

### Thêm
```bash
node tools/add.mjs audio '{"id":"sfx.kenney.click-001", "type":"sfx", ...}'   # hoặc đường dẫn tới file .json
node tools/add.mjs audio entry.json --dry-run        # chỉ kiểm
node tools/build-catalog.mjs                          # gộp lại toàn bộ (exit 1 nếu có mục sai)
```
`add.mjs` từ chối khi: thiếu trường bắt buộc · giấy phép ngoài danh sách trắng · CC-BY mà thiếu `attribution` · tài nguyên bên thứ ba thiếu `source_url` · `quality` = C (rác — không đưa vào) · `quality` = B mà thiếu tag `tier=reserve` · A mà lại gắn `tier=reserve` · file không tồn tại · `stored: git` mà file > 5 MB · trùng `id`. Tự điền `size_bytes`, `added`.

**Danh sách trắng giấy phép** (chỉ loại cho phép dùng thương mại): Gen-Labs-proprietary, CC0-1.0, CC-BY-4.0/3.0 (phải ghi công), OFL-1.1, MIT, ISC, Apache-2.0, Mixkit (SFX/Music/Video Free), Pixabay Content, Pexels, Lottie Simple License, unDraw, đầu ra model (Veo-Output, Google-Gemini-Output). **Cấm**: NC, ND, "chỉ dùng cá nhân", giấy phép mù mờ, Envato. Trường `redistribution`: `no-standalone` = chỉ dùng **bên trong video của mình**, không được đóng gói file gốc để bán (Mixkit, unDraw).

### Lưu trữ
- File ≤ 5 MB → vào git (`stored: "git"`, đường dẫn tương đối từ `asset-lib/`).
- File > 5 MB → để ở `/tmp/claude-0/-home-user/bba20ac0-16bf-5912-8dd5-4d08b20490c6/scratchpad/alib-large/` (`stored: "local-scratch"`, đường dẫn tuyệt đối, `note` bắt buộc). Sẽ chuyển lên kho cloud sau. ⚠️ Thư mục scratch mất khi phiên kết thúc — dựng lại bằng lệnh trong `how_made`.
- Mục tiêu cả thư viện trong git < ~150 MB.

## 2. Cấu trúc
```
asset-lib/
├─ catalog.schema.json · catalog.json · catalog.d/*.json · tools/{catalog-lib,build-catalog,find,add}.mjs
├─ characters/{nhi,vy}/stills/   16 mood PNG trong suốt + khung chroma 1280×720   (src/export.js, src/crop.py)
├─ characters/vy/clips/           clip Veo khâu nối được (.mp4 nền xanh, .webm có alpha)
├─ loop-test/                     thử khâu nối: src/veo.mjs (gọi API), src/loop.sh (tách nền + nối), số đo + dải khung
├─ audio/{sfx,music}/             (agent âm thanh) — synth/ và procedural/ là bản tự tổng hợp dự phòng
├─ visual/{icons,lottie,illustrations,backgrounds,broll}/, fonts/   (agent hình ảnh)
└─ motion-kit/                    dự án Remotion: khối dùng lại + showcase
```

## 3. Nhân vật — `characters/`
- **Nhi** (teal, kính, hai búi) và **Vy** (san hô, đuôi ngựa + nơ vàng), mỗi người **16 mood**: neutral, explain, excited, shock, think, unsure, smug, sad, angry, panic, greedy, beg, proud, vow, bored, yell. PNG nền trong suốt, Nhi 1252×1491, Vy 1543×1572 (khung chung cho cả 16 mood ⇒ đổi mood không nhảy cỡ). Dựng bằng engine Gen-Chibi 0.26 của gen-studio, 0 đồng.
- `*-neutral-chroma-1280x720.png`: tư thế trung tính trên nền **#00B140** — khung đầu = khung cuối cho AI video.
- Dựng lại: `node characters/src/export.js && python3 characters/src/crop.py && node characters/src/catalog-entries.mjs`.
- Dùng: `charSrc('vy','shock')` trong motion-kit, hoặc `<Img src={staticFile('characters/vy-shock.png')}/>`.

## 4. Thử khâu nối (seamless loop) — **kỹ thuật dùng được**
- Veo 3.1 Lite qua OpenRouter, 720p, 4 s, không tiếng, `first_frame = last_frame = vy-neutral-chroma`. 2 clip: **vẫy tay** (A) và **giật mình** (B). Mỗi clip **0,12 USD**, ~55 s chờ. Tổng **0,24 USD**.
- Khung đầu/cuối gần trùng ảnh gốc (sai khác TB 1,35–1,47/255); khung cuối ↔ khung đầu chỉ lệch 1,17–1,25/255 (nhiễu nén ở viền).
- Tách nền `chromakey=0x01B141:similarity=0.13:blend=0.05` — sạch viền nhờ viền trắng kiểu sticker. **Không dùng despill**: nó làm nơ vàng ngả cam.
- Nối 3 lần (cắt thẳng, bỏ khung cuối mỗi clip): bước nhảy lớn nhất ở mối nối 0,64–0,77/255, **thấp hơn** chuyển động trung bình giữa hai khung (1,40–1,50) ⇒ mắt không thấy giật. Xem `loop-test/join-strip.png`, `loop-test/seam-metrics.json`, `loop-test/loop-mix-wave-shock-wave.mp4` (vẫy → sốc → vẫy).
- Hạn chế: clip «sốc» có đoạn mắt đổi sang kiểu chấm (lệch model sheet); tay vẫy có nhoè. Veo nhận diện nhân vật tốt, giữ đúng nét viền.
- Gọi lại: `node loop-test/src/veo.mjs <ảnh chroma> <ra.mp4> "<prompt>"` (khoá đọc từ `~/.config/gen/openrouter.key`, không in ra; ghi chi phí vào `<ra>.json`).

## 5. Motion-kit — `motion-kit/`
Xem `motion-kit/README.md`. Tóm tắt: 10 khối (KineticTitle light/medium/heavy, LowerThird, ChatBubble, CursorClick, Stamp, ChecklistReveal, CompareTwo, BigNumberCount, Quiz, EndCard), 4 chuyển cảnh (crossfade, whip, zoom-through, light-leak), camera rig có thị sai, `intensity.ts` (preset STD-17 + `checkBudget`), nền có chiều sâu. Showcase 41 s 1080p60 dựng bằng `npm run showcase` (xem nhanh: `motion-kit/showcase-preview-720p.mp4`, `motion-kit/showcase-strip.jpg`).

## 6. Âm thanh tự tổng hợp (dự phòng, đã bàn giao cho agent âm thanh)
- `audio/sfx/synth/`: 21 SFX tổng hợp bằng code (`node src/synth-sfx.mjs`), WAV 48 kHz, đỉnh −1 dBFS, RMS ≤ −14 dBFS. Chưa nghe bằng tai người — chỉ kiểm phổ + mức.
- `audio/music/procedural/`: 4 nền 30 s lặp liền (FLAC). **Placeholder**: nghe ra kiểu "nhạc tổng hợp", đúng hoà âm/nhịp nhưng thiếu chất nhạc cụ thật. Đường nâng cấp miễn phí + thương mại: **ACE-Step 1.5 (MIT)** trên GPU Kaggle/HF (máy này bị chặn chạy mã ngoài) hoặc nhạc CC-BY của Kevin MacLeod.
- MusicGen **không** dùng (trọng số CC-BY-NC).

## 7. Chi phí
| Mục | USD |
|---|---|
| 2 clip Veo 3.1 Lite (vẫy, sốc) | 0,24 |
| Mọi thứ khác (nhân vật, motion-kit, synth) | 0 |
