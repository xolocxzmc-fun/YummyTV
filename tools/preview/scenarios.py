"""Deterministic checks of tricky user flows on a slow network (API delay 1 s)."""
import asyncio, json, sys
from playwright.async_api import async_playwright
import run as R
PAGE = None
DELAY = 1.0
async def route(r):
    u = r.request.url
    if u.startswith('https://api.yani.tv/'):
        await asyncio.sleep(DELAY)
        data = await PAGE.evaluate('u => window.__MOCK_URL(u)', u)
        return await r.fulfill(body=json.dumps({'response': data}), content_type='application/json')
    return await R.route(r)
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(('PASS ' if cond else 'FAIL ') + name, info)
STATE = """(()=>{const P=__ytv.Player,N=__ytv.Nav,R=__ytv.Router;return {open:P.open,ep:P.open&&P.a?P.cur().number:null,dub:P.open&&P.dub?P.dub.name:null,
  t:P.t,frames:document.querySelectorAll('.stage iframe').length,top:R.top().name,stack:R.stack.length,
  cur:N.cur&&document.body.contains(N.cur)?(N.cur.className+'|'+(N.cur.textContent||'').slice(0,20)):null,
  curHidden:!!(N.cur&&N.cur.closest('.off')), panel:P.panelOpen, cd:!!P.cdTimer}})()"""
