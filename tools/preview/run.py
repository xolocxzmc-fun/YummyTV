import asyncio, json, time, sys, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', '..', 'app', 'src', 'main', 'assets', 'web')
OUT = sys.argv[1] if len(sys.argv) > 1 and __name__ == '__main__' else 'shots'
FAKE_PLAYER = '''<!doctype html><html><body style="margin:0;background:#000">
<video id=v src="https://old.yummyani.me/__video.webm" style="width:100vw;height:100vh;object-fit:cover" playsinline></video>
<div class="native-controls" style="position:absolute;left:0;right:0;bottom:0;height:90px;background:#e00;color:#fff;font:40px sans-serif">NATIVE UI</div>
<div class="quality-btn" style="position:absolute;right:20px;bottom:20px">360p</div>
<ul class="q-menu" style="display:none"><li onclick="window.__q='720p';document.querySelector('.quality-btn').textContent='720p'">720p<sup>HD</sup></li><li onclick="window.__q='480p';document.querySelector('.quality-btn').textContent='480p'">480p</li><li onclick="window.__q='360p';document.querySelector('.quality-btn').textContent='360p'">360p</li></ul>
<div class="play_button" style="position:absolute;left:50%;top:50%;width:80px;height:80px;margin:-40px;border-radius:50%;background:#fff3"
 onclick="document.getElementById('v').play();this.remove()"></div></body></html>'''
FAKE_BROKEN = '''<!doctype html><html><body style="margin:0;background:#000;color:#fff;font:20px sans-serif">
<div style="position:absolute;left:30%;top:30%;background:#223;padding:20px"><b>Упс. Ошибка!</b><br>Пожалуйста, перезагрузите плеер<br>
<button onclick="window.__reloads=(window.__reloads||0)+1">Перезагрузить плеер</button></div></body></html>'''
now = int(time.time() * 1000)
os.chdir(HERE)
if not os.path.exists('video.webm'):
    os.system('ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=960x540:rate=25,format=yuv420p" -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 150 -c:v libvpx-vp9 -b:v 250k -deadline realtime -cpu-used 8 -c:a libopus -b:a 32k video.webm')
if not os.path.exists('posters'):
    os.system(sys.executable + ' gen.py')
VIDEO = open('video.webm','rb').read()
HIST = {"5446": {"id": 5446, "url": "frieren", "title": "Провожающая в последний путь Фрирен", "poster": "https://static.yani.tv/posters/medium/5446.webp", "year": 2023,
                 "ep": "7", "t": 812, "d": 1420, "dub": "Озвучка AniLibria", "player": "Плеер Kodik", "w": {"1":1,"2":1,"3":1,"4":1,"5":1,"6":1}, "ts": now},
        "5445": {"id": 5445, "url": "velikiy-pritvorschik", "title": "Великий притворщик", "poster": "https://static.yani.tv/posters/medium/5445.webp", "year": 2020,
                 "ep": "3", "t": 20, "d": 150, "dub": "Озвучка AniLibria", "player": "Плеер Kodik", "w": {"1":1,"2":1}, "ts": now - 5000},
        "5452": {"id": 5452, "url": "monolog-farmacevta", "title": "Монолог фармацевта", "poster": "https://static.yani.tv/posters/medium/5452.webp", "year": 2023,
                 "ep": "12", "t": 1100, "d": 1420, "dub": "Озвучка AniDUB", "player": "Плеер Kodik", "w": {}, "ts": now - 9000}}
FAVS = {"5455": {"id": 5455, "url": "tetrad-smerti", "title": "Тетрадь смерти", "poster": "https://static.yani.tv/posters/medium/5455.webp", "year": 2006, "type": "ТВ", "ts": now}}

