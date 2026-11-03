/* Yummy TV — remote-first client for YummyAnime (api.yani.tv).
 * Plain ES2017, no frameworks: runs fast on old Android TV WebViews.
 * Navigation never uses DOM focus: the Android shell sends every remote key to tvKey(). */
(function () {
'use strict';

var API = 'https://api.yani.tv';
var BRIDGE = window.AndroidTV || null;

// ============================================================ utils
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function debounce(fn, ms) {
  var t = null;
  var d = function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  d.flush = function () { clearTimeout(t); fn(); };
  return d;
}
function fmtT(s) {
  s = Math.max(0, Math.floor(s || 0));
  var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
}
function plural(n, a, b, c) {
  var m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
  return c;
}
function https(u) { u = u || ''; return u.indexOf('//') === 0 ? 'https:' + u : u; }
var REM = 16;
function remPx(n) { return n * REM; }
function epNum(n) { var x = parseFloat(n); return isNaN(x) ? 0 : x; }

var store = {
  get: function (k, d) {
    try { var v = localStorage.getItem('ytv.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem('ytv.' + k, JSON.stringify(v)); } catch (e) {} }
};

var S = Object.assign({ autoNext: true, skipOp: false, anim: true, scale: 1, player: 'auto', lastDub: '', quality: 'auto', clean: true }, store.get('settings', {}));
function saveS() { store.set('settings', S); }

var ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor" stroke="none"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12zM13 9l6 6M19 9l-6 6"/></svg>',
  voice: '<svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  mic2: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3"/></svg>',
  tv: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M5 4h2.5v16H5zM20 4L9 12l11 8z" fill="currentColor" stroke="none"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16.5 4H19v16h-2.5zM4 4l11 8-11 8z" fill="currentColor" stroke="none"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  hd: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9v6M10 9v6M6 12h4M14 9v6h2a3 3 0 0 0 0-6z"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>'
};

var toastT = null;
function toast(msg, ms) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
}

// ============================================================ API
// Memory cache (promises, so parallel callers share one request) + persistent Cache Storage
// (survives restarts: the app opens instantly with the last known data, then refreshes).
var cache = new Map();
function qs(params) {
  var p = [];
  if (params) Object.keys(params).forEach(function (k) {
    var v = params[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
    p.push(encodeURIComponent(k) + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : v));
  });
  return p.length ? '?' + p.join('&') : '';
}
function fetchTimeout(url, ms) {
  var ctl = window.AbortController ? new AbortController() : null;
  var t;
  var timeout = new Promise(function (_, rej) {
    t = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error('timeout')); }, ms);
  });
  var req = fetch(url, { headers: { 'Accept': 'image/webp,image/*;q=0.8', 'Accept-Language': 'ru' }, signal: ctl ? ctl.signal : undefined });
  return Promise.race([req, timeout]).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
}
async function netGet(url) {
  if (window.__MOCK_API) return window.__MOCK_API(url);
  var lastErr = null;
  for (var i = 0; i < 3; i++) {
    var r;
    try {
      r = await fetchTimeout(url, i === 0 ? 8000 : 12000);
    } catch (e) {
      lastErr = e;
      if (!navigator.onLine) { await sleep(1500); }
      await sleep(400 * (i + 1));
      continue;
    }
    if (r.status === 429 || r.status >= 500) { lastErr = new Error('HTTP ' + r.status); await sleep(1000 * (i + 1)); continue; }
    if (r.status === 404) throw new Error('Не найдено');
    var j;
    try { j = await r.json(); } catch (e) { lastErr = e; continue; }
    if (j && j.error) throw new Error(j.error_title || j.error);
    return j.response;
  }
  if (lastErr && /timeout|abort/i.test(String(lastErr.message || lastErr.name))) throw new Error('Сервер долго не отвечает. Проверьте интернет');
  throw new Error(navigator.onLine === false ? 'Нет подключения к интернету' : 'Не удалось загрузить данные');
}
function api(path, params, ttl) {
  if (ttl == null) ttl = 300000;
  var url = API + path + qs(params);
  var c = cache.get(url);
  if (c && Date.now() - c.t < ttl) return c.p;
  var p = netGet(url);
  cache.set(url, { t: Date.now(), p: p });
  p.catch(function () { if (cache.get(url) && cache.get(url).p === p) cache.delete(url); });
  while (cache.size > 60) cache.delete(cache.keys().next().value);
  return p;
}

