---
id: MR-049
priority: P0b
kind: character-design
status: review
assignee: ""
output: library/inbox/MR-049-nhi-3d-khung-clip/
---
# MR-049 · Nhi — khung tư thế trung tính cho clip 16:9

## Đầu vào
- `library/style/ref-3d-nhi-a.png (MẪU GỐC ĐÃ DUYỆT — Nhi phương án A: đúng mặt, tóc, trang phục, tỉ lệ)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. The SAME approved character (nhi) standing in a neutral relaxed pose, medium-full shot, centered, facing camera, on a solid flat chroma green #00B140 background, even soft lighting with no shadow cast on the background. This frame will be used as the first AND last frame of every animation clip.
```

## Yêu cầu đầu ra
PNG 1920×1080 nền xanh #00B140 phẳng

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Nhân vật ở giữa, chừa khoảng trống quanh người
- [ ] Nền xanh tuyệt đối phẳng, không bóng

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** thiết kế nhân vật cần Ryan duyệt trước khi làm clip — Gen sẽ báo kết quả trong phiếu.
