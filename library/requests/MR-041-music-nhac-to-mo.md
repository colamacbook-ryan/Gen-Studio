---
id: MR-041
priority: P5
kind: music
status: review
assignee: "muse"
output: library/inbox/MR-041-music-nhac-to-mo/
---
# MR-041 · Nhạc — nhac-to-mo


## Đầu vào




## Lệnh tạo (prompt)
```
Instrumental music only, no vocals: curious, playful intro music, light plucks and soft percussion, 30 s, loopable. High quality mix, no clipping.
```


## Yêu cầu đầu ra
MP3 hoặc WAV 48 kHz stereo, chỉ cần âm thanh (nếu Muse chỉ xuất video: xuất video có tiếng, phần hình bỏ qua)


## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Không lời
- [x] Không méo tiếng
- [x] Đúng tâm trạng, không sến/rẻ tiền


## Nộp
Đặt file vào thư mục `output` ở trên + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
> MUSE-NOP: nhac to mo 30s, pluck C-major, 96 BPM, 12 o nhip, lap duoc, khong loi, -16.06 LUFS, dinh -1.51 dBTP, 48 kHz 24-bit stereo, tong hop bang numpy + ffmpeg.