var PC = null;
function pcache() {
  if (!PC) PC = (window.caches && window.isSecureContext !== false ? caches.open('ytv-api-v1') : Promise.resolve(null)).catch(function () { return null; });
  return PC;
}
async function pget(url) {
  try {
    var c = await pcache();
    if (!c) return null;
    var r = await c.match(url);
    if (!r) return null;
    return { t: +r.headers.get('x-ts') || 0, data: await r.json() };
  } catch (e) { return null; }
}
var putCount = 0;
function pput(url, data) {
  pcache().then(function (c) {
    if (!c) return;
    return c.put(url, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-ts': String(Date.now()) } }));
  }).then(function () { if (++putCount % 20 === 0) prunePC(); }).catch(function () {});
}
// Keeps the persistent cache small: newest 80 answers, nothing older than 14 days.
async function prunePC() {
  try {
    var c = await pcache();
    if (!c) return;
    var reqs = await c.keys(), list = [];
    for (var i = 0; i < reqs.length; i++) {
      var r = await c.match(reqs[i]);
      list.push({ req: reqs[i], t: r ? +r.headers.get('x-ts') || 0 : 0 });
    }
    list.sort(function (a, b) { return b.t - a.t; });
    var now = Date.now();
    for (var j = 0; j < list.length; j++) {
      if (j >= 80 || now - list[j].t > 14 * 864e5) await c.delete(list[j].req);
    }
  } catch (e) {}
}
window.tvLowMemory = function () {
  cache.clear();
  Pool.clear();
  prefetched = {};
};
function sig(d) {
  try { var s = JSON.stringify(d); return s.length + ':' + s.slice(0, 200) + s.slice(-200); } catch (e) { return Math.random(); }
}
// Stale-while-revalidate: returns saved data at once (if any) and refreshes it in the background.
// onFresh(data) is called only when the refreshed data differs from what was returned.
async function apiSWR(path, params, maxAge, onFresh) {
  var url = API + path + qs(params);
  var mem = cache.get(url);
  if (mem && Date.now() - mem.t < maxAge) return mem.p;
  var stored = await pget(url);
  if (stored) {
    cache.set(url, { t: stored.t, p: Promise.resolve(stored.data) });
    if (Date.now() - stored.t >= maxAge) {
      var before = sig(stored.data);
      api(path, params, 0).then(function (d) {
        pput(url, d);
        if (onFresh && sig(d) !== before) onFresh(d);
      }).catch(function () { /* keep showing saved data */ });
    }
    return stored.data;
  }
  var d = await api(path, params, maxAge);
  pput(url, d);
  return d;
}
function getAnime(key, onFresh) { return apiSWR('/anime/' + encodeURIComponent(key), { need_videos: true }, 15 * 60000, onFresh); }

// Warm up the next screen while the user is looking at a card.
var prefetchT = null, prefetched = {};
function prefetchCard(el) {
  clearTimeout(prefetchT);
  if (!el || !el.classList.contains('card')) return;
  prefetchT = setTimeout(function () {
    var key = el.getAttribute('data-url') || el.getAttribute('data-id');
    if (!key || prefetched[key]) return;
    if (Object.keys(prefetched).length > 300) prefetched = {};
    prefetched[key] = 1;
    getAnime(key).catch(function () { delete prefetched[key]; });
    var a = Pool.get(+el.getAttribute('data-id'));
    if (a) { var im = new Image(); im.src = poster(a, 'big'); }
  }, 450);
}

// ============================================================ data helpers
var Pool = new Map(); // anime_id -> anime object (for spotlight / fast details header)
function poster(a, size) {
  var p = (a && a.poster) || {};
  return https(p[size || 'medium'] || p.big || p.medium || p.small || p.fullsize || '');
}
function typeName(a) { return a.type ? (a.type.shortname || a.type.name || '') : ''; }
function rating(a) {
  var r = a.rating;
  var v = r && typeof r === 'object' ? r.average : r;
  return v ? (Math.round(v * 10) / 10).toFixed(1) : '';
}
function metaShort(a) {
  var parts = [];
  if (a.year) parts.push(a.year);
  var t = typeName(a);
  if (t) parts.push(t);
  var r = rating(a);
  if (r) parts.push('★ ' + r);
  return parts.join(' · ');
}

var Hist = {
  data: store.get('hist', {}),
  get: function (id) { return this.data[id]; },
  upd: function (a, patch) {
    var id = a.anime_id;
    var e = this.data[id] || { id: id, w: {} };
    e.url = a.anime_url || e.url;
    e.title = a.title || e.title;
    e.poster = poster(a) || e.poster;
    if (a.year) e.year = a.year;
    Object.assign(e, patch);
    e.ts = Date.now();
    this.data[id] = e;
    this.trim();
    this.save();
    return e;
  },
  seen: function (id, ep) { var e = this.data[id]; return !!(e && e.w && e.w[ep]); },
  list: function () {
    var self = this;
    return Object.keys(this.data).map(function (k) { return self.data[k]; })
      .filter(function (e) { return e.ep; })
      .sort(function (a, b) { return b.ts - a.ts; });
  },
  trim: function () {
    var l = this.list();
    if (l.length > 300) { var self = this; l.slice(300).forEach(function (e) { delete self.data[e.id]; }); }
  },
  save: debounce(function () { store.set('hist', Hist.data); }, 500),
  clear: function () { this.data = {}; store.set('hist', {}); }
};

var Favs = {
  data: store.get('favs', {}),
  has: function (id) { return !!this.data[id]; },
  toggle: function (a) {
    var id = a.anime_id;
    if (this.data[id]) delete this.data[id];
    else this.data[id] = { id: id, url: a.anime_url, title: a.title, poster: poster(a), year: a.year, type: typeName(a), ts: Date.now() };
    store.set('favs', this.data);
    return !!this.data[id];
  },
  list: function () {
    var self = this;
    return Object.keys(this.data).map(function (k) { return self.data[k]; }).sort(function (a, b) { return b.ts - a.ts; });
  }
};

function fromStored(e) {
  return { anime_id: e.id, anime_url: e.url, title: e.title, poster: { medium: e.poster }, year: e.year };
}

// ============================================================ HTML builders
function card(a, o) {
  o = o || {};
  if (!a || !a.anime_id) return '';
  if (!Pool.has(a.anime_id) || a.description) {
    if (Pool.size > 1500) { var k = Pool.keys(); for (var i = 0; i < 500; i++) Pool.delete(k.next().value); }
    Pool.set(a.anime_id, a);
  }
  var sub = o.sub != null ? o.sub : metaShort(a);
  var prog = o.prog ? '<div class="pb"><i style="width:' + Math.min(100, Math.round(o.prog * 100)) + '%"></i></div>' : '';
  var badge = o.badge ? '<span class="bdg' + (o.badgeAcc ? ' acc' : '') + '">' + esc(o.badge) + '</span>' : '';
  return '<div class="card f" data-act="' + (o.act || 'anime') + '" data-id="' + a.anime_id + '" data-url="' + esc(a.anime_url || '') + '"' +
    (o.ep ? ' data-ep="' + esc(o.ep) + '"' : '') + (o.dub ? ' data-dub="' + esc(o.dub) + '"' : '') + (o.player ? ' data-player="' + esc(o.player) + '"' : '') + '>' +
    '<div class="ps"><img loading="lazy" decoding="async" alt="" src="' + esc(poster(a)) + '" onerror="this.style.visibility=\'hidden\'">' + badge + prog + '</div>' +
    '<div class="ct">' + esc(a.title) + '</div><div class="cs">' + esc(sub) + '</div></div>';
}
function section(title, inner, extra) {
  return '<section class="sec">' + (title ? '<h2>' + title + '</h2>' : '') + '<div class="hs" data-nav="row"' + (extra || '') + '>' + inner + '</div></section>';
}
function loadingHtml() { return '<div class="center-msg"><div class="spin" style="margin:0 auto"></div></div>'; }
function errorHtml(e) {
  return '<div class="center-msg">' + esc((e && e.message) || 'Ошибка загрузки') +
    '<br><div data-nav="row" style="display:inline-flex"><div class="btn f" data-act="retry">Повторить</div></div></div>';
}

// ============================================================ navigation engine
var Nav = {
  cur: null,
  layer: function () {
    if (Modal.open) return Modal.el;
    if (Player.open) return Player.panelOpen ? Player.ctrlEl : null;
    return document.getElementById('app');
  },
  items: function (c) {
    var out = [], i;
    var ch = c.children;
    // fast path: focusables are direct children (rows, grids, lists)
    if (ch.length && ch[0].classList.contains('f')) {
      for (i = 0; i < ch.length; i++) if (ch[i].classList.contains('f')) out.push(ch[i]);
      return out;
    }
    var all = c.querySelectorAll('.f');
    for (i = 0; i < all.length; i++) if (all[i].closest('[data-nav]') === c) out.push(all[i]);
    return out;
  },
  focus: function (el, noScroll) {
    if (!el || !document.body.contains(el)) return;
    var layer = this.layer();
    if (el.closest('.off') || (layer && !layer.contains(el)) || (!layer && Player.open)) {
      // A background screen finished loading: remember the spot, don't steal focus.
      var owner = Router.ownerOf(el);
      if (owner) owner.focusEl = el;
      return;
    }
    if (this.cur && this.cur !== el) this.cur.classList.remove('fx');
    this.cur = el;
    el.classList.add('fx');
    var c = el.closest('[data-nav]');
    if (c) c._last = el;
    if (!noScroll) ensureVisible(el);
    if (el._onFocus) el._onFocus(el);
    prefetchCard(el);
    var inSide = !!el.closest('#side');
    document.body.classList.toggle('side-open', inSide && !Player.open);
    if (!inSide && !Modal.open && !Player.open) {
      var v = Router.top();
      if (v) { v.focusEl = el; if (v.view.onFocus) v.view.onFocus(el); }
    }
  },
  first: function (root) {
    if (!root) return null;
    var c = root.querySelectorAll('[data-nav]');
    for (var i = 0; i < c.length; i++) {
      var it = this.items(c[i]);
      if (it.length) return c[i].getAttribute('data-nav') === 'row' && c[i]._last && it.indexOf(c[i]._last) >= 0 ? c[i]._last : it[0];
    }
    return null;
  },
  restore: function () {
    var v = Router.top();
    var el = v && v.focusEl && document.body.contains(v.focusEl) ? v.focusEl : this.first(v && v.el);
    this.focus(el || this.first($('#side')));
  },
  gridCols: function (items, c) {
    var n = +c.getAttribute('data-cols');
    if (n) return n;
    if (items.length < 2) return 1;
    var top = items[0].offsetTop, k = 1;
    while (k < items.length && items[k].offsetTop === top) k++;
    return k;
  },
  move: function (dir) {
    var layer = this.layer();
    if (!layer) return;
    var cur = this.cur;
    if (!cur || !layer.contains(cur)) { this.focus(this.first(layer)); return; }
    var c = cur.closest('[data-nav]');
    if (!c) return;
    var items = this.items(c), i = items.indexOf(cur), type = c.getAttribute('data-nav'), t = null;
    if (type === 'row') {
      if (dir === 'left') t = items[i - 1]; else if (dir === 'right') t = items[i + 1];
    } else if (type === 'col') {
      if (dir === 'up') t = items[i - 1]; else if (dir === 'down') t = items[i + 1];
    } else if (type === 'grid') {
      var cols = this.gridCols(items, c), col = i % cols;
      if (dir === 'left' && col > 0) t = items[i - 1];
      else if (dir === 'right' && col < cols - 1) t = items[i + 1];
      else if (dir === 'up' && i - cols >= 0) t = items[i - cols];
      else if (dir === 'down') {
        if (i + cols < items.length) t = items[i + cols];
        else if (Math.floor(i / cols) < Math.floor((items.length - 1) / cols)) t = items[items.length - 1];
        if (c._onEnd && i + cols * 3 >= items.length) c._onEnd();
      }
    }
    if (t) { this.focus(t); return; }
    if (c._edge && c._edge(dir)) return;
    var nc = this.findNext(c, cur, dir, layer);
    if (nc) this.focus(this.entry(nc, cur, dir));
  },
  findNext: function (c, cur, dir, layer) {
    var r = cur.getBoundingClientRect(), cr = c.getBoundingClientRect();
    var all = layer.querySelectorAll('[data-nav]'), best = null, bs = Infinity;
    for (var k = 0; k < all.length; k++) {
      var n = all[k];
      if (n === c || n.closest('.off') || n.closest('[hidden]')) continue;
      var R = n.getBoundingClientRect();
      if (!R.width && !R.height) continue;
      if (!this.items(n).length) continue;
      var main, cross;
      if (dir === 'up') { if (R.bottom > cr.top + 2) continue; main = cr.top - R.bottom; cross = gap(R.left, R.right, r.left, r.right); }
      else if (dir === 'down') { if (R.top < cr.bottom - 2) continue; main = R.top - cr.bottom; cross = gap(R.left, R.right, r.left, r.right); }
      else if (dir === 'left') { if (R.right > cr.left + 2) continue; main = cr.left - R.right; cross = gap(R.top, R.bottom, r.top, r.bottom); }
      else { if (R.left < cr.right - 2) continue; main = R.left - cr.right; cross = gap(R.top, R.bottom, r.top, r.bottom); }
      var s = main + cross * 3;
      if (s < bs) { bs = s; best = n; }
    }
    return best;
  },
  entry: function (n, cur, dir) {
    var items = this.items(n);
    if (n.id === 'side-nav') return $('.si.cur', n) || items[0];
    if (n.getAttribute('data-nav') === 'row' && n._last && items.indexOf(n._last) >= 0) return n._last;
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var vert = dir === 'up' || dir === 'down', best = items[0], bd = Infinity;
    for (var i = 0; i < items.length; i++) {
      var R = items[i].getBoundingClientRect(), x = R.left + R.width / 2, y = R.top + R.height / 2;
      var d = vert ? Math.abs(x - cx) + Math.abs(y - cy) * 0.5 : Math.abs(y - cy) + Math.abs(x - cx) * 0.5;
      if (d < bd) { bd = d; best = items[i]; }
    }
    return best;
  }
};
function gap(a1, a2, b1, b2) { return a2 < b1 ? b1 - a2 : (b2 < a1 ? a1 - b2 : 0); }

// Keeps the focused element on screen. Tracks target scroll positions itself so
// rapid key presses stay correct even while a smooth scroll is still running.
function ensureVisible(el) {
  var hs = el.closest('.hs');
  if (hs) {
    var pad = remPx(2.5), cur = hs._t != null ? hs._t : hs.scrollLeft, l = el.offsetLeft, w = el.offsetWidth, nt = cur;
    if (l - cur < pad) nt = Math.max(0, l - pad);
    else if (l + w - cur > hs.clientWidth - pad) nt = l + w - hs.clientWidth + pad;
    if (nt !== cur) { hs._t = nt; hs.scrollLeft = nt; }
  }
  var vs = el.closest('.vs');
  if (vs) {
    var vr = vs.getBoundingClientRect();
    var curT = vs._t != null ? vs._t : vs.scrollTop;
    var shift = vs.scrollTop; // rects are measured at the live scroll position
    var sec = el.closest('.sec');
    var firstSec = !!sec && vs.querySelector('.sec') === sec;
    var er = el.getBoundingClientRect();
    var top = er.top - vr.top + shift, bot = er.bottom - vr.top + shift;
    if (sec) {
      var sr = sec.getBoundingClientRect();
      if (sr.height < vr.height * 0.8) { top = sr.top - vr.top + shift; bot = Math.max(bot, sr.bottom - vr.top + shift); }
    }
    var m = remPx(1.2), nt2 = curT;
    if (vs.hasAttribute('data-snap') && sec) nt2 = top - remPx(0.3);
    else if ((el.closest('[data-top]') || firstSec) && bot + m <= vr.height) nt2 = 0;
    else if (top - m < curT) nt2 = Math.max(0, top - m);
    else if (bot + m > curT + vr.height) nt2 = bot + m - vr.height;
    nt2 = Math.max(0, Math.min(nt2, vs.scrollHeight - vr.height));
    if (nt2 !== curT || vs._t == null) { vs._t = nt2; vs.scrollTop = nt2; }
  }
}

// ============================================================ modal
var Modal = {
  open: false, el: null, prev: null, onClose: null,
  show: function (html, o) {
    o = o || {};
    if (this.open) this.close(true);
    this.prev = Nav.cur;
    this.el = $('#modal');
    this.el.innerHTML = '<div class="mbox ' + (o.cls || '') + '">' + html + '</div>';
    this.el.hidden = false;
    this.open = true;
    this.onClose = o.onClose || null;
    var f = (o.focus && $(o.focus, this.el)) || $('.f.sel', this.el) || $('.f', this.el);
    Nav.focus(f);
  },
  close: function (silent) {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.el.innerHTML = '';
    var cb = this.onClose;
    this.onClose = null;
    if (this.prev && document.body.contains(this.prev)) Nav.focus(this.prev, true);
    else if (!Player.open) Nav.restore();
    if (cb && !silent) cb();
  }
};

// Generic list picker. options: [{v, t, sub}]
function pick(title, options, o) {
  o = o || {};
  var multi = !!o.multi, sel = {};
  (o.selected || []).forEach(function (v) { sel[v] = true; });
  var grid = o.grid;
  var html = '<h3>' + esc(title) + '</h3><div class="ml vs"><div class="' + (grid ? 'mgrid' : '') + '" data-nav="' + (grid ? 'grid' : 'col') + '">' +
    options.map(function (op, i) {
      return '<div class="opt f' + (sel[op.v] ? ' sel' : '') + '" data-i="' + i + '">' + (multi || o.checks ? '<span class="ck"></span>' : '') +
        '<span>' + esc(op.t) + '</span>' + (op.sub ? '<span class="on">' + esc(op.sub) + '</span>' : '') + '</div>';
    }).join('') + '</div></div>' +
    (multi ? '<div class="mfoot" data-nav="row"><div class="btn pri f" data-x="ok">Применить</div><div class="btn f" data-x="clear">Сбросить</div></div>' : '');
  Modal.show(html, { cls: o.wide ? 'wide' : '' });
  $$('.opt', Modal.el).forEach(function (el) {
    el._ok = function () {
      var op = options[+el.getAttribute('data-i')];
      if (multi) {
        sel[op.v] = !sel[op.v];
        el.classList.toggle('sel', !!sel[op.v]);
      } else {
        Modal.close(true);
        if (o.onPick) o.onPick(op.v);
      }
    };
  });
  $$('[data-x]', Modal.el).forEach(function (el) {
    el._ok = function () {
      var x = el.getAttribute('data-x');
      if (x === 'clear') sel = {};
      Modal.close(true);
      if (o.onPick) o.onPick(Object.keys(sel).filter(function (k) { return sel[k]; }));
    };
  });
  var ml = $('.ml', Modal.el);
  ml.style.maxHeight = remPx(multi ? 27 : 31) + 'px';
}

function confirmBox(text, yes, cb) {
  Modal.show('<h3>' + esc(text) + '</h3><div class="mfoot" data-nav="row"><div class="btn pri f" data-x="y">' + esc(yes) +
    '</div><div class="btn f" data-x="n">Отмена</div></div>', { focus: '[data-x=n]' });
  $('[data-x=y]', Modal.el)._ok = function () { Modal.close(true); cb(); };
  $('[data-x=n]', Modal.el)._ok = function () { Modal.close(); };
}

function textBox(title, text) {
  Modal.show('<h3>' + esc(title) + '</h3><div class="ml vs"><div class="mtext" data-nav="col"><div class="f" style="outline:none">' +
    esc(text).replace(/\n/g, '<br>') + '</div></div></div>', { cls: 'wide' });
  var ml = $('.ml', Modal.el);
  ml.style.maxHeight = remPx(30) + 'px';
  var f = $('.mtext .f', Modal.el);
  f._ok = function () { Modal.close(); };
  // up/down scroll the text
  $('.mtext', Modal.el)._edge = function (dir) {
    if (dir === 'down') ml.scrollTop += remPx(8);
    else if (dir === 'up') ml.scrollTop -= remPx(8);
    return true;
  };
}

// ============================================================ router
var Router = {
  stack: [],
  top: function () { return this.stack[this.stack.length - 1]; },
  ownerOf: function (el) {
    for (var i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].el.contains(el)) return this.stack[i];
    return null;
  },
  alive: function (entry) { return this.stack.indexOf(entry) >= 0 && document.body.contains(entry.el); },
  LIVE: 4,
  // Long browsing chains (anime → similar → anime → …) would keep every screen in memory.
  // Screens deeper than LIVE are frozen (DOM dropped) and re-rendered from cache on the way back.
  freezeOld: function () {
    var live = this.stack.filter(function (e) { return !e.frozen; });
    for (var i = 1; i < this.stack.length - 1 && live.length > this.LIVE; i++) {
      var e = this.stack[i];
      if (e.frozen) continue;
      if (e.view.destroy) e.view.destroy();
      e.el.innerHTML = '';
      e.frozen = true;
      e.focusEl = null;
      live = this.stack.filter(function (x) { return !x.frozen; });
    }
    if (this.stack.length > 30) {
      var drop = this.stack.splice(1, this.stack.length - 30);
      drop.forEach(function (e) { if (e.view.destroy) e.view.destroy(); e.el.remove(); });
    }
  },
  push: async function (name, params) {
    var prev = this.top();
    if (prev) prev.el.classList.add('off');
    if (Nav.cur && Nav.cur.closest('.off')) { Nav.cur.classList.remove('fx'); Nav.cur = null; }
    var el = document.createElement('div');
    el.className = 'screen';
    $('#view').appendChild(el);
    var view = Object.create(Views[name]);
    var entry = { name: name, params: params || {}, el: el, view: view, focusEl: null };
    view.el = el;
    view.entry = entry;
    this.stack.push(entry);
    markSide(name);
    this.freezeOld();
    await this.renderEntry(entry);
  },
  renderEntry: async function (entry) {
    try {
      await entry.view.render(entry.el, entry.params);
    } catch (e) {
      if (!this.alive(entry)) return;
      console.error(e);
      entry.el.className = 'screen';
      entry.el.innerHTML = errorHtml(e);
      var b = $('[data-act=retry]', entry.el);
      b._ok = function () { entry.el.innerHTML = ''; Router.renderEntry(entry); };
      if (Router.top() === entry && !Modal.open && !Player.open) Nav.focus(b);
    }
    if (this.top() === entry && !Modal.open && !Player.open) {
      var inside = Nav.cur && entry.el.contains(Nav.cur);
      if (!inside) Nav.focus(Nav.first(entry.el) || Nav.cur || Nav.first($('#side')));
    }
  },
  back: function () {
    if (this.stack.length <= 1) return false;
    var v = this.stack.pop();
    if (v.view.destroy) v.view.destroy();
    v.el.remove();
    var p = this.top();
    p.el.classList.remove('off');
    markSide(p.name);
    if (p.frozen) {
      p.frozen = false;
      p.el.className = 'screen';
      p.el.innerHTML = '';
      var fresh = Object.create(Views[p.name]);
      fresh.el = p.el; fresh.entry = p;
      p.view = fresh;
      this.renderEntry(p);
      return true;
    }
    if (p.view.onResume) p.view.onResume();
    Nav.focus(p.focusEl && p.el.contains(p.focusEl) ? p.focusEl : Nav.first(p.el));
    return true;
  },
  root: function (name, params) {
    while (this.stack.length) {
      var v = this.stack.pop();
      if (v.view.destroy) v.view.destroy();
      v.el.remove();
    }
    return this.push(name, params);
  }
};
function markSide(name) {
  $$('#side .si').forEach(function (e) { e.classList.toggle('cur', e.getAttribute('data-v') === name); });
}

