---
id: MR-020
priority: P1
kind: character-clip
status: todo
assignee: ""
output: library/inbox/MR-020-vy-an-mung/
---
# MR-020 · Vy — an-mung

## Đầu vào
- `library/characters/vy/stills/vy-neutral-chroma-1280x720.png (KHUNG ĐẦU và KHUNG CUỐI)`
- `library/characters/vy/stills/*.png (bảng biểu cảm để giữ đúng nhân vật)`

## Lệnh tạo (prompt)
```
2D flat cel-shaded chibi character animation. Vy: chibi office girl ~24, brown high ponytail with yellow polka-dot bow, coral cardigan, blue skirt, staff ID badge, the lively curious learner. Action: celebrating: fist pump / both arms up, jumps a little, joyful. Keep the character EXACTLY on-model (same face, hair, outfit, colors, line weight) as the reference image. Start from the exact reference pose and return to the exact same pose at the end. Solid pure chroma green background #00B140 filling the whole frame, no shadows on the background, no props, static locked camera, no zoom, no text, no watermark, smooth bouncy expressive acting.
```

## Yêu cầu đầu ra
MP4 H.264, 1280×720 (hoặc 1920×1080), 24–30 fps, 4–6 giây, KHÔNG có tiếng, nền xanh #00B140 phẳng

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Khung đầu và khung cuối gần như trùng ảnh tham chiếu (để nối liền các clip)
- [ ] Đúng nhân vật: không đổi kiểu mắt/tóc/màu áo, không mọc thêm ngón tay
- [ ] Nền xanh phẳng, không bóng đổ, không vật thể lạ, camera đứng yên
- [ ] Biểu cảm rõ ràng, chuyển động mượt, không giật/nháy
- [ ] Không chữ, không watermark

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
