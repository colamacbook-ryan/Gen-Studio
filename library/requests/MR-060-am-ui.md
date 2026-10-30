---
id: MR-060
priority: P2a
kind: audio
status: todo
assignee: ""
output: library/inbox/MR-060-am-ui/
---
# MR-060 · Bộ 12 âm giao diện (UI sounds) đồng bộ thương hiệu

## Đầu vào
- `library/audio/music/light-explain-02.mp3` (tham khảo tầm chất lượng tối thiểu — phải hay hơn)

## Lệnh tạo (prompt)
```
Cohesive UI sound kit for app/screen demos in explainer videos: click soft, click firm, toggle on, toggle off, typing loop (2 s, laptop), message send, message receive, notification gentle, success chime, error soft buzz, hover tick, drag/drop. Modern, friendly, premium (Apple-like clarity), same tonal palette.
```

## Yêu cầu đầu ra
12 WAV 48 kHz 24-bit mono hoặc stereo, đỉnh −1 dBFS, cắt sát đầu (không có khoảng lặng đầu file)
Nếu công cụ chỉ xuất video có tiếng: xuất video, Gen sẽ tách âm — ghi rõ trong meta.json.

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Đồng bộ chất âm
- [ ] Ngắn gọn, sạch, không rè
- [ ] Typing loop lặp liền
- [ ] Không lời hát, không dùng giai điệu/bài hát có sẵn của người khác

## Nộp
Theo `library/MUSE.md` §4–§6. Đổi `status` thành `review`.