async def main():
    global PAGE
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
        await ctx.add_init_script(script='window.__NET_MOCK = true;')
        await ctx.add_init_script(path='mock.js')
        await ctx.add_init_script(path=R.WEB + '/inject.js')
        await ctx.route('**/*', route)
        pg = await ctx.new_page(); PAGE = pg
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        k = lambda key, rep=0: pg.evaluate("([k,r])=>tvKey(k,r)", [key, rep])
        st = lambda: pg.evaluate(STATE)
        await pg.goto('https://old.yummyani.me/tvapp/index.html'); await pg.wait_for_timeout(2500)

        # 1. open anime, start ep 1, hammer "next episode" 10x fast, then prev 3x
        await pg.evaluate("__ytv.Router.push('anime',{url:'velikiy-pritvorschik'})"); await pg.wait_for_timeout(1500)
        await k('ok'); await pg.wait_for_timeout(2500)
        s0 = await st(); check('player starts', s0['open'] and s0['ep'] == '1', s0)
        for _ in range(10): await k('next'); await pg.wait_for_timeout(20)
        for _ in range(3): await k('prev'); await pg.wait_for_timeout(20)
        await pg.wait_for_timeout(3000)
        s1 = await st(); check('rapid episode switching lands on ep 8 with one player frame', s1['ep'] == '8' and s1['frames'] == 1, s1)
        check('status comes from the new episode (time restarted)', s1['t'] < 6, s1['t'])
        h = json.loads(await pg.evaluate("localStorage.getItem('ytv.hist')"))
        check('history points at ep 8', h['5445']['ep'] == '8', h['5445']['ep'])

        # 2. switch dubbing mid-episode (past the first 10 s), then next episode keeps the new dub
        await k('right'); await k('right', 1); await pg.wait_for_timeout(2500)
        await pg.evaluate("__ytv.Player.openPanel('dub')"); await pg.wait_for_timeout(200)
        await k('down'); await k('ok'); await pg.wait_for_timeout(2500)
        s2 = await st(); check('dub switched, same episode', s2['dub'] == 'Озвучка AniDUB' and s2['ep'] == '8', s2)
        check('dub switch continued from the same second', s2['t'] > 15, s2['t'])
        await k('next'); await pg.wait_for_timeout(2500)
        s3 = await st(); check('next episode keeps the chosen dub', s3['dub'] == 'Озвучка AniDUB' and s3['ep'] == '9', s3)

        # 3. leave player while the next one is still loading
        await k('next'); await pg.wait_for_timeout(50); await k('back'); await pg.wait_for_timeout(500)
        s4 = await st(); check('exit during loading: player closed, no frames', not s4['open'] and s4['frames'] == 0, s4)
        check('focus returns to the anime page', s4['top'] == 'anime' and s4['cur'] and not s4['curHidden'], s4['cur'])
        await pg.wait_for_timeout(4000)
        s4b = await st(); check('nothing re-opens later by itself', not s4b['open'], s4b)

        # 4. countdown to next episode, cancel with Back, then exit
        await k('ok'); await pg.wait_for_timeout(2500)
        await pg.evaluate("__ytv.Player.seekTo(147)"); await pg.wait_for_timeout(4500)
        s5 = await st(); check('countdown appears at the end', s5['cd'], s5)
        await k('back'); await pg.wait_for_timeout(1200)
        s6 = await st(); check('Back cancels countdown, stays in player', s6['open'] and not s6['cd'], s6)
        await k('back'); await pg.wait_for_timeout(400)

        # 5. open a card and immediately go back while it loads (slow network): focus must not jump
        await pg.evaluate("__ytv.Router.root('catalog')"); await pg.wait_for_timeout(2500)
        await k('down'); await k('right'); await k('right'); await k('right')
        await pg.wait_for_timeout(100)
        await k('ok'); await pg.wait_for_timeout(100); await k('back'); await pg.wait_for_timeout(3000)
        s7 = await st(); check('back during load: on catalog, focus visible', s7['top'] == 'catalog' and s7['cur'] and not s7['curHidden'], s7)

        # 6. long chain anime -> similar -> anime ... 14 times, then back all the way
        await pg.evaluate("__ytv.Router.root('home')"); await pg.wait_for_timeout(1500)
        await pg.evaluate("__ytv.Router.push('anime',{url:'frieren'})"); await pg.wait_for_timeout(2500)
        for i in range(14):
            ok = await pg.evaluate("""(()=>{const c=document.querySelector('.screen:not(.off) .rec .card, .screen:not(.off) .more .card');
                if(!c) return false; __ytv.Nav.focus(c); tvKey('ok',0); return true})()""")
            await pg.wait_for_timeout(1500)
            for _ in range(20):
                if await pg.evaluate("!!document.querySelector('.screen:not(.off) .rec .card')"): break
                await pg.wait_for_timeout(250)
        s8 = await st()
        live = await pg.evaluate("__ytv.Router.stack.filter(e=>!e.frozen).length")
        check('long chain: stack grows, live screens capped', s8['stack'] >= 14 and live <= 5, (s8['stack'], live))
        backs = 0
        while (await st())['stack'] > 1 and backs < 40:
            await k('back'); backs += 1; await pg.wait_for_timeout(700)
            s = await st()
            if not s['cur'] or s['curHidden']:
                await pg.wait_for_timeout(1500); s = await st()
                if not s['cur'] or s['curHidden']: check('focus after back #%d' % backs, False, s); break
        s9 = await st(); check('back through the whole chain returns home', s9['top'] == 'home' and s9['stack'] == 1, (backs, s9))

        # 7. low memory + app hidden/visible during playback
        await pg.evaluate("__ytv.Router.push('anime',{url:'velikiy-pritvorschik'})"); await pg.wait_for_timeout(1500)
        await k('ok'); await pg.wait_for_timeout(2500)
        await pg.evaluate("tvLifecycle('pause'); tvLowMemory(); tvLifecycle('resume')"); await pg.wait_for_timeout(1500)
        await k('right'); await pg.wait_for_timeout(1500)
        s10 = await st(); check('player survives low-memory + background', s10['open'] and s10['frames'] == 1, s10)
        await k('back')

        # 8. modal + back storms
        await pg.evaluate("__ytv.Router.root('catalog')"); await pg.wait_for_timeout(1500)
        await k('up'); await k('right'); await k('ok'); await pg.wait_for_timeout(300)
        for _ in range(6): await k('back'); await pg.wait_for_timeout(30)
        await pg.wait_for_timeout(400)
        s11 = await st(); modal = await pg.evaluate("!document.getElementById('modal').hidden")
        check('back storm closes modal and lands safely', not modal and s11['cur'] is not None, s11)
        check('no JS errors', not errs, errs[:3])
        print('\n%d/%d passed' % (sum(1 for r in results if r[1]), len(results)))
        await b.close()
asyncio.run(main())
