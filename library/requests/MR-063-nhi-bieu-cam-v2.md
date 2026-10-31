---
id: MR-063
priority: P0
kind: character-design
status: todo
assignee: ""
output: library/inbox/MR-063-nhi-bieu-cam-v2/
---
# MR-063 · Nhi (MC tấu hài) — bộ biểu cảm v2 đầy đủ (40 ảnh, khoá khung, có khẩu hình)

> Ryan 2026-10-31: «bộ nét mặt các nhân vật còn thiếu quá nhiều… học Trung Quốc». Dùng để diễn kiểu **con rối từ ảnh** (动态漫/表情包): đổi biểu cảm theo từng câu thoại mà **đầu không được nhảy chỗ**, nên khung phải khoá tuyệt đối.

## Đầu vào
- `library/style/ref-3d-nhi-a.png (MẪU GỐC ĐÃ DUYỆT)`

## Cách làm (bắt buộc theo thứ tự)
1. Tạo **một ảnh gốc** `nhi-00-base.png`: mặt trung tính, miệng khép, đúng khung khoá bên dưới.
2. Tạo mọi biểu cảm **bằng cách sửa từ ảnh gốc** (image-to-image / inpaint), không tạo lại từ đầu — để đầu, tóc, áo, vị trí người giữ nguyên.

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette), matching library/style/ref-3d-ryan-01.jpg. The SAME approved character (nhi). LOCKED FRAMING for every image: 2048x2048, head-and-shoulders, SAME camera, SAME head size and position as the base frame (face centered at x=1024, eyes at y≈820, face width ≈ 620 px, shoulders reach both left and right edges, bottom of frame cuts mid-chest). Edit FROM the base frame (image-to-image / inpainting) so only face, arms and small effects change; hair, glasses, clothes, body position stay identical. Flat solid chroma green #00B140 background, no shadow on background, no text. Expression: <tên biểu cảm>. Exaggerated, cute, cartoon-like acting (Chinese animated short / 表情包 style), readable at thumbnail size.
```

## Danh sách 40 biểu cảm
- **Cơ bản + khẩu hình nhép miệng:**
  - `nhi-01` · neutral smile, mouth closed
  - `nhi-02` · neutral, mouth half open (talking 'a')
  - `nhi-03` · neutral, mouth wide open (talking 'á')
  - `nhi-04` · neutral, mouth round 'o'
  - `nhi-05` · neutral, mouth wide 'e/i' (teeth showing)
  - `nhi-06` · neutral, lips pressed 'm/b/p'
- **Vui (khoa trương kiểu hoạt hình):**
  - `nhi-07` · big grin, eyes closed happy arcs ^_^
  - `nhi-08` · laughing hard, head tilted back, tears of joy
  - `nhi-09` · giggling, hand covering mouth
  - `nhi-10` · sparkling star eyes (✨ in pupils), amazed
  - `nhi-11` · heart eyes, hands on cheeks
  - `nhi-12` · smug proud face 得意, chin up, half-lidded eyes
  - `nhi-13` · wink + peace sign
  - `nhi-14` · clapping excitedly
- **Ngạc nhiên / sốc:**
  - `nhi-15` · gasp, small round mouth, raised eyebrows
  - `nhi-16` · jaw dropped shock, tiny pupils, white face lines
  - `nhi-17` · petrified 石化 frozen face, blank white eyes
  - `nhi-18` · eyes popping out comically wide
- **Buồn / tủi:**
  - `nhi-19` · pouting 委屈, trembling lips, teary eyes
  - `nhi-20` · crying waterfall tears 宽面条泪, mouth wide
  - `nhi-21` · sulking, puffed lower lip, looking down
- **Giận dỗi (dễ thương):**
  - `nhi-22` · puffed cheeks 鼓腮, angry eyebrows
  - `nhi-23` · angry with cartoon anger vein on forehead, fist raised
  - `nhi-24` · huffy, arms crossed, looking away
- **Ngượng / bối rối:**
  - `nhi-25` · blushing with diagonal blush lines, shy smile
  - `nhi-26` · awkward smile with big sweat drop on head
  - `nhi-27` · facepalm, one hand over face
  - `nhi-28` · nervous laugh, scratching back of head
- **Suy nghĩ / lú:**
  - `nhi-29` · thinking, finger on chin, eyes up
  - `nhi-30` · confused, head tilted, question mark mood
  - `nhi-31` · dizzy spiral eyes 晕
  - `nhi-32` · lightbulb idea moment, finger pointing up, eyes bright
- **Thái độ khác:**
  - `nhi-33` · determined, fiery eyes, fist up
  - `nhi-34` · scared, shivering, pale blue lines on forehead
  - `nhi-35` · bored half-lidded eyes, flat mouth
  - `nhi-36` · sleepy yawn
  - `nhi-37` · shrug with both palms up
  - `nhi-38` · pointing to the side (presenting something)
  - `nhi-39` · thumbs up with big smile
  - `nhi-40` · OK hand sign, confident smile

## Yêu cầu đầu ra
- `nhi-00-base.png` + 40 PNG 2048×2048 nền xanh #00B140, tên đúng mã ở trên (vd `nhi-07-laughing.png` — thêm chữ mô tả ngắn sau số).
- 1 bảng tổng `nhi-sheet.png` (6 cột).

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [ ] Tâm mặt lệch ≤ 20 px và bề rộng mặt lệch ≤ 3 % so với ảnh gốc ở mọi ảnh
- [ ] Vai chạm hai mép trái/phải, không có vết cắt dọc thân
- [ ] 6 ảnh khẩu hình chỉ khác nhau ở miệng
- [ ] Biểu cảm khoa trương, dễ thương, đọc được khi thu nhỏ
- [ ] Nền xanh phẳng một màu

## Nộp
Đặt file vào `output` + `meta.json` (`library/MUSE.md` §4). Đổi `status` thành `review`.
