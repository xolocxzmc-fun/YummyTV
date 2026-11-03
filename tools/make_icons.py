"""Renders Android TV launcher assets from the site logo (app/src/main/assets/web/logo.svg),
following Google's TV icon guidelines (used by Android TV, Google TV and Xiaomi PatchWall):
  * banner 16:9 with the app name, every density: 160x90 .. 640x360 (mipmap-*/banner.png)
  * launcher icon, TV sizes 80..320 px (mipmap-*/ic_launcher.png, legacy)
  * adaptive icon (API 26+): coral background + logo foreground, 108dp canvas, logo inside the 72dp safe zone
Usage: python tools/make_icons.py   (needs playwright)"""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')
SVG = open(os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'web', 'logo.svg')).read()
SVG = SVG[SVG.index('<svg'):].replace('<svg ', '<svg width="100%" height="100%" ', 1)
CORAL = '#ff6666'
DENS = [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]

def logo(size_css):
    return '<div style="width:' + size_css + ';height:' + size_css + '">' + SVG + '</div>'

def page(body, w, h):
    return ('<html><head><style>html,body{margin:0;width:' + str(w) + 'px;height:' + str(h) + 'px;overflow:hidden;background:transparent}'
            '*{box-sizing:border-box}</style></head><body>' + body + '</body></html>')

def legacy_icon(px):
    return ('<div style="width:' + str(px) + 'px;height:' + str(px) + 'px;border-radius:' + str(round(px * 0.18)) + 'px;background:' + CORAL +
            ';display:flex;align-items:center;justify-content:center">' + logo('80%') + '</div>')

def foreground(px):  # 108dp canvas, logo 64dp -> well inside the 72dp safe zone
    return ('<div style="width:' + str(px) + 'px;height:' + str(px) + 'px;display:flex;align-items:center;justify-content:center">' +
            logo(str(round(px * 64 / 108)) + 'px') + '</div>')

def banner(w, h):
    s = w / 640.0
    return ('<div style="width:' + str(w) + 'px;height:' + str(h) + 'px;background:' + CORAL + ';display:flex;align-items:center;justify-content:center;'
            'font-family:Inter,Roboto,sans-serif">' + logo(str(round(178 * s)) + 'px') +
            '<div style="margin-left:' + str(round(30 * s)) + 'px;color:#1d1d24;line-height:1">'
            '<div style="font-size:' + str(round(92 * s)) + 'px;font-weight:800;letter-spacing:' + str(round(-2 * s)) + 'px">Yummy</div>'
            '<div style="font-size:' + str(round(44 * s)) + 'px;font-weight:700;margin-top:' + str(round(10 * s)) + 'px;letter-spacing:' + str(round(6 * s)) + 'px">ANIME TV</div>'
            '</div></div>')

async def shot(b, html, w, h, path, transparent):
    pg = await b.new_page(viewport={'width': w, 'height': h})
    await pg.set_content(page(html, w, h))
    await pg.wait_for_timeout(50)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    await pg.screenshot(path=path, omit_background=transparent)
    await pg.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, k in DENS:
            d = os.path.join(RES, 'mipmap-' + name)
            await shot(b, legacy_icon(round(80 * k)), round(80 * k), round(80 * k), os.path.join(d, 'ic_launcher.png'), True)
            await shot(b, foreground(round(108 * k)), round(108 * k), round(108 * k), os.path.join(d, 'ic_launcher_foreground.png'), True)
            await shot(b, banner(round(160 * k), round(90 * k)), round(160 * k), round(90 * k), os.path.join(d, 'banner.png'), False)
        await b.close()
    os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
    with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background" />\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n')
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FF6666</color>\n</resources>\n')

asyncio.run(main())
