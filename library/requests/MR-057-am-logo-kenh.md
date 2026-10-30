---
id: MR-057
priority: P2a
kind: audio
status: todo
assignee: ""
output: library/inbox/MR-057-am-logo-kenh/
---
# MR-057 · Logo âm thanh của kênh (sound logo 2–3 s)

## Đầu vào
- `library/audio/music/light-explain-02.mp3` (tham khảo tầm chất lượng tối thiểu — phải hay hơn)

## Lệnh tạo (prompt)
```
Short memorable audio logo / sonic brand for a warm, smart, playful Vietnamese AI-education channel hosted by a friendly 3D-animated host. 2–3 seconds, 3–5 note motif (marimba/pluck + soft synth pad + subtle sparkle), ends on a resolved bright chord, modern and premium, not cheesy, no vocals. Provide 3 variations.
```

## Yêu cầu đầu ra
WAV 48 kHz 24-bit stereo, mỗi phương án 2–3 s, đỉnh −1 dBFS, có đuôi vang tự nhiên
Nếu công cụ chỉ xuất video có tiếng: xuất video, Gen sẽ tách âm — ghi rõ trong meta.json.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Dễ nhớ ngay lần nghe đầu
- [ ] Sang, không sến, không giống nhạc quảng cáo rẻ
- [ ] Không lời, không méo
- [ ] Không lời hát, không dùng giai điệu/bài hát có sẵn của người khác

## Nộp
Theo `library/MUSE.md` §4–§6. Đổi `status` thành `review`.
