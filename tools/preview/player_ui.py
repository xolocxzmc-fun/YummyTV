"""Checks the YouTube-style bottom controls, quality switching and hidden native player UI."""
import asyncio, json
from playwright.async_api import async_playwright
import run as R
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1.5)
        await ctx.route('**/*', R.route)
        await ctx.add_init_script(path='mock.js')
        await ctx.add_init_script(path=R.WEB + '/inject.js')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        k = lambda key: pg.evaluate("k=>{tvKey(k,0);tvKeyUp(k)}", key)
        await pg.goto('https://old.yummyani.me/tvapp/index.html'); await pg.wait_for_timeout(800)
        await pg.evaluate("__ytv.Router.push('anime',{url:'velikiy-pritvorschik'})"); await pg.wait_for_timeout(800)
        await k('ok'); await pg.wait_for_timeout(5000)
        fr = [f for f in pg.frames if 'kodik' in f.url][0]
        print('auto quality picked inside player:', await fr.evaluate("window.__q"), '| app shows:', await pg.evaluate("__ytv.Player.qcur"), await pg.evaluate("__ytv.Player.qlist"))
        await k('ok'); await pg.wait_for_timeout(700)   # pause
        await pg.screenshot(path='shots/p1_paused.png')
        fr = [f for f in pg.frames if 'kodik' in f.url][0]
        red = await fr.evaluate("getComputedStyle(document.querySelector('.native-controls')).visibility")
        print('native UI visibility while paused:', red)
        print('video pinned above player UI:', await fr.evaluate("(()=>{const v=document.querySelector('video');const e=document.elementFromPoint(innerWidth-30, innerHeight-30);return getComputedStyle(v).position+' / top element at bottom-right: '+(e&&e.tagName)})()"))
        await k('ok'); await pg.wait_for_timeout(500)
        await k('down'); await pg.wait_for_timeout(400)
        print('focused after down:', await pg.evaluate("__ytv.Nav.cur.getAttribute('data-b')"))
        await pg.screenshot(path='shots/p2_controls.png')
        for _ in range(6): await k('right')
        print('on button:', await pg.evaluate("__ytv.Nav.cur.getAttribute('data-b')"))
        await k('ok'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='shots/p3_quality.png')
        print('quality chips:', await pg.evaluate("[...document.querySelectorAll('.sheet-row .chip2')].map(e=>e.textContent)"))
        await k('right'); await k('right')
        print('chip:', await pg.evaluate("__ytv.Nav.cur.textContent"))
        await k('ok'); await pg.wait_for_timeout(600)
        print('inside player now:', await fr.evaluate("window.__q"), '| saved setting:', await pg.evaluate("JSON.parse(localStorage.getItem('ytv.settings')).quality"))
        await k('ok'); await pg.wait_for_timeout(300)
        await pg.evaluate("__ytv.Player.go(1)"); await pg.wait_for_timeout(5000)
        fr = [f for f in pg.frames if 'kodik' in f.url][0]
        print('next episode keeps preference ->', await fr.evaluate("window.__q"))
        await k('down'); await k('right'); await k('right'); await k('right')
        print('on button:', await pg.evaluate("__ytv.Nav.cur.getAttribute('data-b')"))
        await k('ok'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='shots/p4_episodes.png')
        await k('up'); await pg.wait_for_timeout(100)
        print('up from sheet ->', await pg.evaluate("__ytv.Nav.cur.className"))
        t0 = await pg.evaluate("__ytv.Player.t"); await k('right'); await pg.wait_for_timeout(900)
        print('seek on bar: %.1f -> %.1f' % (t0, await pg.evaluate("__ytv.Player.t")))
        await k('back'); await pg.wait_for_timeout(100); await k('back'); await pg.wait_for_timeout(200)
        print('after back x2: controls open =', await pg.evaluate("__ytv.Player.panelOpen"), ' player open =', await pg.evaluate("__ytv.Player.open"))
        # non-kodik player: quality list comes from inside the player
        await k('ok'); await pg.wait_for_timeout(2500)   # reopen player from the anime page
        await pg.evaluate("__ytv.Player.openPanel('player')"); await k('right'); await k('ok'); await pg.wait_for_timeout(3000)
        print('player now:', await pg.evaluate("__ytv.Player.player"))
        await pg.evaluate("__ytv.Player.openPanel('quality')"); await pg.wait_for_timeout(800)
        print('qualities from inside player:', await pg.evaluate("[...document.querySelectorAll('.sheet-row .chip2')].map(e=>e.textContent)"))
        await k('ok'); await pg.wait_for_timeout(300)
        fr2 = [f for f in pg.frames if 'alloha' in f.url][0]
        print('picked inside second player:', await fr2.evaluate("window.__q"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
