---
id: MR-065
priority: P0
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-065-vy-bieu-cam-v2/
---
# MR-065 · Vy — bộ biểu cảm v2 đầy đủ (40 ảnh, khoá khung, có khẩu hình)

> Ryan 2026-10-31: «bộ nét mặt các nhân vật còn thiếu quá nhiều… học Trung Quốc». Dùng để diễn kiểu **con rối từ ảnh** (动态漫/表情包): đổi biểu cảm theo từng câu thoại mà **đầu không được nhảy chỗ**, nên khung phải khoá tuyệt đối.

## Đầu vào
- `library/style/ref-3d-vy-a.png (MẪU GỐC ĐÃ DUYỆT)`

## Cách làm (bắt buộc theo thứ tự)
1. Tạo **một ảnh gốc** `vy-00-base.png`: mặt trung tính, miệng khép, đúng khung khoá bên dưới.
2. Tạo mọi biểu cảm **bằng cách sửa từ ảnh gốc** (image-to-image / inpaint), không tạo lại từ đầu — để đầu, tóc, áo, vị trí người giữ nguyên.

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette), matching library/style/ref-3d-ryan-01.jpg. The SAME approved character (vy). LOCKED FRAMING for every image: 2048x2048, head-and-shoulders, SAME camera, SAME head size and position as the base frame (face centered at x=1024, eyes at y≈820, face width ≈ 620 px, shoulders reach both left and right edges, bottom of frame cuts mid-chest). Edit FROM the base frame (image-to-image / inpainting) so only face, arms and small effects change; hair, glasses, clothes, body position stay identical. Flat solid chroma green #00B140 background, no shadow on background, no text. Expression: <tên biểu cảm>. Exaggerated, cute, cartoon-like acting (Chinese animated short / 表情包 style), readable at thumbnail size.
```

## Danh sách 40 biểu cảm
- **Cơ bản + khẩu hình nhép miệng:**
  - `vy-01` · neutral smile, mouth closed
  - `vy-02` · neutral, mouth half open (talking 'a')
  - `vy-03` · neutral, mouth wide open (talking 'á')
  - `vy-04` · neutral, mouth round 'o'
  - `vy-05` · neutral, mouth wide 'e/i' (teeth showing)
  - `vy-06` · neutral, lips pressed 'm/b/p'
- **Vui (khoa trương kiểu hoạt hình):**
  - `vy-07` · big grin, eyes closed happy arcs ^_^
  - `vy-08` · laughing hard, head tilted back, tears of joy
  - `vy-09` · giggling, hand covering mouth
  - `vy-10` · sparkling star eyes (✨ in pupils), amazed
  - `vy-11` · heart eyes, hands on cheeks
  - `vy-12` · smug proud face 得意, chin up, half-lidded eyes
  - `vy-13` · wink + peace sign
  - `vy-14` · clapping excitedly
- **Ngạc nhiên / sốc:**
  - `vy-15` · gasp, small round mouth, raised eyebrows
  - `vy-16` · jaw dropped shock, tiny pupils, white face lines
  - `vy-17` · petrified 石化 frozen face, blank white eyes
  - `vy-18` · eyes popping out comically wide
- **Buồn / tủi:**
  - `vy-19` · pouting 委屈, trembling lips, teary eyes
  - `vy-20` · crying waterfall tears 宽面条泪, mouth wide
  - `vy-21` · sulking, puffed lower lip, looking down
- **Giận dỗi (dễ thương):**
  - `vy-22` · puffed cheeks 鼓腮, angry eyebrows
  - `vy-23` · angry with cartoon anger vein on forehead, fist raised
  - `vy-24` · huffy, arms crossed, looking away
- **Ngượng / bối rối:**
  - `vy-25` · blushing with diagonal blush lines, shy smile
  - `vy-26` · awkward smile with big sweat drop on head
  - `vy-27` · facepalm, one hand over face
  - `vy-28` · nervous laugh, scratching back of head
- **Suy nghĩ / lú:**
  - `vy-29` · thinking, finger on chin, eyes up
  - `vy-30` · confused, head tilted, question mark mood
  - `vy-31` · dizzy spiral eyes 晕
  - `vy-32` · lightbulb idea moment, finger pointing up, eyes bright
- **Thái độ khác:**
  - `vy-33` · determined, fiery eyes, fist up
  - `vy-34` · scared, shivering, pale blue lines on forehead
  - `vy-35` · bored half-lidded eyes, flat mouth
  - `vy-36` · sleepy yawn
  - `vy-37` · shrug with both palms up
  - `vy-38` · pointing to the side (presenting something)
  - `vy-39` · thumbs up with big smile
  - `vy-40` · OK hand sign, confident smile

## Yêu cầu đầu ra
- `vy-00-base.png` + 40 PNG 2048×2048 nền xanh #00B140, tên đúng mã ở trên (vd `vy-07-laughing.png` — thêm chữ mô tả ngắn sau số).
- 1 bảng tổng `vy-sheet.png` (6 cột).

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Tâm mặt lệch ≤ 20 px và bề rộng mặt lệch ≤ 3 % so với ảnh gốc ở mọi ảnh
- [ ] Vai chạm hai mép trái/phải, không có vết cắt dọc thân
- [ ] 6 ảnh khẩu hình chỉ khác nhau ở miệng
- [ ] Biểu cảm khoa trương, dễ thương, đọc được khi thu nhỏ
- [ ] Nền xanh phẳng một màu

## Nộp
Đặt file vào `output` + `meta.json` (`library/MUSE.md` §4). Đổi `status` thành `review`.
