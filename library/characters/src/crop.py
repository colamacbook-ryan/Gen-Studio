# © 2026 Gen Labs — All rights reserved.
# Cắt sát các PNG mood (khung chung cho cả 16 mood của một nhân vật, để ghép không nhảy cỡ)
# và ghép khung trung tính trên nền chroma #00B140 1280x720 (keyframe cho AI video).
# Chạy sau export.js: python3 crop.py
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PAD = 32
GREEN = (0, 0xB1, 0x40, 255)
out = {}
for cid in ("nhi", "vy"):
    d = os.path.join(ROOT, cid, "stills")
    files = sorted(f for f in os.listdir(d) if f.endswith(".png") and "chroma" not in f)
    imgs = {f: Image.open(os.path.join(d, f)).convert("RGBA") for f in files}
    box = None
    for im in imgs.values():
        b = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    W, H = next(iter(imgs.values())).size
    box = (max(0, box[0] - PAD), max(0, box[1] - PAD), min(W, box[2] + PAD), min(H, box[3] + PAD))
    for f, im in imgs.items():
        im.crop(box).save(os.path.join(d, f), optimize=True)
    # khung chroma: dùng bbox của riêng neutral để nhân vật to và ở giữa
    n = Image.open(os.path.join(d, f"{cid}-neutral.png"))
    nb = n.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    nc = n.crop(nb)
    th = 600  # cao nhân vật trong khung 720
    tw = round(nc.width * th / nc.height)
    nc = nc.resize((tw, th), Image.LANCZOS)
    bg = Image.new("RGBA", (1280, 720), GREEN)
    bg.alpha_composite(nc, ((1280 - tw) // 2, 720 - th - 48))
    bg.convert("RGB").save(os.path.join(d, f"{cid}-neutral-chroma-1280x720.png"), optimize=True)
    out[cid] = {"crop_box_in_1920": box, "size": [box[2] - box[0], box[3] - box[1]]}
    print(cid, out[cid])
json.dump(out, open(os.path.join(ROOT, "crop-report.json"), "w"), indent=1)
