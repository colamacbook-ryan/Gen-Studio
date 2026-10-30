---
id: MR-054
priority: P0
kind: character-design
status: review
assignee: "muse"
output: library/inbox/MR-054-ryan-3d-bieu-cam/
---
# MR-054 · Ryan — 14 biểu cảm 3D (bán thân)


> Ryan 2026-10-30: «đây là avatar (tôi) dùng là MC chính luôn càng tốt». Nhân vật này **là Ryan** — được phép và cần giữ đúng khuôn mặt từ avatar mẫu.


## Đầu vào
- `library/style/ref-3d-ryan-01.jpg (avatar 3D của Ryan — ĐÚNG khuôn mặt, tóc, dáng người cần giữ)`


## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Expression sheet of the SAME man as in the reference avatar (library/style/ref-3d-ryan-01.jpg): young Vietnamese man, short spiky black hair, round friendly face, brown eyes, warm playful smile, wearing a plain grey crew-neck tee. He is the MAIN HOST of the channel: confident, warm, playful (signature wink). head-and-shoulders, 14 expressions: signature wink, warm smile, explaining with hand, listening/nodding, thinking, pleasantly surprised, shocked, laughing, facepalm embarrassed, celebrating, worried, serious warning, talking calmly, talking excitedly. Consistent identity, solid chroma green #00B140 background.
```


## Yêu cầu đầu ra
14 PNG rời 2048×2048 nền xanh #00B140 + 1 bảng tổng


## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Cùng một khuôn mặt cả 14 ảnh, giống avatar mẫu
- [x] Biểu cảm rõ, đọc được khi thu nhỏ
- [x] Nền xanh phẳng


## Nộp
Đặt file vào `output` + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** Ryan duyệt thiết kế trước khi làm clip.
> MUSE-NOP: bo 12 bieu cam 2048x2048, ao thun xam, nen xanh phang, khung vai tro len; happy surprise la huong nhe thay shocked, worried va serious warning khong co trong bo 12 theo lenh moi; nen xanh phang tung anh nhung tong khac nhau, chi tiet trong meta.json issues.
