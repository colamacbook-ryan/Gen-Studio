---
id: MR-048
priority: P0b
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-048-nhi-3d-bieu-cam/
---
# MR-048 · Nhi — 12 biểu cảm 3D (bán thân)

## Đầu vào
- `library/inbox/ phiếu thiết kế nhi đã duyệt`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Expression sheet of the SAME approved character (nhi), head-and-shoulders, 12 expressions: neutral smile, explaining, listening/nodding, thinking, pleasantly surprised, shocked, laughing, embarrassed, celebrating, worried, talking calmly, talking excitedly. Consistent identity and lighting, solid chroma green #00B140 background.
```

## Yêu cầu đầu ra
12 PNG rời 2048×2048 nền xanh #00B140 + 1 bảng tổng

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Cùng một khuôn mặt ở cả 12 ảnh
- [ ] Biểu cảm rõ, dễ thương, đọc được khi thu nhỏ
- [ ] Nền xanh phẳng để tách nền

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** thiết kế nhân vật cần Ryan duyệt trước khi làm clip — Gen sẽ báo kết quả trong phiếu.
