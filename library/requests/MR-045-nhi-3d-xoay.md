---
id: MR-045
priority: P0b
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-045-nhi-3d-xoay/
---
# MR-045 · Nhi — bảng xoay 3D (turnaround)

## Đầu vào
- `library/inbox/MR-044-nhi-3d-thiet-ke/ (phương án đã chọn — nếu chưa chọn, dùng phương án 1)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Character turnaround sheet of the SAME character (nhi) from the approved design: front, three-quarter, side, back views, identical proportions and outfit, neutral pose, plain light-grey background, no text.
```

## Yêu cầu đầu ra
PNG 3840×2160 một bảng 4 góc nhìn + 4 file PNG rời mỗi góc

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] 4 góc nhìn cùng một nhân vật, tỉ lệ khớp nhau
- [ ] Không chữ, nền phẳng

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** thiết kế nhân vật cần Ryan duyệt trước khi làm clip — Gen sẽ báo kết quả trong phiếu.
