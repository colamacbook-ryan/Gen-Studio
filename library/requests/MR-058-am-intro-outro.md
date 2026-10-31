---
id: MR-058
priority: P2a
kind: audio
status: review
assignee: muse
output: library/inbox/MR-058-am-intro-outro/
---
# MR-058 · Nhạc mở đầu 6 s + kết 8 s dựa trên logo âm thanh

## Đầu vào
- `library/audio/music/light-explain-02.mp3` (tham khảo tầm chất lượng tối thiểu — phải hay hơn)

## Lệnh tạo (prompt)
```
Intro sting (6 s) and outro sting (8 s) built from the channel's sonic logo motif (see MR-057 output if available): intro builds energy and lands on the logo; outro is warm and resolving with room for a 'subscribe' card. No vocals, premium modern production.
```

## Yêu cầu đầu ra
WAV 48 kHz 24-bit stereo; loudness tích hợp −16 LUFS, true peak ≤ −1 dBTP
Nếu công cụ chỉ xuất video có tiếng: xuất video, Gen sẽ tách âm — ghi rõ trong meta.json.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Cùng chất với logo âm thanh
- [x] Kết thúc gọn, không cụt
- [x] Không lời
- [x] Không lời hát, không dùng giai điệu/bài hát có sẵn của người khác

## Nộp
Theo `library/MUSE.md` §4–§6. Đổi `status` thành `review`.
