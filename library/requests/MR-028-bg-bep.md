---
id: MR-028
priority: P2
kind: background
status: review
assignee: muse
output: library/inbox/MR-028-bg-bep/
---
# MR-028 · Bối cảnh — bep

## Đầu vào
- `library/style/ref-3d-ryan-01.jpg (mẫu phong cách 3D)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Environment only. Scene: cozy kitchen with stove and a soup pot. Empty of people, leave the lower-left and center areas uncluttered so characters can stand there, gentle depth, no text, no logos, no watermark.
```

## Yêu cầu đầu ra
PNG 1920×1080 (16:9). Nếu được: thêm 1 bản tách lớp (tiền cảnh / hậu cảnh) để làm chiều sâu

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Cùng phong cách 3D với ảnh mẫu (ánh sáng mềm, chất liệu, bảng màu ấm)
- [x] Không chữ, không logo, không người
- [x] Chừa chỗ trống cho nhân vật đứng
- [x] Sắc nét ở 1080p

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
