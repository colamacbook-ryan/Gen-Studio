---
id: MR-062
priority: P2a
kind: audio
status: review
assignee: muse
output: library/inbox/MR-062-nhac-nen-bo-1/
---
# MR-062 · Bộ nhạc nền 6 tâm trạng (60–90 s, lặp được)

## Đầu vào
- `library/audio/music/light-explain-02.mp3` (tham khảo tầm chất lượng tối thiểu — phải hay hơn)

## Lệnh tạo (prompt)
```
Six instrumental background music beds for a premium AI-education YouTube channel, all sharing one sonic identity with the channel logo: (1) curious playful intro, (2) light explaining bed under voice-over (sparse, mid-range kept clear for speech), (3) building tension, (4) climax/reveal, (5) calm reflective breath, (6) happy uplifting outro. Modern, warm, premium, no vocals, each loopable.
```

## Yêu cầu đầu ra
6 file WAV 48 kHz 24-bit stereo, 60–90 s, loudness −16 LUFS, true peak ≤ −1 dBTP; nếu được thêm bản stems (trống / bass / giai điệu)
Nếu công cụ chỉ xuất video có tiếng: xuất video, Gen sẽ tách âm — ghi rõ trong meta.json.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Không lời, chừa dải giọng nói (bed giải thích không lấn át lời)
- [x] Lặp liền không thấy chỗ nối
- [x] Cùng một bản sắc âm thanh, không sến
- [x] Không lời hát, không dùng giai điệu/bài hát có sẵn của người khác

## Nộp
Theo `library/MUSE.md` §4–§6. Đổi `status` thành `review`.
