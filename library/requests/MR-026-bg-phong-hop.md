---
id: MR-026
priority: P2
kind: background
status: todo
assignee: ""
output: library/inbox/MR-026-bg-phong-hop/
---
# MR-026 · Bối cảnh — phong-hop

## Đầu vào
- `library/characters/vy/stills/vy-neutral.png (để khớp phong cách)`

## Lệnh tạo (prompt)
```
Flat vector illustration background, same clean cel-shaded cartoon style and line weight as the reference chibi character, warm modern palette (teal, coral, warm yellow accents on soft neutrals). Scene: meeting room with long table, whiteboard, screen on wall. Empty of people, leave the lower-left and center areas uncluttered so characters can stand there, gentle depth, no text, no logos, no watermark.
```

## Yêu cầu đầu ra
PNG 1920×1080 (16:9). Nếu được: thêm 1 bản tách lớp (tiền cảnh / hậu cảnh) để làm chiều sâu

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Cùng phong cách với nhân vật (đường viền, độ phẳng, bảng màu)
- [ ] Không chữ, không logo, không người
- [ ] Chừa chỗ trống cho nhân vật đứng
- [ ] Sắc nét ở 1080p

## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
