"""Speed check on a simulated weak TV: CPU slowed 6x, every API answer delayed 2 s."""
import asyncio, json, time
from playwright.async_api import async_playwright
import run as R
PAGE = None
async def route(r):
    u = r.request.url
    if u.startswith('https://api.yani.tv/'):
        await asyncio.sleep(2.0)
        data = await PAGE.evaluate('u => window.__MOCK_URL(u)', u)
        return await r.fulfill(body=json.dumps({'response': data}), content_type='application/json')
    return await R.route(r)
async def wait_for(pg, js, limit=20):
    t = time.time()
    while time.time() - t < limit:
        if await pg.evaluate(js): return time.time() - t
        await asyncio.sleep(0.02)
    return None
async def main():
    global PAGE
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
        await ctx.add_init_script(script='window.__NET_MOCK = true;')
        await ctx.add_init_script(path='mock.js')
        await ctx.route('**/*', route)
        pg = await ctx.new_page(); PAGE = pg
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 6})
        HOME = "document.querySelectorAll('.rows .card').length > 10"
        t = time.time(); await pg.goto('https://old.yummyani.me/tvapp/index.html')
        print('1st launch (empty cache): home rows in', round(await wait_for(pg, HOME) + (time.time() - t) * 0, 2), 's after load')
        await pg.wait_for_timeout(2500)
        await pg.reload()
        print('2nd launch (from cache):  home rows in', round(await wait_for(pg, HOME), 2), 's')
        # details: focus a card, dwell, open
        await pg.evaluate("tvKey('down',0);tvKeyUp('down')"); await pg.evaluate("tvKey('right',0);tvKeyUp('right')")
        await pg.wait_for_timeout(2600)   # dwell -> prefetch finishes (2 s network)
        await pg.evaluate("tvKey('ok',0);tvKeyUp('ok')")
        print('open anime page after hovering card:', round(await wait_for(pg, "!!document.querySelector('.acts .btn')"), 2), 's')
        await pg.evaluate("tvKey('back',0);tvKeyUp('back')"); await pg.wait_for_timeout(300)
        await pg.evaluate("tvKey('right',0);tvKeyUp('right')"); await pg.evaluate("tvKey('right',0);tvKeyUp('right')"); await pg.evaluate("tvKey('ok',0);tvKeyUp('ok')")
        print('open anime page immediately (no hover):', round(await wait_for(pg, "!!document.querySelector('.acts .btn')"), 2), 's')
        ts = []
        for k in ['down', 'down', 'up', 'right', 'right', 'left', 'down', 'right', 'right', 'right', 'up', 'up']:
            ts.append(await pg.evaluate("k=>{const t=performance.now();tvKey(k,0);tvKeyUp(k);return performance.now()-t}", k))
            await pg.wait_for_timeout(120)
        print('key handling on 6x slower CPU: avg %.1f ms, max %.1f ms' % (sum(ts) / len(ts), max(ts)))
        await pg.evaluate("tvKey('back',0);tvKeyUp('back')"); await pg.wait_for_timeout(300)
        await pg.evaluate("tvKey('back',0);tvKeyUp('back')"); await pg.evaluate("tvKey('ok',0);tvKeyUp('ok')")
        t2 = await wait_for(pg, "document.querySelector('#side .si.fx[data-v]')!==null")
        await pg.evaluate("__ytv.Router.root('catalog')")
        print('catalog (1st time):', round(await wait_for(pg, "document.querySelectorAll('.grid .card').length>10"), 2), 's')
        await pg.evaluate("__ytv.Router.root('home')"); await pg.wait_for_timeout(200)
        await pg.evaluate("__ytv.Router.root('catalog')")
        print('catalog (again):   ', round(await wait_for(pg, "document.querySelectorAll('.grid .card').length>10"), 2), 's')
        await b.close()
asyncio.run(main())