// ============================================================ actions
var Acts = {
  anime: function (el) {
    Router.push('anime', { id: el.getAttribute('data-id'), url: el.getAttribute('data-url'), ep: el.getAttribute('data-ep'), dub: el.getAttribute('data-dub'), player: el.getAttribute('data-player') });
  },
  resume: function (el) { resumeAnime(+el.getAttribute('data-id'), el.getAttribute('data-url')); },
  side: function (el) {
    var v = el.getAttribute('data-v');
    if (v === 'random') { openRandom(); return; }
    Router.root(v);
  },
  coll: function (el) { Router.push('collection', { id: el.getAttribute('data-id'), title: el.getAttribute('data-title') }); }
};
function activate(el) {
  if (!el) return;
  if (el._ok) { el._ok(el); return; }
  var h = Acts[el.getAttribute('data-act')];
  if (h) { h(el); return; }
  var v = Router.top();
  if (v && v.view.onOk) v.view.onOk(el);
}
async function openRandom() {
  try {
    toast('Ищу что-нибудь интересное…', 1500);
    var my = intent;
    var r = await api('/anime', { sort: 'random', limit: 1, min_rating: 6.5, min_rating_counters: 50 }, 0);
    if (my !== intent || Player.open || Modal.open) return;
    if (r && r[0]) Router.push('anime', { id: r[0].anime_id, url: r[0].anime_url });
  } catch (e) { toast(e.message); }
}
var intent = 0; // bumps on every user key: async actions started earlier are cancelled if the user did something else
async function resumeAnime(id, url) {
  var my = intent;
  try {
    toast('Загрузка…', 1200);
    var a = await getAnime(url || id);
    if (my !== intent || Player.open || Modal.open) return;
    var m = buildVideos(a);
    if (!m.length) { Router.push('anime', { id: id, url: url }); return; }
    var h = Hist.get(a.anime_id);
    var ch = chooseDefault(m, h);
    var eps = ch.dub.players[ch.player];
    var idx = 0;
    if (h && h.ep) {
      for (var i = 0; i < eps.length; i++) if (eps[i].number === h.ep) { idx = i; break; }
      if (h.d && h.t > h.d - 90 && idx < eps.length - 1) idx++;
    }
    Player.start(a, m, ch.dub, ch.player, idx);
  } catch (e) { toast(e.message); }
}

// ============================================================ videos model
function shortDub(n) { return String(n || '').replace(/^Озвучка\s+/i, ''); }
function shortPlayer(n) { return String(n || '').replace(/^Плеер\s+/i, ''); }
function buildVideos(a) {
  var map = new Map();
  (a.videos || []).forEach(function (v) {
    if (!v || !v.iframe_url) return;
    var dn = (v.data && v.data.dubbing) || 'Без названия';
    var pn = (v.data && v.data.player) || 'Плеер';
    var d = map.get(dn);
    if (!d) { d = { name: dn, players: {}, order: [], count: 0 }; map.set(dn, d); }
    if (!d.players[pn]) { d.players[pn] = []; d.order.push(pn); }
    d.players[pn].push(v);
  });
  var out = [];
  map.forEach(function (d) {
    d.order.forEach(function (pn) {
      var seen = {}, list = [];
      d.players[pn].sort(function (x, y) { return epNum(x.number) - epNum(y.number) || (y.date || 0) - (x.date || 0); })
        .forEach(function (v) { if (!seen[v.number]) { seen[v.number] = 1; list.push(v); } });
      d.players[pn] = list;
      d.count = Math.max(d.count, list.length);
    });
    d.order.sort(function (x, y) { return playerRank(x) - playerRank(y); });
    out.push(d);
  });
  out.sort(function (x, y) { return y.count - x.count || (/субтитр/i.test(x.name) ? 1 : 0) - (/субтитр/i.test(y.name) ? 1 : 0); });
  return out;
}
function playerRank(n) {
  if (S.player !== 'auto' && n.toLowerCase().indexOf(S.player.toLowerCase()) >= 0) return 0;
  if (/kodik/i.test(n)) return 1;
  if (/alloha/i.test(n)) return 2;
  return 3;
}
function chooseDefault(dubs, h) {
  var d = null;
  function find(name) {
    for (var i = 0; i < dubs.length; i++) if (dubs[i].name === name) return dubs[i];
    var sn = shortDub(name).toLowerCase();
    for (var j = 0; j < dubs.length; j++) if (shortDub(dubs[j].name).toLowerCase() === sn) return dubs[j];
    return null;
  }
  if (h && h.dub) d = find(h.dub);
  if (!d && S.lastDub) d = find(S.lastDub);
  if (!d) d = dubs[0];
  var pl = h && h.player && d.players[h.player] ? h.player : d.order[0];
  if (h && h.player && !d.players[h.player]) {
    var sp = shortPlayer(h.player).toLowerCase();
    d.order.forEach(function (pn) { if (shortPlayer(pn).toLowerCase() === sp) pl = pn; });
  }
  return { dub: d, player: pl };
}

// ============================================================ views
var Views = {};

// Re-renders a block of rows/sections and puts focus back on "the same" item
// (same section title + same position), so background refreshes never yank focus.
function replaceKeepingFocus(box, html, entry) {
  var live = Nav.cur && box.contains(Nav.cur) ? Nav.cur : null;
  var ref = live || (entry && entry.focusEl && box.contains(entry.focusEl) ? entry.focusEl : null);
  var title = null, idx = -1;
  if (ref) {
    var cont = ref.closest('[data-nav]'), sec = ref.closest('.sec'), h = sec && $('h2', sec);
    title = h ? h.textContent : null;
    idx = cont ? Nav.items(cont).indexOf(ref) : -1;
  }
  box.innerHTML = html;
  if (title == null) return;
  var h2 = $$('h2', box).filter(function (x) { return x.textContent === title; })[0];
  var target = null;
  if (h2) { var it = Nav.items($('[data-nav]', h2.parentNode)); target = it[Math.max(0, Math.min(idx, it.length - 1))]; }
  if (!target) target = Nav.first(box);
  if (live) Nav.focus(target);
  else if (entry) entry.focusEl = target;
}

// ---------------------------------------------------------------- home
Views.home = {
  render: async function (el) {
    el.innerHTML = '<div class="spot"><h1>&nbsp;</h1><div class="meta"></div><p></p></div><div class="rows vs" data-snap></div>';
    this.spot = $('.spot', el);
    var rows = $('.rows', el);
    var self = this;
    this.setSpot = debounce(function (a) { self.fillSpot(a); }, 120);
    rows.innerHTML = this.localRows() + '<div class="skel"></div><div class="skel"></div>';
    if (Nav.first(rows)) Nav.focus(Nav.first(rows));
    var self = this;
    var f = await apiSWR('/feed', null, 120000, function (fresh) { if (Router.alive(self.entry)) self.fillFeed(fresh); });
    if (!Router.alive(this.entry)) return;
    this.fillFeed(f);
  },
  fillFeed: function (f) {
    var rows = $('.rows', this.el);
    if (!rows || !f) return;
    var html = this.localRows();
    if (f.new_videos && f.new_videos.length) {
      html += section('Новые серии', f.new_videos.slice(0, 30).map(function (v) {
        return card(v, { sub: 'Серия ' + v.ep_title + ' · ' + shortDub(v.dub_title), ep: v.ep_title, dub: v.dub_title, player: v.player_title, badge: v.ep_title + ' серия', badgeAcc: true });
      }).join(''));
    }
    if (f.top_carousel && f.top_carousel.items && f.top_carousel.items.length) {
      html += section('Популярное в этом сезоне', f.top_carousel.items.map(function (a) { return card(a); }).join(''));
    }
    if (f.recommends && f.recommends.length) html += section('Рекомендуем', f.recommends.map(function (a) { return card(a); }).join(''));
    if (f.new && f.new.length) html += section('Недавно добавленные', f.new.map(function (a) { return card(a); }).join(''));
    if (f.announcements && f.announcements.length) html += section('Анонсы', f.announcements.map(function (a) { return card(a, { badge: 'Анонс' }); }).join(''));
    if (f.collections && f.collections.length) {
      html += section('Подборки', f.collections.map(function (c) {
        var likes = c.likes ? c.likes.likes : 0;
        return '<div class="tile f" data-act="coll" data-id="' + c.id + '" data-title="' + esc(c.title) + '"><b>' + esc(c.title) + '</b><span>♥ ' + likes +
          (c.owner ? ' · ' + esc(c.owner.nickname) : '') + '</span></div>';
      }).join(''));
    }
    replaceKeepingFocus(rows, html, this.entry);
  },
  localRows: function () {
    var html = '', h = Hist.list().slice(0, 20), fav = Favs.list().slice(0, 30);
    if (h.length) {
      html += section('Продолжить просмотр', h.map(function (e) {
        return card(fromStored(e), { act: 'resume', sub: 'Серия ' + e.ep + (e.d ? ' · ' + fmtT(e.t) + ' из ' + fmtT(e.d) : ''), prog: e.d ? e.t / e.d : 0 });
      }).join(''));
    }
    if (fav.length) html += section('Избранное', fav.map(function (e) { return card(fromStored(e), { sub: [e.year, e.type].filter(Boolean).join(' · ') }); }).join(''));
    return html;
  },
  onFocus: function (el) {
    if (!el.classList.contains('card')) return;
    var a = Pool.get(+el.getAttribute('data-id'));
    if (a) this.setSpot(a);
  },
  fillSpot: function (a) {
    var s = this.spot;
    if (!s) return;
    var meta = [];
    if (a.year) meta.push(a.year);
    if (typeName(a)) meta.push(typeName(a));
    if (a.anime_status && a.anime_status.title) meta.push(a.anime_status.title);
    if (a.genres && a.genres.length) meta.push(a.genres.slice(0, 3).map(function (g) { return g.title; }).join(', '));
    var r = rating(a);
    $('h1', s).textContent = a.title || '';
    $('.meta', s).innerHTML = (r ? '<b>★ ' + r + '</b> &nbsp;·&nbsp; ' : '') + esc(meta.join(' · '));
    $('p', s).textContent = a.description || '';
  },
  onResume: function () {
    // refresh "continue watching" / favourites after watching something
    var rows = $('.rows', this.el);
    if (!rows) return;
    var secs = $$('.sec', rows).filter(function (s) {
      var t = $('h2', s).textContent; return t === 'Продолжить просмотр' || t === 'Избранное';
    });
    secs.forEach(function (s) { s.remove(); });
    rows.insertAdjacentHTML('afterbegin', this.localRows());
  }
};

