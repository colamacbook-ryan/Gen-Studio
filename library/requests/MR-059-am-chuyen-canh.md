---
id: MR-059
priority: P2a
kind: audio
status: todo
assignee: ""
output: library/inbox/MR-059-am-chuyen-canh/
---
# MR-059 · Bộ 8 âm chuyển cảnh (transition stings)

## Đầu vào
- `library/audio/music/light-explain-02.mp3` (tham khảo tầm chất lượng tối thiểu — phải hay hơn)

## Lệnh tạo (prompt)
```
Set of 8 short transition stings for motion-graphics scene changes, same sonic palette as the channel logo: 2 light swish, 2 medium whoosh with tonal tail, 2 heavy cinematic impact-whoosh with sub drop, 1 riser into hit (2 s), 1 reverse swell (1.5 s). Clean, punchy, premium.
```

## Yêu cầu đầu ra
8 WAV 48 kHz 24-bit, mỗi file 0,5–2 s, đỉnh −1 dBFS, đặt tên theo loại (vd swish-light-01.wav)
Nếu công cụ chỉ xuất video có tiếng: xuất video, Gen sẽ tách âm — ghi rõ trong meta.json.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Có đủ 3 mức nhẹ/vừa/mạnh rõ ràng
- [ ] Không rè, không clip, đuôi sạch
- [ ] Cùng một chất âm
- [ ] Không lời hát, không dùng giai điệu/bài hát có sẵn của người khác

## Nộp
Theo `library/MUSE.md` §4–§6. Đổi `status` thành `review`.
