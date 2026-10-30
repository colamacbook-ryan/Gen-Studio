---
id: MR-050
priority: P0b
kind: character-design
status: review
assignee: ""
output: library/inbox/MR-050-vy-3d-bieu-cam/
---
# MR-050 · Vy — 12 biểu cảm 3D (bán thân)

## Đầu vào
- `library/style/ref-3d-vy-a.png (MẪU GỐC ĐÃ DUYỆT — Vy phương án A: bé, đầu to; tỉ lệ chuẩn theo bộ biểu cảm MR-050)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Expression sheet of the SAME approved character (vy), head-and-shoulders, 12 expressions: neutral smile, explaining, listening/nodding, thinking, pleasantly surprised, shocked, laughing, embarrassed, celebrating, worried, talking calmly, talking excitedly. Consistent identity and lighting, solid chroma green #00B140 background.
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
