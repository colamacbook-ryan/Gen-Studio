---
id: MR-047
priority: P0b
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-047-vy-3d-xoay/
---
# MR-047 · Vy — bảng xoay 3D (turnaround)

## Đầu vào
- `library/style/ref-3d-vy-a.png (MẪU GỐC ĐÃ DUYỆT — Vy phương án A: bé, đầu to; tỉ lệ chuẩn theo bộ biểu cảm MR-050)`
- `library/inbox/MR-050-vy-3d-bieu-cam/vy-expr-01-neutral-smile.png (mặt + tỉ lệ chuẩn)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Character turnaround sheet of the SAME character (vy) from the approved design: front, three-quarter, side, back views, identical proportions and outfit, neutral pose, plain light-grey background, no text.
```

## Yêu cầu đầu ra
PNG 3840×2160 một bảng 4 góc nhìn + 4 file PNG rời mỗi góc

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] 4 góc nhìn cùng một nhân vật, tỉ lệ khớp nhau
- [ ] Không chữ, nền phẳng

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** thiết kế nhân vật cần Ryan duyệt trước khi làm clip — Gen sẽ báo kết quả trong phiếu.

> GEN-REWORK: bản nộp vẽ Vy cao, dáng thiếu niên, khác hẳn mẫu gốc. Làm lại 4 góc với ĐÚNG tỉ lệ bé đầu to của `ref-3d-vy-a.png` (cùng chiều cao, cùng cỡ đầu ở cả 4 góc).
