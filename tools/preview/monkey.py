"""Monkey test: thousands of random remote-control presses on top of a flaky network.
Checks invariants after every step. Usage: python monkey.py [steps] [seed]"""
import asyncio, json, random, sys, time, os
from playwright.async_api import async_playwright
import run as R

STEPS = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 1
rnd = random.Random(SEED)
PAGE = None
net = {'req': 0, 'fail': 0, 'hang': 0}

BLANK = '<!doctype html><html><body style="background:#111"></body></html>'

async def route(r):
    u = r.request.url
    if u.startswith('https://api.yani.tv/'):
        net['req'] += 1
        x = rnd.random()
        if x < 0.03:
            net['hang'] += 1
            await asyncio.sleep(25)
            try: await r.abort()
            except Exception: pass
            return
        if x < 0.08:
            net['fail'] += 1
            return await r.fulfill(status=503, body='{}')
        await asyncio.sleep(rnd.choice([0, 0.05, 0.2, 0.6, 1.5]))
        try:
            data = await PAGE.evaluate('u => window.__MOCK_URL(u)', u)
        except Exception as e:
            return await r.fulfill(status=404, body='{"error":"not found"}', content_type='application/json')
        return await r.fulfill(body=json.dumps({'response': data}), content_type='application/json')
    if 'alloha.yani.tv' in u:  # a player that never starts: exercises the watchdog
        return await r.fulfill(body=BLANK, content_type='text/html')
    return await R.route(r)

KEYS = [('left', 14), ('right', 18), ('up', 12), ('down', 14), ('ok', 18), ('back', 10), ('menu', 3),
        ('playpause', 2), ('next', 2), ('prev', 1), ('search', 1), ('char', 3), ('del', 1), ('info', 1)]
POP = [k for k, w in KEYS for _ in range(w)]

INV = """(()=>{const N=__ytv.Nav,P=__ytv.Player,R=__ytv.Router,e=[];const L=N.layer();
 const ts=R.top()&&R.top().el;const loading=!!document.querySelector('.screen:not(.off) .center-msg .spin')||(ts&&!N.first(ts));
 if(!P.open||P.panelOpen||document.getElementById('modal').hidden===false){
   if(!N.cur||!document.body.contains(N.cur)){ if(!loading) e.push('nofocus'); }
   else{ if(L&&!L.contains(N.cur)) e.push('focus-outside-layer'); if(N.cur.closest('.off')) e.push('focus-in-hidden');
         if(!N.cur.classList.contains('fx')) e.push('focus-not-highlighted'); }
 }
 if(document.querySelectorAll('.fx').length>1) e.push('multi-fx:'+document.querySelectorAll('.fx').length);
 if(P.open===document.getElementById('player').hidden) e.push('player-hidden-mismatch');
 const fr=document.querySelectorAll('.stage iframe').length; if(fr>1) e.push('iframes>1'); if(!P.open&&fr) e.push('iframe-leak');
 if(document.body.classList.contains('playing')!==P.open) e.push('playing-class');
 const live=R.stack.filter(x=>!x.frozen).length; if(live>5) e.push('live>5');
 if(P.panelOpen&&!P.open) e.push('panel-without-player');
 return {e:e,n:document.getElementsByTagName('*').length,stack:R.stack.length,top:R.top()&&R.top().name,pl:P.open,ep:P.open&&P.a?P.cur().number:null};})()"""

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
        errors = []
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await pg.goto('https://old.yummyani.me/tvapp/index.html')
        await pg.wait_for_timeout(1500)
        viol = {}; first = {}; maxk = 0; slow = 0; maxn = 0; tops = {}; player_steps = 0; eps = set()
        t0 = time.time()
        for i in range(STEPS):
            k = rnd.choice(POP)
            ch = rnd.choice('абвмнокт') if k == 'char' else ''
            rep = rnd.choice([0, 0, 0, 0, 1, 2, 5, 12]) if k in ('left', 'right', 'up', 'down') else 0
            if rnd.random() < 0.01:
                await pg.evaluate("tvLifecycle('pause')"); await pg.evaluate("tvLifecycle('resume')")
            if rnd.random() < 0.004:
                await pg.evaluate("tvLowMemory()")
            if rnd.random() < 0.02 and not (await pg.evaluate("__ytv.Player.open")):
                await pg.evaluate("v => __ytv.Router.root(v)", rnd.choice(['home', 'search', 'catalog', 'schedule', 'my', 'settings']))
            dt = await pg.evaluate("([k,r,c])=>{const t=performance.now();tvKey(k,r,c);return performance.now()-t}", [k, rep, ch])
            maxk = max(maxk, dt); slow += dt > 50
            await pg.wait_for_timeout(rnd.choice([20, 40, 60, 80, 120, 250, 600, 1500]))
            st = await pg.evaluate(INV)
            maxn = max(maxn, st['n']); tops[st['top']] = tops.get(st['top'], 0) + 1
            if st['pl']: player_steps += 1; eps.add(st['ep'])
            for v in st['e']:
                viol[v] = viol.get(v, 0) + 1
                if v not in first: first[v] = (i, k, st['top'], st['pl'])
        # settle and final checks
        await pg.wait_for_timeout(3000)
        final = await pg.evaluate("""(async()=>{let n=-1;try{const c=await caches.open('ytv-api-v1');n=(await c.keys()).length}catch(e){}
            return {cacheEntries:n, ls:JSON.stringify(localStorage).length, hist:Object.keys(JSON.parse(localStorage.getItem('ytv.hist')||'{}')).length,
                    heapMB: performance.memory? Math.round(performance.memory.usedJSHeapSize/1e6):null}})()""")
        print(f'steps={STEPS} seed={SEED} time={time.time()-t0:.0f}s net={net}')
        print('screens visited:', tops)
        print(f'player steps={player_steps} episodes seen={len(eps)} max key handler={maxk:.1f}ms slow(>50ms)={slow} max DOM={maxn}')
        print('final:', final)
        print('violations:', viol)
        print('first occurrence (step,key,screen,player):', first)
        print('errors:', len(errors)); [print('  ', e[:300]) for e in errors[:15]]
        await b.close()

asyncio.run(main())
