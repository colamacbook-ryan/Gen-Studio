---
id: MR-043
priority: P5
kind: music
status: review
assignee: "muse"
output: library/inbox/MR-043-music-nhac-cong-so/
---
# MR-043 · Nhạc — nhac-cong-so


## Đầu vào




## Lệnh tạo (prompt)
```
Instrumental music only, no vocals: upbeat modern corporate background music, warm, not cheesy, 60 s. High quality mix, no clipping.
```


## Yêu cầu đầu ra
MP3 hoặc WAV 48 kHz stereo, chỉ cần âm thanh (nếu Muse chỉ xuất video: xuất video có tiếng, phần hình bỏ qua)


## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Không lời
- [x] Không méo tiếng
- [x] Đúng tâm trạng, không sến/rẻ tiền


## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
> MUSE-NOP: nhac cong so 60s, pad C-G-Am-F, 120 BPM, 30 o nhip, khong loi, -16.80 LUFS, dinh -1.49 dBTP, 48 kHz 24-bit stereo, tong hop bang numpy + ffmpeg.
