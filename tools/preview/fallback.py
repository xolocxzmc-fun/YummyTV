"""A broken player (like Alloha showing 'Упс. Ошибка!') must not leave the user stuck."""
import asyncio, time
from playwright.async_api import async_playwright
import run as R
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
        await ctx.route('**/*', R.route)
        await ctx.add_init_script(path='mock.js')
        await ctx.add_init_script(path=R.WEB + '/inject.js')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        k = lambda key: pg.evaluate("k=>{tvKey(k,0);tvKeyUp(k)}", key)
        await pg.goto('https://old.yummyani.me/tvapp/index.html'); await pg.wait_for_timeout(800)
        await pg.evaluate("__ytv.Router.push('anime',{url:'velikiy-pritvorschik'})"); await pg.wait_for_timeout(800)
        await k('ok'); await pg.wait_for_timeout(4000)
        await k('right'); await k('right'); await pg.wait_for_timeout(1500)
        t_before = await pg.evaluate("__ytv.Player.t")
        await pg.evaluate("__ytv.Player.openPanel('player')"); await k('right')
        print('switching to:', await pg.evaluate("__ytv.Nav.cur.textContent"), 'at', round(t_before, 1))
        await k('ok'); t0 = time.time()
        while time.time() - t0 < 25:
            st = await pg.evaluate("({p:__ytv.Player.player, got:__ytv.Player.got, t:__ytv.Player.t})")
            if st['got'] and 'Alloha' not in st['p']: break
            await asyncio.sleep(0.5)
        print('after %.1fs: player=%s playing=%s t=%.1f' % (time.time() - t0, st['p'], st['got'], st['t']))
        print('toast:', await pg.evaluate("document.getElementById('toast').textContent"))
        fr = [f for f in pg.frames if 'alloha' in f.url]
        print('errors:', errs)
        await b.close()
asyncio.run(main())
