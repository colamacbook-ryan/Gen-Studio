# © 2026 Gen Labs — All rights reserved. Nền thử 1280x720 (gradient + bokeh mềm), tự vẽ bằng code.
import sys, random
from PIL import Image, ImageDraw, ImageFilter
W, H = 1280, 720
im = Image.new("RGB", (W, H))
px = im.load()
for y in range(H):
    for x in range(W):
        t = y / H; u = x / W
        r = int(14 + 30 * t + 10 * u); g = int(52 + 60 * t); b = int(70 + 40 * (1 - u) + 20 * t)
        px[x, y] = (r, g, b)
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
random.seed(7)
for i in range(26):
    x, y, r = random.randint(0, W), random.randint(0, int(H * 0.7)), random.randint(20, 90)
    c = random.choice([(255, 217, 120), (47, 183, 176), (255, 244, 226)])
    d.ellipse((x - r, y - r, x + r, y + r), fill=c + (random.randint(18, 50),))
ov = ov.filter(ImageFilter.GaussianBlur(14))
im = Image.alpha_composite(im.convert("RGBA"), ov)
fl = ImageDraw.Draw(im)
fl.rectangle((0, int(H * 0.86), W, H), fill=(10, 40, 52, 255))
fl.line((0, int(H * 0.86), W, int(H * 0.86)), fill=(47, 183, 176, 255), width=3)
im.convert("RGB").save(sys.argv[1])
