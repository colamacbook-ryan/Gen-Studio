---
id: MR-066
priority: P0
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-066-ryan-bieu-cam-v2/
---
# MR-066 · Ryan — bộ biểu cảm v2 đầy đủ (40 ảnh, khoá khung, có khẩu hình)

> Ryan 2026-10-31: «bộ nét mặt các nhân vật còn thiếu quá nhiều… học Trung Quốc». Dùng để diễn kiểu **con rối từ ảnh** (动态漫/表情包): đổi biểu cảm theo từng câu thoại mà **đầu không được nhảy chỗ**, nên khung phải khoá tuyệt đối.

## Đầu vào
- `library/style/ref-3d-ryan-tee.png (MẪU GỐC ĐÃ DUYỆT)`

## Cách làm (bắt buộc theo thứ tự)
1. Tạo **một ảnh gốc** `ryan-00-base.png`: mặt trung tính, miệng khép, đúng khung khoá bên dưới.
2. Tạo mọi biểu cảm **bằng cách sửa từ ảnh gốc** (image-to-image / inpaint), không tạo lại từ đầu — để đầu, tóc, áo, vị trí người giữ nguyên.

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette), matching library/style/ref-3d-ryan-01.jpg. The SAME approved character (ryan). LOCKED FRAMING for every image: 2048x2048, head-and-shoulders, SAME camera, SAME head size and position as the base frame (face centered at x=1024, eyes at y≈820, face width ≈ 620 px, shoulders reach both left and right edges, bottom of frame cuts mid-chest). Edit FROM the base frame (image-to-image / inpainting) so only face, arms and small effects change; hair, glasses, clothes, body position stay identical. Flat solid chroma green #00B140 background, no shadow on background, no text. Expression: <tên biểu cảm>. Exaggerated, cute, cartoon-like acting (Chinese animated short / 表情包 style), readable at thumbnail size.
```

## Danh sách 40 biểu cảm
- **Cơ bản + khẩu hình nhép miệng:**
  - `ryan-01` · neutral smile, mouth closed
  - `ryan-02` · neutral, mouth half open (talking 'a')
  - `ryan-03` · neutral, mouth wide open (talking 'á')
  - `ryan-04` · neutral, mouth round 'o'
  - `ryan-05` · neutral, mouth wide 'e/i' (teeth showing)
  - `ryan-06` · neutral, lips pressed 'm/b/p'
- **Vui (khoa trương kiểu hoạt hình):**
  - `ryan-07` · big grin, eyes closed happy arcs ^_^
  - `ryan-08` · laughing hard, head tilted back, tears of joy
  - `ryan-09` · giggling, hand covering mouth
  - `ryan-10` · sparkling star eyes (✨ in pupils), amazed
  - `ryan-11` · heart eyes, hands on cheeks
  - `ryan-12` · smug proud face 得意, chin up, half-lidded eyes
  - `ryan-13` · wink + peace sign
  - `ryan-14` · clapping excitedly
- **Ngạc nhiên / sốc:**
  - `ryan-15` · gasp, small round mouth, raised eyebrows
  - `ryan-16` · jaw dropped shock, tiny pupils, white face lines
  - `ryan-17` · petrified 石化 frozen face, blank white eyes
  - `ryan-18` · eyes popping out comically wide
- **Buồn / tủi:**
  - `ryan-19` · pouting 委屈, trembling lips, teary eyes
  - `ryan-20` · crying waterfall tears 宽面条泪, mouth wide
  - `ryan-21` · sulking, puffed lower lip, looking down
- **Giận dỗi (dễ thương):**
  - `ryan-22` · puffed cheeks 鼓腮, angry eyebrows
  - `ryan-23` · angry with cartoon anger vein on forehead, fist raised
  - `ryan-24` · huffy, arms crossed, looking away
- **Ngượng / bối rối:**
  - `ryan-25` · blushing with diagonal blush lines, shy smile
  - `ryan-26` · awkward smile with big sweat drop on head
  - `ryan-27` · facepalm, one hand over face
  - `ryan-28` · nervous laugh, scratching back of head
- **Suy nghĩ / lú:**
  - `ryan-29` · thinking, finger on chin, eyes up
  - `ryan-30` · confused, head tilted, question mark mood
  - `ryan-31` · dizzy spiral eyes 晕
  - `ryan-32` · lightbulb idea moment, finger pointing up, eyes bright
- **Thái độ khác:**
  - `ryan-33` · determined, fiery eyes, fist up
  - `ryan-34` · scared, shivering, pale blue lines on forehead
  - `ryan-35` · bored half-lidded eyes, flat mouth
  - `ryan-36` · sleepy yawn
  - `ryan-37` · shrug with both palms up
  - `ryan-38` · pointing to the side (presenting something)
  - `ryan-39` · thumbs up with big smile
  - `ryan-40` · OK hand sign, confident smile

## Yêu cầu đầu ra
- `ryan-00-base.png` + 40 PNG 2048×2048 nền xanh #00B140, tên đúng mã ở trên (vd `ryan-07-laughing.png` — thêm chữ mô tả ngắn sau số).
- 1 bảng tổng `ryan-sheet.png` (6 cột).

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Tâm mặt lệch ≤ 20 px và bề rộng mặt lệch ≤ 3 % so với ảnh gốc ở mọi ảnh
- [ ] Vai chạm hai mép trái/phải, không có vết cắt dọc thân
- [ ] 6 ảnh khẩu hình chỉ khác nhau ở miệng
- [ ] Biểu cảm khoa trương, dễ thương, đọc được khi thu nhỏ
- [ ] Nền xanh phẳng một màu

## Nộp
Đặt file vào `output` + `meta.json` (`library/MUSE.md` §4). Đổi `status` thành `review`.