// ---------------------------------------------------------------- anime details
Views.anime = {
  render: async function (el, p) {
    el.classList.add('vs');
    var pre = Pool.get(+p.id);
    // Instant header from what the previous screen already knew; episodes arrive a moment later.
    el.innerHTML = pre ? '<div class="det">' + this.headerHtml(pre) + '<section class="sec"><h2>Серии</h2><div class="noeps">Загрузка серий…</div></section></div>'
      : '<div class="det">' + loadingHtml() + '</div>';
    var self = this;
    var a = await getAnime(p.url || p.id, function (fresh) { self.refreshData(fresh); });
    if (!Router.alive(this.entry)) return;
    this.a = a;
    Pool.set(a.anime_id, a);
    this.dubs = buildVideos(a);
    var h = Hist.get(a.anime_id);
    if (p.dub) {
      var hint = { dub: p.dub, player: p.player || (h && h.player) };
      this.sel = chooseDefault(this.dubs, hint);
    } else if (this.dubs.length) {
      this.sel = chooseDefault(this.dubs, h);
    }
    this.focusEp = p.ep || null;
    this.build();
  },
  build: function () {
    var a = this.a, el = this.el;
    el.innerHTML = '<div class="det">' + this.headerHtml(a) + '<div class="epsec"></div><div class="more"></div></div>';
    this.renderActs();
    this.renderEps();
    this.renderMore();
    var acts = $('.acts', el);
    Nav.focus(Nav.items(acts)[0]);
    if (this.focusEp) {
      var t = $('.ep[data-n="' + this.focusEp + '"]', el);
      if (t) Nav.focus(t);
      this.focusEp = null;
    }
  },
  headerHtml: function (a) {
    var shot = a.random_screenshots && a.random_screenshots[0] && a.random_screenshots[0].sizes;
    var facts = [];
    if (a.year) facts.push('<span>' + a.year + '</span>');
    if (a.type) facts.push('<span>' + esc(a.type.name) + '</span>');
    if (a.anime_status) facts.push('<span>' + esc(a.anime_status.title) + '</span>');
    if (a.episodes) facts.push('<span>' + (a.episodes.aired && a.episodes.aired !== a.episodes.count ? a.episodes.aired + ' из ' : '') + (a.episodes.count || '?') + ' эп.</span>');
    if (a.min_age && a.min_age.title) facts.push('<span>' + esc(a.min_age.title) + '</span>');
    var rr = a.rating || {}, rates = [];
    if (rr.average) rates.push('<b>★ ' + rr.average.toFixed(1) + '</b> <span class="muted">(' + (rr.counters || 0) + ')</span>');
    if (rr.shikimori_rating) rates.push('Shikimori ' + rr.shikimori_rating.toFixed(1));
    if (rr.myanimelist_rating) rates.push('MAL ' + rr.myanimelist_rating.toFixed(1));
    if (rr.kp_rating) rates.push('КП ' + rr.kp_rating.toFixed(1));
    var other = (a.other_titles || []).filter(function (t) { return t && t !== a.title; })[0] || '';
    var studios = (a.studios || []).map(function (s) { return s.title; }).join(', ');

    return (shot ? '<div class="dbg" style="background-image:url(\'' + esc(https(shot.full || shot.small)) + '\')"></div>' : '') +
      '<div class="dtop" data-top><img class="dposter" alt="" src="' + esc(poster(a, 'big')) + '"><div class="dinfo">' +
      '<h1>' + esc(a.title) + '</h1>' + (other ? '<div class="orig">' + esc(other) + '</div>' : '') +
      '<div class="facts">' + facts.join('') + '</div>' +
      '<div class="facts">' + rates.join(' &nbsp;·&nbsp; ') + '</div>' +
      '<div class="genres">' + esc((a.genres || []).map(function (g) { return g.title; }).join(', ')) + (studios ? ' · ' + esc(studios) : '') + '</div>' +
      '<p class="desc">' + esc(a.description || '') + '</p>' +
      '<div class="acts" data-nav="row"></div></div></div>';
  },
  refreshData: function (d) {
    if (!d || !this.a || !document.body.contains(this.el)) return;
    var keepSel = this.sel ? { dub: this.sel.dub.name, player: this.sel.player } : Hist.get(d.anime_id);
    this.a = d;
    Pool.set(d.anime_id, d);
    this.dubs = buildVideos(d);
    this.sel = this.dubs.length ? chooseDefault(this.dubs, keepSel) : null;
    if (!$('.acts', this.el)) return;
    var epFocus = Nav.cur && Nav.cur.classList.contains('ep') && this.el.contains(Nav.cur) ? Nav.cur.getAttribute('data-n') : null;
    this.renderActs();
    this.renderEps();
    if (epFocus) Nav.focus($('.epsec .ep[data-n="' + epFocus + '"]', this.el) || $('.epsec .ep', this.el));
  },
  nextEp: function () {
    var a = this.a, h = Hist.get(a.anime_id), eps = this.eps();
    if (!eps.length) return null;
    if (!h || !h.ep) return { i: 0, label: 'Смотреть', sub: '' };
    var i = 0;
    for (var k = 0; k < eps.length; k++) if (eps[k].number === h.ep) { i = k; break; }
    if (h.d && h.t > h.d - 90 && Hist.seen(a.anime_id, h.ep)) {
      if (i < eps.length - 1) return { i: i + 1, label: 'Смотреть', sub: eps[i + 1].number + ' серия' };
      return { i: 0, label: 'Пересмотреть', sub: 'с 1 серии' };
    }
    return { i: i, label: 'Продолжить', sub: eps[i].number + ' серия' + (h.t > 30 ? ' · ' + fmtT(h.t) : '') };
  },
  eps: function () { return this.sel ? this.sel.dub.players[this.sel.player] : []; },
  renderActs: function () {
    var self = this, a = this.a, acts = $('.acts', this.el), html = '';
    var ne = this.nextEp();
    if (ne) html += '<div class="btn pri f" data-x="watch">' + ICON.play + ne.label + (ne.sub ? '<small>' + esc(ne.sub) + '</small>' : '') + '</div>';
    if (this.sel) {
      html += '<div class="btn f" data-x="dub">' + ICON.mic2 + esc(shortDub(this.sel.dub.name)) + '</div>';
      html += '<div class="btn f" data-x="player">' + ICON.tv + esc(shortPlayer(this.sel.player)) + '</div>';
    }
    html += '<div class="btn f' + (Favs.has(a.anime_id) ? ' on' : '') + '" data-x="fav">' + ICON.star + (Favs.has(a.anime_id) ? 'В избранном' : 'В избранное') + '</div>';
    if (a.description && a.description.length > 220) html += '<div class="btn f" data-x="desc">' + ICON.text + 'Описание</div>';
    if (a.trailers_count) html += '<div class="btn f" data-x="trailer">' + ICON.film + 'Трейлер</div>';
    var keep = Nav.cur && acts.contains(Nav.cur) ? Nav.cur.getAttribute('data-x') : null;
    acts.innerHTML = html;
    $$('.btn', acts).forEach(function (b) { b._ok = function () { self.act(b.getAttribute('data-x')); }; });
    if (keep) { var k = $('[data-x="' + keep + '"]', acts); if (k) Nav.focus(k, true); }
  },
  act: function (x) {
    var self = this, a = this.a;
    if (x === 'watch') {
      var ne = this.nextEp();
      if (ne) this.play(ne.i);
    } else if (x === 'dub') {
      pick('Озвучка', this.dubs.map(function (d) {
        return { v: d.name, t: shortDub(d.name), sub: d.count + ' ' + plural(d.count, 'серия', 'серии', 'серий') };
      }), {
        selected: [this.sel.dub.name], checks: true,
        onPick: function (v) {
          var d = self.dubs.filter(function (x) { return x.name === v; })[0];
          var pl = d.players[self.sel.player] ? self.sel.player : d.order[0];
          self.sel = { dub: d, player: pl };
          S.lastDub = d.name; saveS();
          self.renderActs(); self.renderEps();
          Nav.focus($('[data-x=dub]', self.el));
        }
      });
    } else if (x === 'player') {
      var d = this.sel.dub;
      pick('Плеер', d.order.map(function (pn) {
        return { v: pn, t: shortPlayer(pn), sub: d.players[pn].length + ' ' + plural(d.players[pn].length, 'серия', 'серии', 'серий') };
      }), {
        selected: [this.sel.player], checks: true,
        onPick: function (v) {
          self.sel = { dub: d, player: v };
          self.renderActs(); self.renderEps();
          Nav.focus($('[data-x=player]', self.el));
        }
      });
    } else if (x === 'fav') {
      var on = Favs.toggle(a);
      toast(on ? 'Добавлено в избранное' : 'Удалено из избранного');
      this.renderActs();
    } else if (x === 'desc') {
      textBox(a.title, a.description || '');
    } else if (x === 'trailer') {
      var my = intent;
      api('/anime/' + a.anime_id + '/trailers', null, 600000).then(function (list) {
        if (my !== intent || Player.open) return;
        list = (list || []).filter(function (t) { return t.iframe_url; });
        if (!list.length) { toast('Трейлер недоступен'); return; }
        if (list.length === 1) { Player.openRaw(https(list[0].iframe_url), a.title + ' — трейлер'); return; }
        pick('Трейлеры', list.map(function (t, i) { return { v: i, t: (t.number ? 'Трейлер ' + t.number : 'Трейлер ' + (i + 1)) + (t.dubbing ? ' · ' + shortDub(t.dubbing) : '') }; }), {
          onPick: function (i) { Player.openRaw(https(list[i].iframe_url), a.title + ' — трейлер'); }
        });
      }).catch(function (e) { toast(e.message); });
    }
  },
  play: function (i) {
    if (!this.sel) return;
    S.lastDub = this.sel.dub.name; saveS();
    Player.start(this.a, this.dubs, this.sel.dub, this.sel.player, i);
  },
  renderEps: function () {
    var self = this, box = $('.epsec', this.el), a = this.a;
    if (!this.sel) {
      box.innerHTML = '<section class="sec"><h2>Серии</h2><div class="noeps">' +
        (a.anime_status && a.anime_status.alias === 'announcement' ? 'Это анонс — серии появятся после выхода.' : 'Видео для этого аниме пока нет.') + '</div></section>';
      return;
    }
    var eps = this.eps(), h = Hist.get(a.anime_id), ne = this.nextEp();
    var CH = 50, chunks = Math.ceil(eps.length / CH), cur = ne ? Math.floor(ne.i / CH) : 0;
    if (this.chunk != null && this.chunk < chunks) cur = this.chunk;
    var title = 'Серии <small>' + esc(shortDub(this.sel.dub.name)) + ' · ' + esc(shortPlayer(this.sel.player)) + ' · ' + eps.length + ' ' + plural(eps.length, 'серия', 'серии', 'серий') + '</small>';
    var range = '';
    if (chunks > 1) {
      range = '<div class="eprange" data-nav="row">';
      for (var c = 0; c < chunks; c++) {
        range += '<div class="chip f' + (c === cur ? ' sel' : '') + '" data-c="' + c + '">' + esc(eps[c * CH].number) + '–' + esc(eps[Math.min(eps.length, (c + 1) * CH) - 1].number) + '</div>';
      }
      range += '</div>';
    }
    var tiles = eps.slice(cur * CH, (cur + 1) * CH).map(function (v, k) {
      var i = cur * CH + k, seen = Hist.seen(a.anime_id, v.number);
      var prog = h && h.ep === v.number && h.d ? '<div class="pb"><i style="width:' + Math.round(h.t / h.d * 100) + '%"></i></div>' : '';
      return '<div class="ep f' + (seen ? ' seen' : '') + (ne && ne.i === i ? ' next' : '') + '" data-i="' + i + '" data-n="' + esc(v.number) + '"><b>' + esc(v.number) + '</b><small>серия</small>' + prog + '</div>';
    }).join('');
    box.innerHTML = '<section class="sec"><h2>' + title + '</h2>' + range + '<div class="hs" data-nav="row">' + tiles + '</div></section>';
    var row = $('.hs', box);
    $$('.ep', box).forEach(function (t) { t._ok = function () { self.play(+t.getAttribute('data-i')); }; });
    $$('.chip', box).forEach(function (ch) {
      ch._ok = function () { self.chunk = +ch.getAttribute('data-c'); self.renderEps(); Nav.focus($('.epsec .ep', self.el)); };
    });
    var nx = $('.ep.next', box);
    if (nx) row._last = nx;
  },
  renderMore: async function () {
    var a = this.a, box = $('.more', this.el), html = '';
    var vo = (a.viewing_order || []).filter(function (x) { return x.anime_id; });
    if (vo.length > 1) {
      html += section('Порядок просмотра', vo.map(function (x, i) {
        var sub = [x.year, x.type ? x.type.shortname : '', x.data && x.data.text].filter(Boolean).join(' · ');
        return card(x, { sub: sub, badge: x.anime_id === a.anime_id ? 'Сейчас' : String(i + 1), badgeAcc: x.anime_id === a.anime_id });
      }).join(''));
    }
    box.innerHTML = html;
    try {
      var rec = await apiSWR('/anime/' + a.anime_id + '/recommendations', { limit: 24 }, 864e5);
      if (rec && rec.length && document.body.contains(box) && !$('.rec', box)) {
        box.insertAdjacentHTML('beforeend', '<div class="rec">' + section('Похожее', rec.map(function (x) { return card(x); }).join('')) + '</div>');
      }
    } catch (e) { /* optional */ }
  },
  onResume: function () {
    if (!this.a) return;
    var h = Hist.get(this.a.anime_id);
    if (h && h.dub && this.dubs.length) { this.sel = chooseDefault(this.dubs, h); this.chunk = null; }
    this.renderActs();
    var focusedEp = Nav.cur && Nav.cur.classList.contains('ep');
    this.renderEps();
    if (focusedEp) Nav.focus($('.epsec .ep.next', this.el) || $('.epsec .ep', this.el));
  }
};

