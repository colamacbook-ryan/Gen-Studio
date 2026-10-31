---
id: MR-064
priority: P0
kind: overlay
status: todo
assignee: ""
output: library/inbox/MR-064-ky-hieu-cam-xuc/
---
# MR-064 · Bộ ký hiệu cảm xúc 漫符 (lớp phủ trong suốt)

> Ký hiệu cảm xúc kiểu hoạt hình Trung Quốc/Nhật, đặt cạnh đầu nhân vật để tăng độ khoa trương. Dùng chung cho mọi nhân vật.

## Đầu vào
- `library/style/ref-3d-nhi-a.png (chỉ tham chiếu phong cách 3D mềm, màu ấm)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette), matching library/style/ref-3d-ryan-01.jpg. Single cartoon emotion symbol (manpu / 漫符) as a soft 3D sticker, centered, isolated on flat solid chroma green #00B140 background, no character, no text: <tên ký hiệu>.
```

## Danh sách (mỗi ký hiệu 1 PNG 1024×1024)
- `fx-01-sweat-drop` giọt mồ hôi to · `fx-02-anger-vein` gân giận (dấu thập đỏ) · `fx-03-sparkles` lấp lánh · `fx-04-hearts` 3 trái tim
- `fx-05-question` dấu ? · `fx-06-exclaim` dấu ! · `fx-07-interrobang` ?! · `fx-08-blush-lines` vạch má hồng
- `fx-09-gloom-lines` vạch tối 黑线 (rủ xuống) · `fx-10-shock-lines` tia sốc toả tròn · `fx-11-spiral` xoáy chóng mặt · `fx-12-tears-stream` 2 dòng nước mắt
- `fx-13-steam-puff` khói giận bốc lên · `fx-14-zzz` ngủ · `fx-15-music-notes` nốt nhạc vui · `fx-16-lightbulb` bóng đèn ý tưởng
- `fx-17-cross-pop` dấu X đỏ · `fx-18-check-pop` dấu ✓ xanh · `fx-19-thumbs-up` ngón cái · `fx-20-speed-lines` vạch tốc độ

## Yêu cầu đầu ra
20 PNG 1024×1024 nền xanh #00B140, tên đúng mã + bảng tổng `fx-sheet.png`.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Mỗi ảnh đúng 1 ký hiệu, nằm giữa, không chạm mép
- [ ] Không có màu xanh lá trong ký hiệu (để tách nền sạch)
- [ ] Cùng một phong cách 3D mềm, dễ thương

## Nộp
Đặt file vào `output` + `meta.json` (`library/MUSE.md` §4). Đổi `status` thành `review`.
