# motion-kit — khối chuyển động dùng lại (Remotion)

© 2026 Gen Labs. Remotion 4.0.539 + React 19, chạy offline: font Be Vietnam Pro + Lexend (SIL OFL 1.1) nằm ở `public/fonts`, Chromium headless chỉ định trong `remotion.config.ts`.

## Chạy
```bash
npm i                      # node_modules không commit
npm run sync               # chép nhân vật / SFX / nhạc / clip alpha từ ../ vào public/ (bản sao, không commit)
npm run dev                # Remotion Studio: mọi Demo-* + Showcase
npm run showcase           # render out/showcase.mp4 (1920×1080, 60 fps, ~41 s)
npx remotion bundle --out-dir build && bash tools/stills.sh Demo-Quiz /tmp/q.png 90 200 390   # kiểm bằng mắt
```
⚖️ Giấy phép Remotion: miễn phí cho cá nhân và công ty ≤ 3 người; lớn hơn cần **Remotion Company License** — kiểm trước khi bán.

## Khối (src/components) — mỗi khối có composition `Demo-<Tên>` trong `src/demos.tsx`
| Khối | Cấp | Dùng khi | Gọi |
|---|---|---|---|
| `KineticTitle` | light / medium / heavy | tiêu đề, câu then chốt. `*chữ*` = nhấn vàng, `\n` = xuống dòng | `<KineticTitle level="medium" text={"Mỗi clip sau\nchỉ tốn *0 đồng*"} start={10} exitAt={200}/>` |
| `LowerThird` | light | giới thiệu người nói | `<LowerThird name="Nhi" role="Người dẫn" who="nhi" mood="explain"/>` |
| `ChatBubble` | light | hội thoại Nhi ↔ Vy | `messages=[{who:'vy', text, at: 0.9}]` (giây) |
| `CursorClick` | light→medium | thao tác trên app | `buttons=[{label}]`, `clicks=[{target, at}]` |
| `Stamp` | **heavy** | cú climax duy nhất | `<Stamp text="0 ĐỒNG" start={…}/>`; đồng bộ rung/flash/SFX bằng `stampImpact(start,fps)` |
| `ChecklistReveal` | light→medium | các bước, danh sách | `items=[…] stepSec={0.7}` |
| `CompareTwo` | medium | cũ vs mới | `left/right={{title, items}} verdictSec` |
| `BigNumberCount` | medium | con số | `value={1250} label="…" durSec={1.8}` |
| `Quiz` | medium→heavy | câu đố + đếm ngược | `question options correct`; `quizTimes()` cho mốc tick/reveal |
| `EndCard` | light | CTA cuối | `title cta handle` |

Avatar trong LowerThird/ChatBubble tự cắt mặt từ ảnh mood (`FACE` trong `LowerThird.tsx`).

## Hạ tầng (src/kit, src/transitions)
- `intensity.ts` — `PRESETS[phase]` cho hook/setup/build/climax/breath/payoff/cta: `level`, `strength`, `enterSec`, `staggerSec`, easing, spring, `shotSec` (nhịp cắt), camera được phép, chuyển cảnh ưa dùng, mức nhạc, overshoot, travel, blur, shake, flash. `checkBudget(beats, sec)` cảnh báo: quá 1 heavy/climax, hai beat liền cùng một kiểu camera, climax không có breath theo sau.
- `Camera.tsx` — `<CameraRig keys shakes handheld>` + `<Depth z>`: z<1 nền (trôi chậm), z=1 chủ thể, z>1 tiền cảnh. Zoom nội suy theo log ⇒ push-in đều tốc.
- `Backdrop.tsx` — nền 4 mood (calm/warm/tense/bright) có 3 lớp thị sai, sàn lưới, bokeh; `Post` = vignette + hạt phim + flash + tint.
- `transitions/Scene.tsx` — `<Scene from dur enter exit>`: `crossfade` (0,6 s), `whip` (0,32 s, nhoè theo hướng bằng SVG filter + vệt sáng), `zoomThrough` (0,45 s, bay xuyên + tia), `lightLeak` (1 s, vệt sáng phim). Chồng hai Scene đúng bằng độ dài chuyển cảnh.

## Showcase (src/showcase/Showcase.tsx) = khuôn cho clip mới
Beat sheet `B[]` + camera `CAM[]` + cue sheet âm thanh `SFX[]`/`BEDS[]`. Đường cong: Hook (M) 0–3,6 s → Setup (L) có clip AI Vy vẫy tay (WebM alpha) + chat → Build ×4 nhanh dần (whip, whip, whip, cut) → Quiz đếm ngược (push-in, riser) → **nhạc tắt 0,35 s → Stamp «0 ĐỒNG» = cú heavy duy nhất** (flash + rung + impact, ~29 s ≈ 71 %) → Breath 3 s (gần tĩnh, pull-out chậm, swell) → Payoff (light-leak, pull-out) → CTA.
Âm thanh lấy từ thư viện (hạng A): `"L:<đường dẫn>"` trong `SFX[]`/`BEDS[]` = file trong `../audio` (sync vào `public/lib/audio`); tên trơn = bản tự tổng hợp (tick, swell). Nhạc: "Digital Lemonade", "Furious Freak", "Neon Laser Horizon" — Kevin MacLeod (incompetech.com), CC BY 4.0 (**phải ghi công khi đăng**); "Uplift Me" — Mixkit.
Đầu ra: bản đầy đủ 1080p60 (26 MB) ở scratch `alib-large/showcase.mp4`; bản xem nhanh trong git: `showcase-preview-720p.mp4` + `showcase-strip.jpg`.