// ---------------------------------------------------------------- search
var KB = {
  ru: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя-.'.split(''),
  en: 'abcdefghijklmnopqrstuvwxyz-.:!\'&'.split(''),
  num: '1234567890:-.!?,()'.split('')
};
Views.search = {
  render: async function (el, p) {
    this.q = p.q || store.get('lastq', '');
    this.lang = 'ru';
    el.innerHTML = '<div class="search"><div class="kb"><div class="qbox">' + ICON.search + '<span class="qt"></span></div>' +
      '<div class="keys" data-nav="grid" data-cols="7"></div><div class="keys2" data-nav="row"></div></div>' +
      '<div class="sres vs"><h2></h2><div class="grid" data-nav="grid"></div></div></div>';
    this.renderKeys();
    this.renderQ();
    Nav.focus($('.k', el));
    this.run = debounce(this.doSearch.bind(this), 350);
    await this.doSearch();
  },
  renderKeys: function () {
    var self = this, keys = $('.keys', this.el), keys2 = $('.keys2', this.el);
    var keep = Nav.cur && keys.contains(Nav.cur) ? Nav.items(keys).indexOf(Nav.cur) : -1;
    keys.innerHTML = KB[this.lang].map(function (c) { return '<div class="k f" data-c="' + esc(c) + '">' + esc(c) + '</div>'; }).join('');
    keys2.innerHTML =
      '<div class="k w f" data-k="space">Пробел</div>' +
      '<div class="k w f" data-k="del">' + ICON.back + '</div>' +
      '<div class="k w f" data-k="clear">Стереть</div>' +
      '<div class="k w f" data-k="lang">' + (this.lang === 'ru' ? 'EN' : this.lang === 'en' ? '123' : 'РУС') + '</div>' +
      (BRIDGE ? '<div class="k w f" data-k="voice">' + ICON.mic + '<span>Голос</span></div>' : '');
    $$('.k', keys).forEach(function (k) { k._ok = function () { self.type(k.getAttribute('data-c')); }; });
    $$('.k', keys2).forEach(function (k) { k._ok = function () { self.special(k.getAttribute('data-k')); }; });
    if (keep >= 0) Nav.focus(Nav.items(keys)[Math.min(keep, Nav.items(keys).length - 1)]);
  },
  renderQ: function () {
    var qt = $('.qt', this.el);
    qt.innerHTML = this.q ? esc(this.q) + '<span class="caret"></span>' : '<span class="caret"></span><span class="ph">Название аниме</span>';
  },
  type: function (c) { if (this.q.length < 60) { this.q += c; this.changed(); } },
  special: function (k) {
    if (k === 'space') { if (this.q && this.q[this.q.length - 1] !== ' ') { this.q += ' '; this.changed(); } }
    else if (k === 'del') { this.q = this.q.slice(0, -1); this.changed(); }
    else if (k === 'clear') { this.q = ''; this.changed(); }
    else if (k === 'lang') {
      this.lang = this.lang === 'ru' ? 'en' : this.lang === 'en' ? 'num' : 'ru';
      this.renderKeys();
      Nav.focus($('[data-k=lang]', this.el));
    } else if (k === 'voice') {
      if (BRIDGE) BRIDGE.voiceSearch();
    }
  },
  changed: function () { this.renderQ(); store.set('lastq', this.q); this.run(); },
  doSearch: async function () {
    var q = this.q.trim(), my = (this.seq = (this.seq || 0) + 1);
    var h2 = $('.sres h2', this.el), grid = $('.sres .grid', this.el);
    var list;
    try {
      list = q ? await api('/anime', { q: q, limit: 36 }, 600000) : await apiSWR('/anime', { sort: 'views', sort_forward: false, limit: 24, status: 'ongoing' }, 3600000);
    } catch (e) { if (my === this.seq && Router.alive(this.entry)) h2.textContent = e.message; return; }
    if (my !== this.seq || !Router.alive(this.entry)) return;
    h2.innerHTML = q ? (list.length ? 'Найдено <small>' + list.length + (list.length >= 36 ? '+' : '') + '</small>' : 'Ничего не найдено <small>попробуйте другое написание</small>') : 'Популярные онгоинги';
    var hadFocus = Nav.cur && grid.contains(Nav.cur);
    grid.innerHTML = list.map(function (a) { return card(a); }).join('');
    grid._t = null;
    var vs = $('.sres', this.el); vs._t = 0; vs.scrollTop = 0;
    if (hadFocus) Nav.focus($('.card', grid) || $('.k', this.el));
  },
  onChar: function (k, ch) {
    if (k === 'char') this.type(ch.toLowerCase());
    else if (k === 'space') this.special('space');
    else if (k === 'del') this.special('del');
  },
  voice: function (text) {
    if (!text) { toast('Голосовой поиск недоступен на этом устройстве'); return; }
    this.q = text.toLowerCase();
    this.changed();
    this.run.flush();
  }
};
window.tvVoice = function (text) {
  var v = Router.top();
  if (v && v.name === 'search') v.view.voice(text);
};

