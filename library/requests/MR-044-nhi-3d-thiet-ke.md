---
id: MR-044
priority: P0b
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-044-nhi-3d-thiet-ke/
---
# MR-044 · Nhi — thiết kế nhân vật 3D (bản gốc)

## Đầu vào
- `library/style/ref-3d-ryan-01.jpg (mẫu phong cách — chỉ lấy PHONG CÁCH, không lấy khuôn mặt)`
- `library/characters/nhi/stills/nhi-neutral.png (nhận diện 2D cần giữ)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. Full-body character design of Nhi — woman, about 25, the calm smart expert who explains AI. Round glasses, dark hair with two neat buns, teal hoodie over a white tee, friendly confident smile. Keep her identity recognizable from the 2D design (library/characters/nhi/stills/nhi-neutral.png): glasses, buns, teal outfit. Neutral relaxed standing pose facing camera, warm friendly expression. Clean neutral light-grey studio background. Do NOT copy the face of the person in the style reference — only its rendering style.
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
