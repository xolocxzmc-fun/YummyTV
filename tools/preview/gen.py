import re, json, colorsys, textwrap
from PIL import Image, ImageDraw, ImageFont
src = open('mock.js').read()
titles = re.findall(r"\['[^']+', '([^']+)', (\d+), '(\w+)'", src)
F = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FR = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
import os; os.makedirs('posters', exist_ok=True)
for i, (t, y, ty) in enumerate(titles):
    pid = 5445 + i
    W, H = 368, 520
    h = (i * 0.137) % 1
    c1 = [int(v * 255) for v in colorsys.hls_to_rgb(h, 0.30, 0.55)]
    c2 = [int(v * 255) for v in colorsys.hls_to_rgb((h + 0.08) % 1, 0.12, 0.5)]
    im = Image.new('RGB', (W, H)); px = im.load()
    for yy in range(H):
        k = yy / H
        col = tuple(int(c1[j] * (1 - k) + c2[j] * k) for j in range(3))
        for xx in range(W): px[xx, yy] = col
    d = ImageDraw.Draw(im)
    # abstract shapes for "key art" feel
    lc = [int(v * 255) for v in colorsys.hls_to_rgb((h + 0.5) % 1, 0.6, 0.6)]
    d.ellipse([W * 0.35, H * 0.08, W * 1.25, H * 0.68], fill=tuple(int(c1[j] * 0.6 + lc[j] * 0.4) for j in range(3)))
    d.ellipse([-W * 0.3, H * 0.45, W * 0.5, H * 1.1], fill=tuple(int(c2[j] * 0.5 + lc[j] * 0.25) for j in range(3)))
    f = ImageFont.truetype(F, 40)
    lines = textwrap.wrap(t, 13)[:4]
    yy = H - 40 - len(lines) * 48
    for ln in lines:
        d.text((26, yy), ln, font=f, fill=(255, 255, 255)); yy += 48
    d.text((26, 28), (y if y != '0' else 'Скоро') + ('  ·  ФИЛЬМ' if ty == 'movie' else ''), font=ImageFont.truetype(FR, 24), fill=(255, 255, 255, 200))
    im.save(f'posters/{pid}.png')
print(len(titles), 'posters')