// ---------------------------------------------------------------- catalog
var SORTS = [
  ['views', 'Популярные', false], ['rating', 'По рейтингу', false], ['top', 'Топ-100', true],
  ['year', 'Сначала новые', false], ['id', 'Недавно добавленные', false], ['title', 'По названию', true], ['random', 'Случайный порядок', true]
];
var TYPES = [['tv', 'Сериал'], ['movie', 'Фильм'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешл'], ['shorttv', 'Короткий сериал']];
var STATUSES = [['ongoing', 'Онгоинг'], ['released', 'Вышел'], ['announcement', 'Анонс']];
async function genresList() {
  var g = store.get('genres', null);
  if (g && Date.now() - g.t < 7 * 864e5) return g.list;
  var c = await api('/anime/catalog', null, 864e5);
  var list = ((c.genres && c.genres.genres) || []).map(function (x) { return [x.href, x.title]; })
    .sort(function (a, b) { return a[1].localeCompare(b[1], 'ru'); });
  store.set('genres', { t: Date.now(), list: list });
  return list;
}
Views.catalog = {
  render: async function (el, p) {
    this.F = Object.assign({ types: [], status: [], genres: [], years: '', sort: 'views' }, store.get('catf', {}), p.filter || {});
    el.classList.add('vs');
    el.innerHTML = '<div class="fbar" data-nav="row" data-top></div><div class="grid" data-nav="grid"></div>';
    this.grid = $('.grid', el);
    var self = this;
    this.grid._onEnd = function () { self.load(); };
    this.renderBar();
    Nav.focus($('.fbar .btn', el));
    await this.reload();
  },
  label: function (list, vals, all) {
    if (!vals.length) return all;
    var names = vals.map(function (v) { var x = list.filter(function (l) { return l[0] === v; })[0]; return x ? x[1] : v; });
    return names.length > 2 ? names.slice(0, 2).join(', ') + ' +' + (names.length - 2) : names.join(', ');
  },
  renderBar: function () {
    var self = this, F = this.F, bar = $('.fbar', this.el);
    var sort = SORTS.filter(function (s) { return s[0] === F.sort; })[0] || SORTS[0];
    var keep = Nav.cur && bar.contains(Nav.cur) ? Nav.cur.getAttribute('data-x') : null;
    bar.innerHTML =
      '<div class="btn f" data-x="sort">' + esc(sort[1]) + '</div>' +
      '<div class="btn f" data-x="types">Тип<small>' + esc(this.label(TYPES, F.types, 'все')) + '</small></div>' +
      '<div class="btn f" data-x="status">Статус<small>' + esc(this.label(STATUSES, F.status, 'все')) + '</small></div>' +
      '<div class="btn f" data-x="genres">Жанры<small>' + esc(F.genres.length ? F.genres.length + ' выбрано' : 'все') + '</small></div>' +
      '<div class="btn f" data-x="years">Год<small>' + esc(F.years || 'все') + '</small></div>' +
      '<div class="btn f" data-x="reset">Сбросить</div>';
    $$('.btn', bar).forEach(function (b) { b._ok = function () { self.filter(b.getAttribute('data-x')); }; });
    if (keep) Nav.focus($('[data-x="' + keep + '"]', bar), true);
  },
  filter: async function (x) {
    var self = this, F = this.F;
    function done() { store.set('catf', F); self.renderBar(); self.reload(); }
    if (x === 'sort') {
      pick('Сортировка', SORTS.map(function (s) { return { v: s[0], t: s[1] }; }), { selected: [F.sort], checks: true, onPick: function (v) { F.sort = v; done(); } });
    } else if (x === 'types') {
      pick('Тип', TYPES.map(function (s) { return { v: s[0], t: s[1] }; }), { multi: true, selected: F.types, onPick: function (v) { F.types = v; done(); } });
    } else if (x === 'status') {
      pick('Статус', STATUSES.map(function (s) { return { v: s[0], t: s[1] }; }), { multi: true, selected: F.status, onPick: function (v) { F.status = v; done(); } });
    } else if (x === 'genres') {
      try {
        var my = intent;
        var g = await genresList();
        if (my !== intent || Modal.open || !Router.alive(this.entry)) return;
        pick('Жанры', g.map(function (s) { return { v: s[0], t: s[1] }; }), { multi: true, grid: true, wide: true, selected: F.genres, onPick: function (v) { F.genres = v; done(); } });
      } catch (e) { toast(e.message); }
    } else if (x === 'years') {
      var y = new Date().getFullYear(), opts = [{ v: '', t: 'Все годы' }];
      for (var k = y; k >= y - 12; k--) opts.push({ v: String(k), t: String(k) });
      opts.push({ v: (y - 20) + '–' + (y - 13), t: (y - 20) + '–' + (y - 13) }, { v: '2000–' + (y - 21), t: '2000–' + (y - 21) },
        { v: '1990–1999', t: '1990–1999' }, { v: '1900–1989', t: 'до 1990' });
      pick('Год выхода', opts, { selected: [F.years], checks: true, onPick: function (v) { F.years = v; done(); } });
    } else if (x === 'reset') {
      this.F = F = { types: [], status: [], genres: [], years: '', sort: 'views' };
      done();
    }
  },
  params: function () {
    var F = this.F, sort = SORTS.filter(function (s) { return s[0] === F.sort; })[0] || SORTS[0];
    var p = { sort: sort[0], sort_forward: sort[2], types: F.types, status: F.status, genres: F.genres, limit: 36 };
    if (F.years) {
      var ys = F.years.split('–');
      p.from_year = ys[0]; p.to_year = ys[1] || ys[0];
    }
    if (F.sort === 'rating') p.min_rating_counters = 30;
    return p;
  },
  reload: async function () {
    this.offset = 0; this.done = false; this.busy = false; this.seq = (this.seq || 0) + 1;
    this.grid.innerHTML = '';
    this.grid._t = null;
    await this.load();
    if (!this.grid.children.length) this.grid.innerHTML = '<div class="noeps">Ничего не найдено. Попробуйте изменить фильтры.</div>';
  },
  load: async function () {
    if (this.busy || this.done) return;
    if (this.F.sort === 'top' && this.offset >= 100) { this.done = true; return; }
    if (this.offset >= 720) {
      this.done = true;
      this.grid.insertAdjacentHTML('beforeend', '<div class="noeps" style="width:100%">Показаны первые 720. Уточните фильтры, чтобы найти нужное.</div>');
      return;
    }
    this.busy = true;
    var my = this.seq, p = this.params();
    p.offset = this.offset;
    try {
      var list = this.F.sort === 'random' ? await api('/anime', p, 0)
        : p.offset === 0 ? await apiSWR('/anime', p, 10 * 60000) : await api('/anime', p, 600000);
      if (my !== this.seq || !Router.alive(this.entry)) return;
      this.offset += list.length;
      if (list.length < p.limit) this.done = true;
      var top = this.F.sort === 'top', base = this.grid.children.length;
      this.grid.insertAdjacentHTML('beforeend', list.map(function (a, i) {
        return card(a, top ? { badge: '#' + (base + i + 1), badgeAcc: base + i < 10 } : null);
      }).join(''));
    } catch (e) {
      toast(e.message);
    } finally {
      if (my === this.seq) this.busy = false;
    }
  }
};

// ---------------------------------------------------------------- collection
Views.collection = {
  render: async function (el, p) {
    el.classList.add('vs');
    el.innerHTML = '<div class="pad" data-top style="padding-bottom:0"><h1>' + esc(p.title || 'Подборка') + '</h1></div>' + loadingHtml();
    var c = await apiSWR('/collection/' + p.id, null, 3600000);
    if (!Router.alive(this.entry)) return;
    var list = (c && (c.animes || c.items)) || [];
    el.innerHTML = '<div class="pad" style="padding-bottom:0"><h1>' + esc(c.title || p.title) + '</h1>' +
      (c.description ? '<p class="muted" style="margin-top:.6rem;max-width:50rem">' + esc(c.description).slice(0, 300) + '</p>' : '') + '</div>' +
      '<div class="grid" data-nav="grid">' + list.map(function (x) { return card(x.anime || x); }).join('') + '</div>';
  }
};

// ---------------------------------------------------------------- schedule
Views.schedule = {
  render: async function (el) {
    el.classList.add('vs');
    el.innerHTML = '<div class="pad" data-top style="padding-bottom:0"><h1>Расписание выхода серий</h1></div>' + loadingHtml();
    var list = await apiSWR('/anime/schedule', null, 30 * 60000);
    if (!Router.alive(this.entry)) return;
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var groups = {};
    (list || []).forEach(function (a) {
      var nd = a.episodes && a.episodes.next_date;
      if (!nd) return;
      var d = new Date(nd * 1000), key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (key < today - 864e5) return;
      (groups[key] = groups[key] || []).push(a);
    });
    var keys = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).slice(0, 10);
    var html = '<div class="pad" style="padding-bottom:0"><h1>Расписание выхода серий</h1></div>';
    keys.forEach(function (k) {
      var items = groups[k].sort(function (a, b) { return a.episodes.next_date - b.episodes.next_date; });
      var d = new Date(k), diff = Math.round((k - today) / 864e5);
      var label = diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : diff === -1 ? 'Вчера' : '';
      var full = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      html += section((label || full.charAt(0).toUpperCase() + full.slice(1)) + (label ? '<small>' + full + '</small>' : '') + '<small>' + items.length + '</small>',
        items.map(function (a) {
          var t = new Date(a.episodes.next_date * 1000);
          var hhmm = (t.getHours() < 10 ? '0' : '') + t.getHours() + ':' + (t.getMinutes() < 10 ? '0' : '') + t.getMinutes();
          return card(a, { sub: (a.episodes.aired + 1) + ' серия · ' + hhmm, badge: hhmm });
        }).join(''));
    });
    if (!keys.length) html += '<div class="noeps">Расписание пока пустое.</div>';
    el.innerHTML = html;
  }
};

// ---------------------------------------------------------------- my
Views.my = {
  render: function (el) {
    el.classList.add('vs');
    var h = Hist.list(), f = Favs.list(), html = '<div class="pad" data-top style="padding-bottom:0"><h1>Моё</h1></div>';
    if (h.length) {
      html += '<section class="sec"><h2>История просмотра <small>' + h.length + '</small></h2><div class="grid" data-nav="grid">' + h.map(function (e) {
        return card(fromStored(e), { act: 'resume', sub: 'Серия ' + e.ep + (e.d ? ' · ' + fmtT(e.t) : ''), prog: e.d ? e.t / e.d : 0 });
      }).join('') + '</div></section>';
    }
    if (f.length) {
      html += '<section class="sec"><h2>Избранное <small>' + f.length + '</small></h2><div class="grid" data-nav="grid">' +
        f.map(function (e) { return card(fromStored(e), { sub: [e.year, e.type].filter(Boolean).join(' · ') }); }).join('') + '</div></section>';
    }
    if (!h.length && !f.length) html += '<div class="noeps">Здесь появятся аниме, которые вы смотрите, и ваше избранное.<br>Подсказка: на карточке нажмите «Меню» на пульте, чтобы открыть описание.</div>';
    el.innerHTML = html;
  },
  onResume: function () { var keep = this.el.scrollTop; this.render(this.el); this.el.scrollTop = keep; }
};

// ---------------------------------------------------------------- settings
Views.settings = {
  render: function (el) {
    el.classList.add('vs');
    var self = this;
    var info = {};
    try { info = BRIDGE ? JSON.parse(BRIDGE.info()) : {}; } catch (e) {}
    var ad = BRIDGE ? BRIDGE.isAdblock() : true;
    var rows = [
      ['autoNext', 'Автоматически включать следующую серию', S.autoNext ? 'Вкл' : 'Выкл'],
      ['skipOp', 'Сразу пропускать опенинг', S.skipOp ? 'Вкл' : 'Выкл'],
      ['adblock', 'Блокировать рекламу в плеерах', ad ? 'Вкл' : 'Выкл'],
      ['player', 'Предпочитаемый плеер', S.player === 'auto' ? 'Авто (Kodik)' : S.player],
      ['quality', 'Качество видео', S.quality === 'auto' ? 'Лучшее доступное' : 'до ' + S.quality + 'p'],
      ['clean', 'Скрывать интерфейс встроенного плеера', S.clean ? 'Вкл' : 'Выкл'],
      ['scale', 'Размер интерфейса', Math.round(S.scale * 100) + '%'],
      ['anim', 'Анимации и плавная прокрутка', S.anim ? 'Вкл' : 'Выкл'],
      ['hist', 'Очистить историю просмотра', ''],
      ['cache', 'Очистить кэш', '']
    ];
    el.innerHTML = '<div class="set"><h1 data-top>Настройки</h1><div data-nav="col">' + rows.map(function (r) {
      return '<div class="row f" data-x="' + r[0] + '"><span>' + esc(r[1]) + '</span><span>' + esc(r[2]) + '</span></div>';
    }).join('') + '</div><div class="about">Yummy TV ' + esc(info.version || 'web') + (info.model ? ' · ' + esc(info.model) : '') +
      (info.webview ? ' · WebView ' + esc(info.webview) : '') + (info.inject === false ? ' · упрощённое управление плеером (обновите Android System WebView)' : '') +
      '<br>Неофициальный клиент. Каталог и видео — YummyAnime (yummyani.me).</div></div>';
    $$('.row', el).forEach(function (r) { r._ok = function () { self.toggle(r.getAttribute('data-x')); }; });
  },
  toggle: function (x) {
    var self = this;
    function rerender() { var k = x; self.render(self.el); Nav.focus($('[data-x="' + k + '"]', self.el)); }
    if (x === 'quality') {
      pick('Качество видео', [['auto', 'Лучшее доступное'], ['1080', 'До 1080p'], ['720', 'До 720p'], ['480', 'До 480p'], ['360', 'До 360p']].map(function (o) { return { v: o[0], t: o[1] }; }),
        { selected: [S.quality], checks: true, onPick: function (v) { S.quality = v; saveS(); rerender(); } });
      return;
    }
    if (x === 'autoNext' || x === 'skipOp' || x === 'anim' || x === 'clean') {
      S[x] = !S[x]; saveS(); applyScale(); rerender();
    } else if (x === 'adblock') {
      if (BRIDGE) BRIDGE.setAdblock(!BRIDGE.isAdblock());
      rerender();
    } else if (x === 'player') {
      pick('Предпочитаемый плеер', [{ v: 'auto', t: 'Авто (Kodik)' }, { v: 'Kodik', t: 'Kodik' }, { v: 'Alloha', t: 'Alloha' }, { v: 'CVH', t: 'CVH' }],
        { selected: [S.player], checks: true, onPick: function (v) { S.player = v; saveS(); rerender(); } });
    } else if (x === 'scale') {
      pick('Размер интерфейса', [0.9, 1, 1.15, 1.3].map(function (v) { return { v: v, t: Math.round(v * 100) + '%' }; }),
        { selected: [S.scale], checks: true, onPick: function (v) { S.scale = +v; saveS(); applyScale(); rerender(); } });
    } else if (x === 'hist') {
      confirmBox('Очистить всю историю просмотра?', 'Очистить', function () { Hist.clear(); toast('История очищена'); });
    } else if (x === 'cache') {
      cache.clear();
      store.set('genres', null);
      if (BRIDGE) BRIDGE.clearCache();
      toast('Кэш очищен');
    }
  }
};

// ============================================================ player
var Player = {
  open: false, panelOpen: false,
  init: function () {
    this.el = $('#player');
    this.stage = $('.stage', this.el);
    this.osd = $('.osd', this.el);
    this.load = $('.p-load', this.el);
    this.skipEl = $('.skip', this.el);
    this.cd = $('.countdown', this.el);
    this.ctrlEl = $('.osd-bot', this.el);
    this.sheet = $('.sheet', this.el);
    this.sheetRow = $('.sheet-row', this.el);
    this.btns = $('.pbtns', this.el);
    var selfp = this;
    var barRow = $('.osd-row', this.el);
    barRow._edge = function (dir) {
      if (dir === 'left' || dir === 'right') {
        var r = selfp.lastRep || 0, st = r < 6 ? 10 : r < 20 ? 30 : 60;
        selfp.seekBy(dir === 'left' ? -st : st);
        return true;
      }
      return false;
    };
    $('.bar', this.el)._ok = function () { selfp.toggle(); };
    this.sheetRow._edge = function (dir) { return dir === 'left' || dir === 'right'; };
    this.btns._edge = function (dir) { return dir === 'left' || dir === 'right' || dir === 'down'; };
    this.fill = $('.bar-fill', this.el);
    this.knob = $('.bar-knob', this.el);
    this.bufEl = $('.p-buf', this.el);
    this.timers = [];
    var self = this;
    window.addEventListener('message', function (e) { self.onMsg(e); });
    setInterval(function () { self.watchdog(); }, 2000);
    this.saveProg = debounce(function () { self.persist(); }, 4000);
  },
  start: function (a, dubs, dub, player, idx) {
    this.a = a; this.dubs = dubs; this.dub = dub; this.player = player; this.idx = idx; this.raw = null;
    this.show();
    this.loadEp();
  },
  openRaw: function (url, title) {
    this.a = null; this.raw = { url: url, title: title };
    this.show();
    this.mount(url);
    this.renderButtons();
    $('.osd-title', this.el).textContent = title;
    $('.osd-sub', this.el).textContent = '';
  },
  show: function () {
    this.prevFocus = Nav.cur;
    if (Nav.cur) Nav.cur.classList.remove('fx');
    this.open = true;
    this.el.hidden = false;
    document.body.classList.add('playing');
    document.body.classList.remove('side-open');
    if (BRIDGE) BRIDGE.keepScreenOn(true);
  },
  eps: function () { return this.dub.players[this.player]; },
  cur: function () { return this.eps()[this.idx]; },
  clearTimers: function () { this.timers.forEach(clearTimeout); this.timers = []; clearInterval(this.cdTimer); this.cdTimer = null; },
  mount: function (url) {
    this.clearTimers();
    clearTimeout(this.seekTimer);
    this.osd.classList.remove('seeking');
    if (this.frame) { this.frame.src = 'about:blank'; this.frame.remove(); }
    this.t = 0; this.d = 0; this.paused = true; this.got = false; this.ended = false; this.seekTarget = null; this.skipMode = null; this.autoSkipped = false;
    this.mountedAt = Date.now();
    this.kind = /kodik/i.test(url) ? 'kodik' : /alloha/i.test(url) ? 'alloha' : /cvh/i.test(url) ? 'cvh' : 'other';
    var f = document.createElement('iframe');
    f.className = 'pf';
    f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('tabindex', '-1');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    f.src = url;
    var self = this;
    f.addEventListener('load', function () {
      self.post({ tvp: 'config', adblock: BRIDGE ? BRIDGE.isAdblock() : true, clean: S.clean });
      self.kick(false);
    });
    this.stage.appendChild(f);
    this.frame = f;
    this.cd.hidden = true;
    this.skipEl.classList.remove('show');
    this.load.classList.remove('done');
    $('.p-hint', this.el).textContent = '';
    this.renderBar();
    this.showOsd();
    this.lastProgress = Date.now(); this.stallWarned = false; this.buf = false;
    this.bufEl.classList.remove('show');
    // Keep nudging the player until it reports playback (players differ in how fast they get ready).
    [1200, 2500, 4000, 5500, 7000, 8500].forEach(function (ms) {
      self.timers.push(setTimeout(function () { if (!self.got) self.kick(ms === 4000 || ms === 8500); }, ms));
    });
    this.timers.push(setTimeout(function () {
      if (!self.got) {
        self.load.classList.add('done');
        toast('Видео не запускается? Нажмите ↓ → «Плеер» и выберите другой', 6000);
      }
    }, 12000));
  },
  loadEp: function (forceT) {
    var v = this.cur(), h = Hist.get(this.a.anime_id);
    var resume = 0;
    if (forceT != null) resume = forceT;
    else if (h && h.ep === v.number && h.t > 15 && (!h.d || h.t < h.d - 60)) resume = h.t;
    var url = https(v.iframe_url);
    if (/kodik/i.test(url) && resume > 0) url += (url.indexOf('?') < 0 ? '?' : '&') + 'start_from=' + Math.floor(resume);
    this.mount(url);
    this.resumeAt = resume;
    this.d = v.duration || 0;
    Hist.upd(this.a, { ep: v.number, dub: this.dub.name, player: this.player, t: resume, d: this.d || (h && h.ep === v.number ? h.d : 0) || 0 });
    $('.osd-title', this.el).textContent = this.a.title;
    $('.osd-sub', this.el).textContent = v.number + ' серия из ' + this.eps().length + ' · ' + shortDub(this.dub.name) + ' · ' + shortPlayer(this.player);
    this.qlist = null; this.qcur = null; this.qApplied = 0;
    this.renderBar();
    this.renderButtons();
  },
  post: function (m) { try { if (this.frame && this.frame.contentWindow) this.frame.contentWindow.postMessage(m, '*'); } catch (e) {} },
  cmd: function (c, v) {
    this.post({ tvp: 'cmd', cmd: c, value: v });
    var m = null;
    if (this.kind === 'kodik') {
      if (c === 'play') m = { method: 'play' };
      else if (c === 'pause') m = { method: 'pause' };
      else if (c === 'seek') m = { method: 'seek', seconds: Math.floor(v) };
      if (m) this.post({ key: 'kodik_player_api', value: m });
    } else {
      // Playerjs-style API used by several other players
      if (c === 'play') m = { api: 'play' };
      else if (c === 'pause') m = { api: 'pause' };
      else if (c === 'seek') m = { api: 'seek', set: Math.floor(v) };
      if (m) this.post(m);
    }
  },
  kick: function (click) {
    if (!this.open) return;
    this.cmd('play');
    if (click) this.cmd('click');
  },
  fromCurrent: function (src) {
    var cw = this.frame && this.frame.contentWindow;
    if (!cw || !src) return false;
    try {
      for (var w = src, i = 0; w && i < 6; i++) {
        if (w === cw) return true;
        if (w === window || w.parent === w) return false;
        w = w.parent;
      }
    } catch (e) {}
    return false;
  },
  onMsg: function (e) {
    if (!this.open || !this.frame || e.source === window) return;
    if (!this.fromCurrent(e.source)) return; // stale message from a previous episode / player
    var d = e.data;
    if (typeof d === 'string') {
      if (d.charAt(0) !== '{') return;
      try { d = JSON.parse(d); } catch (x) { return; }
    }
    if (!d || typeof d !== 'object') return;
    if (d.tvp === 'qlist') {
      var changed = (d.list || []).join() !== (this.qlist || []).join() || (d.cur && d.cur !== this.qcur);
      if (d.cur) this.qcur = d.cur;
      if (d.list && d.list.length) {
        this.qlist = d.list;
        this.qApplied = this.qApplied || 1;
        if (!changed) return;
        if (this.panelOpen) this.renderButtons();
        if (this.sheetTab === 'quality' && this.panelOpen) {
          var inSheet = !Nav.cur || !document.body.contains(Nav.cur) || this.sheet.contains(Nav.cur);
          this.renderSheet('quality', !inSheet, true);
        }
      }
      return;
    }
    if (d.tvp === 'status') {
      if (d.d > 0 && d.d < 100 && this.d > 300) return; // an ad clip, not the episode
      this.status(d.t, d.d, d.paused, d.ended, d.buf);
      return;
    }
    var k = d.key;
    if (typeof k === 'string' && k.indexOf('kodik_player') === 0) {
      var val = d.value;
      if (k === 'kodik_player_time_update' || (k === 'kodik_player_time' && typeof val === 'number')) this.status(+val, 0, this.paused && k === 'kodik_player_time', false);
      else if (k === 'kodik_player_video_started') this.status(this.t, 0, false, false);
      else if (k === 'kodik_player_duration_update') { if (+val > 0) { this.d = +val; this.renderBar(); } }
      else if (k === 'kodik_player_play') this.status(this.t, 0, false, false);
      else if (k === 'kodik_player_pause') this.status(this.t, 0, true, false);
      else if (k === 'kodik_player_video_ended') this.status(this.d, 0, true, true);
      return;
    }
    // Playerjs-style events
    if (typeof d.event === 'string') {
      var ev = d.event, num = typeof d.data === 'number' ? d.data : parseFloat(d.data);
      if (ev === 'time' && num >= 0) this.status(num, 0, false, false);
      else if (ev === 'duration' && num > 0) { this.d = num; this.renderBar(); }
      else if (ev === 'play') this.status(this.t, 0, false, false);
      else if (ev === 'pause') this.status(this.t, 0, true, false);
      else if (ev === 'end' || ev === 'ended' || ev === 'finish') this.status(this.d, 0, true, true);
    }
  },
  status: function (t, d, paused, ended, buf) {
    if (!(t >= 0)) t = this.t;
    if (Math.abs(t - this.t) > 0.2 || paused) { this.lastProgress = Date.now(); this.stallWarned = false; }
    if (buf !== undefined) this.setBuf(!!buf && !paused);
    else if (t !== this.t) this.setBuf(false);
    if (d > 0) this.d = d;
    var wasPaused = this.paused;
    this.t = t; this.paused = !!paused;
    if (!this.got && (t > 0.5 || !paused)) {
      this.got = true;
      this.applyQuality();
      this.load.classList.add('done');
      this.hideOsdSoon();
    }
    if (this.raw) { this.renderBar(); return; }
    if (this.resumeAt && this.d > 60 && t >= 0) {
      if (t < this.resumeAt - 10) this.cmd('seek', this.resumeAt);
      this.resumeAt = 0;
    }
    if (this.seekTarget != null && (Math.abs(t - this.seekTarget) < 4 || Date.now() - this.seekAt > 3000)) this.seekTarget = null;
    if (wasPaused !== this.paused) { if (this.paused) this.showOsd(true); else this.hideOsdSoon(); }
    this.checkSkips();
    if (!this.ended && (ended || (this.d > 60 && t >= this.d - 1.2 && this.got))) { this.ended = true; this.onEnded(); }
    this.renderBar();
    this.saveProg();
  },
  // Players start at a low quality (Kodik: 360p). Pick the preferred one from the player's own menu.
  applyQuality: function () {
    if (this.raw) return;
    var self = this, mount = this.mountedAt;
    [0, 2500, 6000].forEach(function (ms) {
      self.timers.push(setTimeout(function () {
        if (self.mountedAt !== mount || !self.open) return;
        if (ms && self.qApplied) return;
        self.cmd('qpick', S.quality || 'auto');
      }, ms));
    });
  },
  setBuf: function (on) {
    if (on === this.buf) return;
    this.buf = on;
    clearTimeout(this.bufT);
    var el = this.bufEl;
    // show the spinner only if buffering lasts a moment (avoids flicker)
    if (on) this.bufT = setTimeout(function () { el.classList.add('show'); }, 600);
    else el.classList.remove('show');
  },
  watchdog: function () {
    if (!this.open || this.raw || !this.got || this.paused || this.cdTimer || this.panelOpen) return;
    var idle = Date.now() - this.lastProgress;
    if (idle > 8000 && idle < 10000) this.cmd('play');
    if (idle > 15000 && !this.stallWarned) {
      this.stallWarned = true;
      toast('Видео остановилось. ↓ → «Плеер» — попробуйте другой плеер', 6000);
    }
  },
  persist: function () {
    if (!this.a || !this.open) return;
    var v = this.cur();
    var patch = { ep: v.number, dub: this.dub.name, player: this.player, t: this.t, d: this.d };
    var e = Hist.upd(this.a, patch);
    if (this.d && this.t / this.d > 0.85) { e.w = e.w || {}; e.w[v.number] = 1; Hist.save(); }
  },
  checkSkips: function () {
    var v = this.cur(), sk = (v && v.skips) || {}, t = this.t, mode = null;
    var op = sk.opening, en = sk.ending;
    if (op && op.length > 5 && t >= op.time && t < op.time + op.length - 2) mode = 'op';
    else if (en && en.length > 5 && t >= en.time && t < en.time + en.length - 2) mode = 'ed';
    if (mode === 'op' && S.skipOp && !this.autoSkipped) {
      this.autoSkipped = true;
      this.cmd('seek', op.time + op.length);
      toast('Опенинг пропущен');
      mode = null;
    }
    if (this.panelOpen) mode = null;
    if (mode !== this.skipMode) {
      this.skipMode = mode;
      if (mode) {
        var label = mode === 'op' ? 'Пропустить опенинг' : (this.idx < this.eps().length - 1 ? 'Следующая серия' : 'Пропустить эндинг');
        this.skipEl.innerHTML = label + '<small>OK</small>';
        this.skipEl.classList.add('show');
      } else {
        this.skipEl.classList.remove('show');
      }
    }
  },
  doSkip: function () {
    var sk = this.cur().skips || {};
    if (this.skipMode === 'op') this.seekTo(sk.opening.time + sk.opening.length);
    else if (this.skipMode === 'ed') {
      if (this.idx < this.eps().length - 1) { this.markSeen(); this.go(this.idx + 1); }
      else this.seekTo(sk.ending.time + sk.ending.length);
    }
    this.skipMode = null;
    this.skipEl.classList.remove('show');
  },
  markSeen: function () {
    var v = this.cur(), e = Hist.upd(this.a, { ep: v.number, t: this.d || this.t, d: this.d });
    e.w = e.w || {}; e.w[v.number] = 1; Hist.save();
  },
  onEnded: function () {
    if (this.raw) return;
    if (this.panelOpen) this.closePanel();
    if (Modal.open) Modal.close(true);
    this.markSeen();
    if (!S.autoNext || this.idx >= this.eps().length - 1) { this.showOsd(true); return; }
    var self = this, left = 8, next = this.eps()[this.idx + 1];
    this.cd.hidden = false;
    var draw = function () {
      self.cd.innerHTML = '<b>' + esc(next.number) + ' серия через ' + left + '</b><div class="muted">OK — сейчас · Назад — остаться</div><div class="cbar"><i style="transform:scaleX(' + (1 - left / 8) + ')"></i></div>';
    };
    draw();
    this.cdTimer = setInterval(function () { left--; if (left <= 0) { self.go(self.idx + 1); } else draw(); }, 1000);
  },
  cancelCountdown: function () { clearInterval(this.cdTimer); this.cdTimer = null; this.cd.hidden = true; this.showOsd(true); },
  go: function (i, keepTime) {
    if (i < 0 || i >= this.eps().length) { toast(i < 0 ? 'Это первая серия' : 'Это последняя серия'); return; }
    clearInterval(this.cdTimer); this.cdTimer = null; this.cd.hidden = true;
    this.persist();
    this.idx = i;
    this.loadEp(keepTime);
  },
  toggle: function () { if (this.paused) this.play(); else this.pause(); },
  play: function () { this.cmd('play'); this.paused = false; this.renderBar(); this.hideOsdSoon(); },
  pause: function () { this.cmd('pause'); this.paused = true; this.renderBar(); this.showOsd(true); },
  seekTo: function (t) {
    this.seekTarget = t; this.seekAt = Date.now();
    this.cmd('seek', t);
    this.t = t;
    this.renderBar();
  },
  seekBy: function (delta) {
    var base = this.seekTarget != null ? this.seekTarget : this.t;
    var max = this.d > 0 ? this.d - 3 : base + Math.abs(delta) + 1;
    var tgt = Math.max(0, Math.min(base + delta, max));
    this.seekTarget = tgt; this.seekAt = Date.now() + 1000;
    this.osd.classList.add('seeking');
    this.showOsd();
    this.renderBar();
    var self = this;
    clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(function () {
      self.osd.classList.remove('seeking');
      self.seekAt = Date.now();
      self.cmd('seek', tgt);
      self.t = tgt;
      if (self.ended && tgt < self.d - 5) { self.ended = false; self.cd.hidden = true; clearInterval(self.cdTimer); }
    }, 450);
  },
  renderBar: function () {
    var shown = this.seekTarget != null ? this.seekTarget : this.t;
    var p = this.d > 0 ? Math.min(1, shown / this.d) : 0;
    this.fill.style.transform = 'scaleX(' + p + ')';
    this.knob.style.left = (p * 100) + '%';
    $('.osd-cur', this.el).textContent = fmtT(shown);
    $('.osd-dur', this.el).textContent = this.d ? fmtT(this.d) : '--:--';
    var pp = $('[data-b=pp]', this.btns);
    if (pp) { var want = this.paused ? 'play' : 'pause'; if (pp.getAttribute('data-s') !== want) { pp.setAttribute('data-s', want); pp.innerHTML = ICON[want]; } }
  },
  showOsd: function (sticky) {
    this.osd.classList.add('show');
    clearTimeout(this.osdT);
    if (!sticky) this.hideOsdSoon();
  },
  hideOsdSoon: function () {
    var self = this;
    clearTimeout(this.osdT);
    this.osdT = setTimeout(function () {
      if (self.panelOpen) { if (!self.paused && !Modal.open) self.closePanel(); return; }
      if (!self.paused) self.osd.classList.remove('show');
    }, self.panelOpen ? 6000 : 3500);
  },
  key: function (k, rep) {
    this.lastRep = rep;
    if (this.cdTimer) {
      if (k === 'ok' && !rep) { this.go(this.idx + 1); return; }
      if (k === 'back' && !rep) { this.cancelCountdown(); return; }
    }
    if (this.panelOpen) {
      this.hideOsdSoon();
      if ((k === 'back' || k === 'menu') && !rep) {
        if (this.sheetTab) this.closeSheet(true); else this.closePanel();
        return;
      }
      if (k === 'ok') { if (!rep) activate(Nav.cur); return; }
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
        if (k === 'down' && this.sheetTab && Nav.cur && this.sheet.contains(Nav.cur)) { Nav.focus(this.sheetBtn() || $('.pb-b', this.btns)); return; }
        Nav.move(k);
        return;
      }
    }
    var step = rep < 6 ? 10 : rep < 20 ? 30 : 60;
    switch (k) {
      case 'ok':
        if (rep) return;
        if (this.skipMode) { this.doSkip(); return; }
        if (!this.got && Date.now() - this.mountedAt < 15000) { this.kick(true); return; }
        this.toggle();
        break;
      case 'playpause': case 'space': if (!rep) this.toggle(); break;
      case 'play': this.play(); break;
      case 'pause': this.pause(); break;
      case 'left': case 'rew': if (!this.raw || this.d) this.seekBy(-step); break;
      case 'right': case 'ff': if (!this.raw || this.d) this.seekBy(step); break;
      case 'up': case 'down': case 'menu': case 'info': if (!rep) this.openPanel(); break;
      case 'next': if (!rep && !this.raw) this.go(this.idx + 1); break;
      case 'prev': if (!rep && !this.raw) this.go(this.idx - 1); break;
      case 'back': if (!rep) this.close(); break;
    }
  },
  // ------------------------------------------------ bottom controls (YouTube-style)
  openPanel: function (tab) {
    this.panelOpen = true;
    this.osd.classList.add('show', 'ctrl');
    this.skipEl.classList.remove('show');
    this.skipMode = null;
    this.renderButtons();
    if (tab && !this.raw) this.renderSheet(tab);
    else Nav.focus($('[data-b=pp]', this.btns));
    this.hideOsdSoon();
  },
  closePanel: function () {
    this.panelOpen = false;
    this.closeSheet(false);
    this.osd.classList.remove('ctrl');
    if (Nav.cur) Nav.cur.classList.remove('fx');
    if (this.paused) this.showOsd(true); else this.hideOsdSoon();
  },
  sheetBtn: function () { return this.sheetTab ? $('[data-b="' + this.sheetTab + '"]', this.btns) : null; },
  closeSheet: function (refocus) {
    var b = this.sheetBtn();
    this.sheetTab = null;
    this.sheet.hidden = true;
    this.sheetRow.innerHTML = '';
    if (refocus && b) Nav.focus(b);
  },
  qualityOptions: function () {
    if (!this.qlist || !this.qlist.length) return [];
    return [['auto', 'Лучшее']].concat(this.qlist.map(function (l) { return [String(parseInt(l, 10)), l]; }));
  },
  qualityLabel: function () {
    return this.qcur || (S.quality === 'auto' ? 'Лучшее' : S.quality + 'p');
  },
  renderButtons: function () {
    var self = this, html;
    if (this.raw) {
      html = '<div class="pb-b ic f" data-b="pp" data-s="' + (this.paused ? 'play' : 'pause') + '">' + (this.paused ? ICON.play : ICON.pause) + '</div>';
    } else {
      var v = this.cur(), n = this.eps().length;
      html = '<div class="pb-b ic f" data-b="pp" data-s="' + (this.paused ? 'play' : 'pause') + '">' + (this.paused ? ICON.play : ICON.pause) + '</div>' +
        '<div class="pb-b ic f' + (this.idx > 0 ? '' : ' dis') + '" data-b="prev">' + ICON.prev + '</div>' +
        '<div class="pb-b ic f' + (this.idx < n - 1 ? '' : ' dis') + '" data-b="next">' + ICON.next + '</div>' +
        '<div class="pb-b f" data-b="eps">' + ICON.list + '<span>' + esc(v.number) + ' серия</span></div>' +
        '<div class="pb-b f" data-b="dub">' + ICON.mic2 + '<span>' + esc(shortDub(this.dub.name)) + '</span></div>' +
        '<div class="pb-b f" data-b="player">' + ICON.tv + '<span>' + esc(shortPlayer(this.player)) + '</span></div>' +
        '<div class="pb-b f" data-b="quality">' + ICON.hd + '<span>' + esc(this.qualityLabel()) + '</span></div>' +
        '<div class="pb-b ic f" data-b="more">' + ICON.dots + '</div>';
    }
    var keep = Nav.cur && this.btns.contains(Nav.cur) ? Nav.cur.getAttribute('data-b') : null;
    this.btns.innerHTML = html;
    $$('.pb-b', this.btns).forEach(function (b) {
      b._ok = function () {
        var x = b.getAttribute('data-b');
        if (x === 'pp') self.toggle();
        else if (x === 'prev') { if (self.idx > 0) self.go(self.idx - 1); }
        else if (x === 'next') { if (self.idx < self.eps().length - 1) self.go(self.idx + 1); }
        else if (self.sheetTab === x) self.closeSheet(true);
        else self.renderSheet(x);
      };
    });
    if (keep && this.panelOpen) Nav.focus($('[data-b="' + keep + '"]', this.btns) || $('.pb-b', this.btns), true);
  },
  renderSheet: function (tab, keepFocus, fromPlayer) {
    var self = this, html = '';
    this.sheetTab = tab;
    if (tab === 'quality' && !fromPlayer) this.cmd('qlist');
    if (tab === 'eps') {
      html = this.eps().map(function (v, i) {
        var seen = Hist.seen(self.a.anime_id, v.number);
        return '<div class="ep f' + (seen ? ' seen' : '') + (i === self.idx ? ' next sel' : '') + '" data-i="' + i + '"><b>' + esc(v.number) + '</b></div>';
      }).join('');
    } else if (tab === 'dub') {
      var num = this.cur().number;
      html = this.dubs.map(function (d, i) {
        var has = d.order.some(function (pn) { return d.players[pn].some(function (v) { return v.number === num; }); });
        return '<div class="chip2 f' + (d === self.dub ? ' sel' : '') + (has ? '' : ' dis') + '" data-d="' + i + '">' + esc(shortDub(d.name)) +
          '<small>' + (has ? d.count + ' эп.' : 'нет серии') + '</small></div>';
      }).join('');
    } else if (tab === 'player') {
      html = this.dub.order.map(function (pn) {
        return '<div class="chip2 f' + (pn === self.player ? ' sel' : '') + '" data-p="' + esc(pn) + '">' + esc(shortPlayer(pn)) + '<small>' + self.dub.players[pn].length + ' эп.</small></div>';
      }).join('');
    } else if (tab === 'quality') {
      var opts = this.qualityOptions(), curQ = S.quality || 'auto';
      html = opts.length ? opts.map(function (o) {
        var label = o[0] === 'auto' && self.qlist ? o[1] + '<small>' + esc(self.qlist[0]) + '</small>' : esc(o[1]);
        return '<div class="chip2 f' + (String(o[0]) === String(curQ) ? ' sel' : '') + '" data-q="' + esc(o[0]) + '">' + label + '</div>';
      }).join('') : '<div class="chip2 f sel" data-q="">Авто<small>' + (this.got ? 'плеер выбирает сам' : 'загрузка…') + '</small></div>';
    } else if (tab === 'more') {
      html = '<div class="chip2 f" data-m="skipop">Пропуск опенинга<small>' + (S.skipOp ? 'вкл' : 'выкл') + '</small></div>' +
        '<div class="chip2 f" data-m="autonext">Автопереход<small>' + (S.autoNext ? 'вкл' : 'выкл') + '</small></div>' +
        '<div class="chip2 f" data-m="clean">Интерфейс плеера<small>' + (S.clean ? 'скрыт' : 'виден') + '</small></div>' +
        '<div class="chip2 f" data-m="reload">Перезагрузить</div>' +
        '<div class="chip2 f" data-m="click">Нажать «Play» в плеере</div>' +
        '<div class="chip2 f" data-m="details">Описание</div>';
    }
    this.sheet.hidden = false;
    this.sheetRow.innerHTML = html;
    this.sheetRow._t = 0; this.sheetRow.scrollLeft = 0;
    $$('.ep', this.sheetRow).forEach(function (t) { t._ok = function () { self.closePanel(); self.go(+t.getAttribute('data-i')); }; });
    $$('[data-d]', this.sheetRow).forEach(function (o) {
      o._ok = function () {
        var d = self.dubs[+o.getAttribute('data-d')], num = self.cur().number, t = self.t;
        var pl = d.players[self.player] ? self.player : d.order[0];
        var list = d.players[pl], idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].number === num) { idx = i; break; }
        if (idx < 0) {
          for (var k = 0; k < d.order.length && idx < 0; k++) {
            var l2 = d.players[d.order[k]];
            for (var j = 0; j < l2.length; j++) if (l2[j].number === num) { pl = d.order[k]; idx = j; break; }
          }
        }
        if (idx < 0) { toast('В этой озвучке нет ' + num + ' серии'); return; }
        S.lastDub = d.name; saveS();
        self.persist();
        self.dub = d; self.player = pl; self.idx = idx;
        self.closePanel();
        self.loadEp(t > 10 ? t : null);
      };
    });
    $$('[data-p]', this.sheetRow).forEach(function (o) {
      o._ok = function () {
        var pn = o.getAttribute('data-p'), num = self.cur().number, t = self.t, list = self.dub.players[pn], idx = 0;
        for (var i = 0; i < list.length; i++) if (list[i].number === num) { idx = i; break; }
        self.persist();
        self.player = pn; self.idx = idx;
        self.closePanel();
        self.loadEp(t > 10 ? t : null);
      };
    });
    $$('[data-q]', this.sheetRow).forEach(function (o) {
      o._ok = function () {
        var q = o.getAttribute('data-q');
        if (!q) { self.closeSheet(true); return; }
        S.quality = q; saveS();
        self.cmd('qpick', q);
        self.closePanel();
        toast('Качество: ' + (q === 'auto' ? 'лучшее' : q + 'p'));
      };
    });
    $$('[data-m]', this.sheetRow).forEach(function (o) {
      o._ok = function () {
        var m = o.getAttribute('data-m');
        if (m === 'reload') { self.closePanel(); self.loadEp(self.t > 10 ? self.t : null); }
        else if (m === 'click') { self.closePanel(); self.kick(true); }
        else if (m === 'skipop' || m === 'autonext' || m === 'clean') {
          var key = m === 'skipop' ? 'skipOp' : m === 'autonext' ? 'autoNext' : 'clean';
          S[key] = !S[key]; saveS();
          if (m === 'clean') self.post({ tvp: 'config', adblock: BRIDGE ? BRIDGE.isAdblock() : true, clean: S.clean });
          self.renderSheet('more'); Nav.focus($('[data-m="' + m + '"]', self.sheetRow));
        } else if (m === 'details') { textBox(self.a.title, self.a.description || ''); }
      };
    });
    this.renderButtons();
    if (!keepFocus) Nav.focus($('.sel', this.sheetRow) || $('.f', this.sheetRow));
  },
  close: function () {
    this.setBuf(false);
    this.persist();
    Hist.save.flush();
    this.clearTimers();
    clearTimeout(this.seekTimer);
    if (this.frame) { this.frame.src = 'about:blank'; this.frame.remove(); this.frame = null; }
    this.open = false;
    this.panelOpen = false;
    this.closeSheet(false);
    this.osd.classList.remove('ctrl');
    this.el.hidden = true;
    this.osd.classList.remove('show');
    document.body.classList.remove('playing');
    if (BRIDGE) BRIDGE.keepScreenOn(false);
    var v = Router.top();
    if (v && v.view.onResume) v.view.onResume();
    if (this.prevFocus && document.body.contains(this.prevFocus)) Nav.focus(this.prevFocus);
    else Nav.restore();
  }
};

