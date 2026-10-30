---
id: MR-046
priority: P0b
kind: character-design
status: done
assignee: ""
output: library/inbox/MR-046-vy-3d-thiet-ke/
---
# MR-046 · Vy — thiết kế nhân vật 3D (bản gốc)

## Đầu vào
- `library/style/ref-3d-ryan-01.jpg (mẫu phong cách — chỉ lấy PHONG CÁCH, không lấy khuôn mặt)`
- `library/characters/vy/stills/vy-neutral.png (nhận diện 2D cần giữ)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Full-body character design of Vy — woman, about 24, the lively curious office worker who learns. Brown high ponytail with a yellow polka-dot bow, coral cardigan over a white collared shirt, blue pleated skirt, staff ID badge, bright amber eyes, energetic. Keep identity from the 2D design (library/characters/vy/stills/vy-neutral.png). Neutral relaxed standing pose facing camera, warm friendly expression. Clean neutral light-grey studio background. Do NOT copy the face of the person in the style reference — only its rendering style.
```

## Yêu cầu đầu ra
PNG ≥ 2048 px chiều cao: (1) toàn thân chính diện; (2) 3 phương án khác nhau nhẹ để Ryan chọn

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Phong cách 3D đúng như ảnh mẫu (chất liệu mềm, ánh sáng ấm)
- [ ] Giữ nhận diện 2D (kính/búi tóc/áo teal cho Nhi; đuôi ngựa/nơ vàng/áo san hô cho Vy)
- [ ] Dễ thương, chuyên nghiệp, không giống người thật cụ thể nào
- [ ] Tay đủ 5 ngón, không lỗi giải phẫu

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** thiết kế nhân vật cần Ryan duyệt trước khi làm clip — Gen sẽ báo kết quả trong phiếu.

> ĐÃ DUYỆT (Ryan 2026-10-30): phương án A (`vy-3d-variant-a.png`) → mẫu gốc `library/style/ref-3d-vy-a.png`.
