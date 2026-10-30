---
id: MR-061
priority: P2a
kind: audio
status: review
assignee: muse
output: library/inbox/MR-061-am-hai-huoc/
---
# MR-061 · Bộ 8 âm hài/cảm xúc cho nhân vật

## Đầu vào
- `library/audio/music/light-explain-02.mp3` (tham khảo tầm chất lượng tối thiểu — phải hay hơn)

## Lệnh tạo (prompt)
```
Character reaction sound kit for comedic/emotional beats in a family-friendly animated explainer: cartoon boing (weighty), slide whistle up, slide whistle down, record scratch, 'aww' small studio audience (clean, warm), short laugh track small audience, 'ding!' idea lightbulb, gasp stinger (musical). Polished, not cheap.
```

## Yêu cầu đầu ra
8 WAV 48 kHz 24-bit, đỉnh −1 dBFS
Nếu công cụ chỉ xuất video có tiếng: xuất video, Gen sẽ tách âm — ghi rõ trong meta.json.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Nghe chuyên nghiệp, không giống âm miễn phí rẻ tiền
- [x] Tiếng khán giả sạch, không ồn nền
- [x] Mỗi âm rõ cảm xúc
- [x] Không lời hát, không dùng giai điệu/bài hát có sẵn của người khác

## Nộp
Theo `library/MUSE.md` §4–§6. Đổi `status` thành `review`.