// ============================================================ keys
var lastBack = 0, lastMove = 0;
function onBack() {
  if (Modal.open) { Modal.close(); return; }
  if (Router.back()) return;
  if (!Nav.cur || !Nav.cur.closest('#side')) {
    var top = Router.top();
    Nav.focus($('#side .si[data-v="' + (top ? top.name : 'home') + '"]') || $('#side .si'));
    return;
  }
  if (Router.top() && Router.top().name !== 'home') { Router.root('home'); return; }
  if (Date.now() - lastBack < 2500) { Hist.save.flush(); if (BRIDGE) BRIDGE.exit(); return; }
  lastBack = Date.now();
  toast('Нажмите «Назад» ещё раз, чтобы выйти');
}

window.tvKey = function (k, rep, ch) {
  try { handleKey(k, rep | 0, ch); } catch (e) {
    console.error(e);
    // self-heal: make sure something sensible has focus
    try { if (!Player.open && !Modal.open && (!Nav.cur || !document.body.contains(Nav.cur))) Nav.restore(); } catch (x) {}
  }
};
function handleKey(k, rep, ch) {
  if (!rep && k !== 'up' && k !== 'down' && k !== 'left' && k !== 'right') intent++;
  if (Player.open && !Modal.open) { Player.key(k, rep); return; }
  if (!Player.open && !Modal.open && (!Nav.cur || !document.body.contains(Nav.cur) || Nav.cur.closest('.off'))) {
    var tv = Router.top();
    if (tv && !Nav.first(tv.el) && k !== 'back' && k !== 'search') {
      // the screen is still loading (or empty): only "left" opens the menu, other keys wait
      if (k === 'left') Nav.focus($('#side .si.cur') || $('#side .si'));
      return;
    }
    Nav.restore();
  }
  switch (k) {
    case 'up': case 'down': case 'left': case 'right':
      var now = Date.now();
      if (rep && now - lastMove < 70) return;
      lastMove = now;
      Nav.move(k);
      break;
    case 'ok': if (!rep) activate(Nav.cur); break;
    case 'back': if (!rep) onBack(); break;
    case 'menu': case 'info':
      if (rep) return;
      if (Nav.cur && Nav.cur.classList.contains('card') && !Modal.open) {
        Router.push('anime', { id: Nav.cur.getAttribute('data-id'), url: Nav.cur.getAttribute('data-url') });
      }
      break;
    case 'search': if (!rep && !Modal.open) Router.root('search'); break;
    case 'char': case 'del': case 'space':
      var v = Router.top();
      if (!Modal.open && v && v.view.onChar) v.view.onChar(k, ch || '');
      break;
  }
}
window.tvKeyUp = function () {};
window.tvLifecycle = function (s) {
  if (s === 'pause') { if (Player.open) Player.persist(); Hist.save.flush(); }
};

