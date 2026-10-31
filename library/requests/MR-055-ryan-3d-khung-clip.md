---
id: MR-055
priority: P0
kind: character-design
status: review
assignee: "muse"
output: library/inbox/MR-055-ryan-3d-khung-clip/
---
# MR-055 · Ryan — khung tư thế trung tính cho clip 16:9

> Ryan 2026-10-30: «đây là avatar (tôi) dùng là MC chính luôn càng tốt». Nhân vật này **là Ryan** — được phép và cần giữ đúng khuôn mặt từ avatar mẫu.

## Đầu vào
- `library/style/ref-3d-ryan-tee.png (MẪU GỐC ĐÃ DUYỆT — Ryan áo thun xám: đúng mặt, tóc, tỉ lệ đầu/thân)`
- `library/inbox/MR-053-ryan-3d-xoay/ryan-3d-view-front.png (tỉ lệ thân chuẩn)`

## Lệnh tạo (prompt)
```
Premium stylized 3D animation style like a modern animated feature film (soft clay-like shading, subsurface skin, smooth rounded forms, big expressive eyes, soft global illumination, warm cozy color palette, gentle depth of field), matching library/style/ref-3d-ryan-01.jpg. the SAME man as in the reference avatar (library/style/ref-3d-ryan-01.jpg): young Vietnamese man, short spiky black hair, round friendly face, brown eyes, warm playful smile, wearing a plain grey crew-neck tee. He is the MAIN HOST of the channel: confident, warm. BOTH EYES OPEN, calm neutral friendly expression (no wink), body proportions identical to the approved turnaround. Standing neutral relaxed pose, medium shot (waist up) like a YouTube host, centered, facing camera, solid flat chroma green #00B140 background, even soft lighting, no shadow on background. Used as first AND last frame of every animation clip.
```

## Yêu cầu đầu ra
PNG 1920×1080 nền xanh phẳng + 1 bản toàn thân 1920×1080

## Tiêu chí đạt (tự kiểm trước khi nộp)
- [x] Giống avatar mẫu
- [x] Nền xanh tuyệt đối phẳng

## Nộp
Đặt file vào `output` + `meta.json` (xem `library/MUSE.md` §4). Đổi `status` thành `review`.
**Cổng duyệt:** Ryan duyệt thiết kế trước khi làm clip.

> GEN-REWORK: khung đầu/cuối clip phải MỞ CẢ HAI MẮT, mặt trung tính (bản nộp nháy mắt). Tỉ lệ thân phải khớp ảnh xoay MR-053 (bản toàn thân nộp có đầu nhỏ, thân to). Giữ nền xanh phẳng.
> MUSE-NOP: khung clip lam lai mo ca hai mat, mat trung tinh, khong nhay mat, ti le than khop anh xoay MR-053, thay ban wink cu trong PR #26.