async def route(r):
    u = r.request.url
    if u.startswith('https://old.yummyani.me/tvapp/'):
        name = u.split('/tvapp/')[1].split('?')[0] or 'index.html'
        ct = {'html': 'text/html', 'js': 'application/javascript', 'css': 'text/css', 'svg': 'image/svg+xml'}.get(name.rsplit('.', 1)[-1], 'application/octet-stream')
        return await r.fulfill(path=f'{WEB}/{name}', content_type=ct if ct.startswith('image') else ct + '; charset=utf-8')
    if u.startswith('https://old.yummyani.me/__video.webm'):
        data = VIDEO
        rng = r.request.headers.get('range')
        if rng and rng.startswith('bytes='):
            a_, b_ = rng[6:].split('-')
            a_ = int(a_ or 0); b_ = int(b_) if b_ else len(data) - 1
            b_ = min(b_, len(data) - 1)
            return await r.fulfill(status=206, body=data[a_:b_ + 1], headers={'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
                'Content-Range': f'bytes {a_}-{b_}/{len(data)}', 'Content-Length': str(b_ - a_ + 1)})
        return await r.fulfill(status=200, body=data, headers={'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes'})
    if 'static.yani.tv/posters/' in u:
        pid = u.rsplit('/', 1)[1].split('.')[0]
        p = f'posters/{pid}.png'
        if os.path.exists(p): return await r.fulfill(path=p, content_type='image/png')
        return await r.fulfill(status=404, body='')
    if 'alloha.yani.tv' in u:  # behaves like a broken Alloha: error overlay + retry button, never plays
        return await r.fulfill(body=FAKE_BROKEN, content_type='text/html; charset=utf-8')
    if 'kodikplayer.com' in u or 'iframeCVH' in u:
        return await r.fulfill(body=FAKE_PLAYER, content_type='text/html; charset=utf-8')
    return await r.abort()

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1.5)
        await ctx.route('**/*', route)
        await ctx.add_init_script(path='mock.js')
        await ctx.add_init_script(path=f'{WEB}/inject.js')
        await ctx.add_init_script(script=f"try{{if(location.hostname==='old.yummyani.me'&&!localStorage.getItem('ytv.hist')){{localStorage.setItem('ytv.hist',{json.dumps(json.dumps(HIST))});localStorage.setItem('ytv.favs',{json.dumps(json.dumps(FAVS))});}}}}catch(e){{}}")
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
        await pg.goto('https://old.yummyani.me/tvapp/index.html')
        await pg.wait_for_timeout(900)
        async def key(k, n=1, wait=180):
            for _ in range(n):
                await pg.evaluate(f"tvKey('{k}',0);tvKeyUp('{k}')")
                await pg.wait_for_timeout(wait)
        async def shot(name, wait=450):
            await pg.wait_for_timeout(wait)
            await pg.screenshot(path=f'{OUT}/{name}.png')
            print('shot', name)
        await shot('01_home')
        await key('down', 2); await key('right', 2)
        await shot('02_home_rows')
        await key('left', 3)
        await shot('03_sidebar')
        await key('right'); await key('up', 3)
        await key('right'); await key('menu', wait=900)
        await shot('04_details')
        await key('down', wait=300)
        await shot('05_details_episodes')
        await key('up'); await key('right'); await key('ok', wait=500)
        await shot('06_dub_picker')
        await key('back')
        await pg.evaluate("__ytv.Router.root('search')"); await pg.wait_for_timeout(600)
        for ch in 'ма': await pg.evaluate(f"tvKey('char',0,'{ch}')")
        await pg.wait_for_timeout(700)
        await key('down', 2); await key('right', 3)
        await shot('08_search')
        await pg.evaluate("__ytv.Router.root('catalog')"); await pg.wait_for_timeout(900)
        await key('down'); await key('right')
        await shot('09_catalog')
        await key('up'); await key('right', 2); await key('ok', wait=500)
        await key('down', 2); await key('ok'); await key('right'); await key('ok')
        await shot('10_genres')
        await key('back', wait=300)
        await pg.evaluate("__ytv.Router.root('schedule')"); await pg.wait_for_timeout(900)
        await key('down')
        await shot('11_schedule')
        await pg.evaluate("__ytv.Router.root('settings')"); await pg.wait_for_timeout(600)
        await shot('12_settings')
        # player from details (episode 3 resume)
        await pg.evaluate("__ytv.Router.root('home')"); await pg.wait_for_timeout(700)
        await pg.evaluate("__ytv.Router.push('anime',{url:'velikiy-pritvorschik'})"); await pg.wait_for_timeout(800)
        await key('ok', wait=300)
        await shot('13_player_loading', 0)
        await pg.wait_for_timeout(2500)
        st0 = await pg.evaluate("({t:__ytv.Player.t, got:__ytv.Player.got})"); print('after start', st0)
        await key('ok', wait=600)
        p1 = await pg.evaluate("__ytv.Player.paused"); print('paused after OK', p1)
        await shot('14_player_paused', 200)
        await key('ok', wait=800)
        # seek right x3 -> +30
        t0 = await pg.evaluate("__ytv.Player.t")
        await key('right', 3, 80)
        await shot('15_player_seek', 100)
        await pg.wait_for_timeout(1500)
        t1 = await pg.evaluate("__ytv.Player.t"); print('seek', round(t0,1), '->', round(t1,1))
        await pg.wait_for_timeout(4200)
        await shot('16_player_skip', 0)
        sm = await pg.evaluate("__ytv.Player.skipMode"); print('skipMode', sm)
        await key('down', wait=400)
        await shot('17_player_panel')
        await pg.evaluate("__ytv.Player.renderSheet('dub')"); await pg.wait_for_timeout(300)
        await shot('18_player_panel_dub')
        await key('right'); await key('ok', wait=1500)
        info = await pg.evaluate("({dub:__ytv.Player.dub.name, ep:__ytv.Player.cur().number, t:__ytv.Player.t})"); print('after dub switch', info)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("__ytv.Player.seekTo(147)"); await pg.wait_for_timeout(4500)
        await shot('19_player_next', 0)
        cd = await pg.evaluate("!!__ytv.Player.cdTimer"); print('countdown', cd)
        await key('ok', wait=1500)
        print('after next', await pg.evaluate("__ytv.Player.cur().number"))
        await key('back', wait=800)
        await shot('20_details_after', 300)
        print('hist', await pg.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('ytv.hist'))['5445'])"))
        print('ERRORS', errs[:20])
        await b.close()
if __name__ == "__main__": asyncio.run(main())