// Desktop/browser fallback (for development only): keyboard + mouse.
if (!BRIDGE) {
  var MAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back', Backspace: 'back', ContextMenu: 'menu', F2: 'menu', MediaPlayPause: 'playpause' };
  var reps = {};
  document.addEventListener('keydown', function (e) {
    var k = MAP[e.key];
    if (!k && e.key && e.key.length === 1) { tvKey(e.key === ' ' ? 'space' : 'char', 0, e.key); e.preventDefault(); return; }
    if (!k) return;
    e.preventDefault();
    reps[k] = e.repeat ? (reps[k] || 0) + 1 : 0;
    tvKey(k, reps[k]);
  });
  document.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.f');
    if (f) { Nav.focus(f); activate(f); }
  });
}

// ============================================================ boot
function applyScale() {
  var base = Math.min(window.innerWidth / 1280, window.innerHeight / 720) * 16 * (S.scale || 1);
  document.documentElement.style.fontSize = base + 'px';
  REM = base;
  document.body.classList.toggle('noanim', !S.anim);
}
window.addEventListener('resize', applyScale);

$('#side-nav')._edge = function (dir) {
  if (dir !== 'right') return false;
  var v = Router.top();
  var el = v && v.focusEl && v.el.contains(v.focusEl) ? v.focusEl : Nav.first(v && v.el);
  if (el) Nav.focus(el);
  return true;
};

window.__ytv = { Router: Router, Nav: Nav, Player: Player };

window.addEventListener('error', function (e) { console.error('err', e.message); });
window.addEventListener('unhandledrejection', function (e) { console.error('rej', e.reason); if (e.preventDefault) e.preventDefault(); });

applyScale();
Player.init();
setTimeout(prunePC, 15000);
Router.root('home');
})();
