/* Yummy TV player helper.
 * Injected at document start into every frame (Android: WebViewCompat.addDocumentStartJavaScript).
 * Inside a player frame it finds the episode <video>, obeys commands sent by the app
 * via postMessage and reports playback status back to the app. Commands that reach a
 * frame without a video are forwarded to its child frames. */
(function () {
  'use strict';
  try {
    if (window.__ytvInjected) return;
    window.__ytvInjected = true;
    if (location.hostname === 'old.yummyani.me' && location.pathname.indexOf('/tvapp/') === 0) return;
  } catch (e) { return; }

  var cfg = { adblock: true, clean: true };
  var lastPost = 0;

  // No pop-ups and no cursor inside players.
  try { window.open = function () { return null; }; } catch (e) {}
  // At document start the page may not even have <html> yet: attach styles as soon as it exists.
  function addStyle(css) {
    var el = document.createElement('style');
    el.textContent = css;
    function attach() {
      var root = document.head || document.documentElement;
      if (!root) return false;
      root.appendChild(el);
      return true;
    }
    if (!attach()) {
      var mo = new MutationObserver(function () { if (attach()) mo.disconnect(); });
      mo.observe(document, { childList: true, subtree: true });
    }
    // keep our style last so the player's own CSS can't override it
    document.addEventListener('DOMContentLoaded', function () {
      if (el.parentNode && document.head && el.parentNode !== document.head) document.head.appendChild(el);
    });
    return el;
  }
  addStyle('*{cursor:none!important}');

  // The app draws its own controls: hide the player's interface, keep only the picture and subtitles.
  var CLEAN_CSS = 'html,body{background:#000!important}' +
    'body *{visibility:hidden!important;transition:none!important}' +
    'video,iframe,[class*="subtitle"],[class*="subtitle"] *,[class*="Subtitle"],[class*="Subtitle"] *,' +
    '[class*="caption"],[class*="caption"] *,[class*="text-track"],[class*="text-track"] *,[class*="cue"],[class*="cue"] *,' +
    '[id*="subtitle"],[id*="subtitle"] *{visibility:visible!important}' +
    'video::-webkit-media-controls{display:none!important}';
  var cleanEl = null, pinned = null;
  function setClean(on) {
    try {
      if (on && !cleanEl) {
        cleanEl = addStyle(CLEAN_CSS);
      } else if (!on && cleanEl) { cleanEl.remove(); cleanEl = null; unpin(); }
    } catch (e) {}
  }
  // Belt and braces: whatever the player's markup, lift the picture above everything else in the frame,
  // full screen. Player buttons, spinners and pop-ups end up underneath it.
  var PIN = { position: 'fixed', left: '0', top: '0', right: 'auto', bottom: 'auto', width: '100vw', height: '100vh',
    'max-width': 'none', 'max-height': 'none', margin: '0', 'z-index': '2147483647', 'object-fit': 'contain',
    background: '#000', visibility: 'visible', opacity: '1', display: 'block', border: '0' };
  function pin(el) {
    if (pinned === el) return;
    unpin();
    pinned = el;
    for (var k in PIN) el.style.setProperty(k, PIN[k], 'important');
    try { el.controls = false; } catch (e) {}
  }
  function unpin() {
    if (!pinned) return;
    for (var k in PIN) pinned.style.removeProperty(k);
    pinned = null;
  }
  function biggestFrame() {
    var fs = document.getElementsByTagName('iframe'), best = null, ba = 0;
    for (var i = 0; i < fs.length; i++) {
      var r = fs[i].getBoundingClientRect(), a = r.width * r.height;
      if (a > ba) { ba = a; best = fs[i]; }
    }
    return ba > 40000 ? best : null;
  }
  function keepClean() {
    if (!cleanEl) return;
    if (!cleanEl.isConnected) { var root = document.head || document.documentElement; if (root) root.appendChild(cleanEl); }
    var v = mainVideo();
    if (v && (v.readyState > 0 || v.currentTime > 0)) pin(v);
    else if (!v) { var f = biggestFrame(); if (f) pin(f); }
  }
  setClean(true);

  function videos() { return document.getElementsByTagName('video'); }

  // The episode is the longest video in the frame; short ones are ads/previews.
  function mainVideo() {
    var vs = videos(), best = null, bd = -1;
    for (var i = 0; i < vs.length; i++) {
      var d = vs[i].duration;
      d = isFinite(d) ? d : 0;
      if (d > bd) { bd = d; best = vs[i]; }
    }
    return best;
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = window.getComputedStyle(el);
    return cs.display !== 'none' && (cleanEl || (cs.visibility !== 'hidden' && cs.opacity !== '0'));
  }

  function fire(el) {
    try {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (t) {
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
      el.click();
      return true;
    } catch (e) { return false; }
  }

  var PLAY_SELECTORS = [
    '.play_button', '.play-button', '.vjs-big-play-button', '.plyr__control--overlaid',
    '[class*="big-play"]', '[class*="play_button"]', '[class*="playButton"]',
    '[aria-label="Play"]', '[aria-label="Воспроизвести"]', '[title="Воспроизвести"]',
    'pjsdiv[title="Play"]'
  ];

  function clickPlay() {
    for (var i = 0; i < PLAY_SELECTORS.length; i++) {
      var list = document.querySelectorAll(PLAY_SELECTORS[i]);
      for (var j = 0; j < list.length; j++) {
        if (visible(list[j])) { fire(list[j]); return true; }
      }
    }
    return false;
  }

  var SKIP_RE = /^\s*(пропустить рекламу|пропустить|skip ad|skip|закрыть рекламу)\s*(\d+)?\s*[›»>]?\s*$/i;
  function clickSkipAd() {
    var els = document.querySelectorAll('button, a, div, span');
    for (var i = 0; i < els.length && i < 4000; i++) {
      var el = els[i];
      if (el.children.length > 2) continue;
      var t = el.textContent;
      if (t && t.length < 40 && SKIP_RE.test(t) && visible(el)) { fire(el); return true; }
    }
    return false;
  }

  // Quality menu inside the player: elements whose text starts with "720p", "1080p", "480p HD"...
  var Q_RE = /^\s*(\d{3,4})\s*p/i;
  function qualityMenu() {
    var els = document.querySelectorAll('li, button, a, div, span, pjsdiv'), all = [];
    for (var i = 0; i < els.length && i < 8000; i++) {
      var el = els[i];
      if (el.children.length > 3) continue;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 16) continue;
      var m = t.match(Q_RE);
      if (m) all.push({ el: el, n: parseInt(m[1], 10), label: m[1] + 'p' });
    }
    if (!all.length) return null;
    // drop wrappers whose match comes only from a matching child
    all = all.filter(function (x) { return !all.some(function (y) { return y !== x && x.el.contains(y.el); }); });
    // the menu = the parent holding the most quality entries; a lone match elsewhere is the "current quality" button
    var groups = [], best = null;
    all.forEach(function (x) {
      var g = null;
      for (var k = 0; k < groups.length; k++) if (groups[k].p === x.el.parentNode) g = groups[k];
      if (!g) { g = { p: x.el.parentNode, items: [] }; groups.push(g); }
      g.items.push(x);
    });
    groups.forEach(function (g) { if (!best || g.items.length > best.items.length) best = g; });
    var items = best.items.length >= 2 ? best.items : all;
    var seen = {}, uniq = [];
    items.forEach(function (x) { if (!seen[x.label]) { seen[x.label] = 1; uniq.push(x); } });
    uniq.sort(function (a, b) { return b.n - a.n; });
    var cur = null;
    all.forEach(function (x) { if (items.indexOf(x) < 0) cur = x.label; });
    return { items: uniq, cur: cur };
  }
  function postQ(menu, picked) {
    try {
      window.top.postMessage({ tvp: 'qlist', list: menu.items.map(function (x) { return x.label; }), cur: picked || menu.cur }, '*');
    } catch (e) {}
  }

  // Player-side errors ("Упс. Ошибка! … Перезагрузить плеер"): press the player's own retry button,
  // and tell the app when retrying didn't help so it can switch to another player.
  var RELOAD_RE = /^\s*(перезагрузить(\s+плеер)?|повторить(\s+попытку)?|обновить|retry|reload|try again)\s*$/i;
  var errTries = 0, errLast = 0, errReported = false;
  function checkError() {
    var v = mainVideo();
    if (v && v.currentTime > 0.5) { errTries = 0; return; }
    var now = Date.now();
    if (now - errLast < 2500) return;
    var els = document.querySelectorAll('button, a, div, span');
    for (var i = 0; i < els.length && i < 4000; i++) {
      var el = els[i];
      if (el.children.length > 2) continue;
      var t = el.textContent;
      if (!t || t.length > 30 || !RELOAD_RE.test(t)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      errLast = now;
      if (errTries < 1) {
        errTries++;
        fire(el);
        try { window.top.postMessage({ tvp: 'perror', tries: errTries }, '*'); } catch (e) {}
      } else if (!errReported) {
        errReported = true;
        try { window.top.postMessage({ tvp: 'perror', fatal: true }, '*'); } catch (e) {}
      }
      return;
    }
  }

  function forward(msg) {
    for (var i = 0; i < window.frames.length; i++) {
      try { window.frames[i].postMessage(msg, '*'); } catch (e) {}
    }
  }

  function status(force) {
    var v = mainVideo();
    if (!v) return;
    var now = Date.now();
    if (!force && now - lastPost < 900) return;
    lastPost = now;
    try {
      window.top.postMessage({
        tvp: 'status',
        t: v.currentTime || 0,
        d: isFinite(v.duration) ? v.duration : 0,
        paused: !!v.paused,
        ended: !!v.ended,
        buf: v.readyState < 3,
        host: location.hostname
      }, '*');
    } catch (e) {}
  }

  function run(cmd, value) {
    var v = mainVideo();
    switch (cmd) {
      case 'play':
        if (v && v.readyState > 0) {
          var p = v.play();
          if (p && p.catch) p.catch(function () { clickPlay(); });
        } else if (!clickPlay()) {
          return false;
        }
        return true;
      case 'pause':
        if (v) { v.pause(); return true; }
        return false;
      case 'seek':
        if (v && isFinite(value)) {
          var d = isFinite(v.duration) ? v.duration : value + 1;
          v.currentTime = Math.max(0, Math.min(value, d - 1));
          return true;
        }
        return false;
      case 'click':
        return clickSkipAd() || clickPlay();
      case 'status':
        status(true);
        return !!v;
      case 'qlist':
        var ql = qualityMenu();
        if (!ql) return false;
        postQ(ql);
        return true;
      case 'qpick': // value: 'auto' = best available, or a number like 480 = best not above it
        var qm = qualityMenu();
        if (!qm || !qm.items.length) return false;
        var target = qm.items[0];
        if (value && value !== 'auto') {
          var lim = parseInt(value, 10);
          target = qm.items.filter(function (x) { return x.n <= lim; })[0] || qm.items[qm.items.length - 1];
        }
        if (target.label !== qm.cur) fire(target.el);
        postQ(qm, target.label);
        return true;
      case 'qset':
        var qs2 = qualityMenu();
        if (!qs2) return false;
        for (var i = 0; i < qs2.items.length; i++) if (qs2.items[i].label === value) { fire(qs2.items[i].el); postQ(qs2, value); return true; }
        return false;
    }
    return false;
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m !== 'object' || !m.tvp) return;
    if (m.tvp === 'config') { cfg = m; setClean(m.clean !== false); forward(m); return; }
    if (m.tvp !== 'cmd') return;
    var handled = run(m.cmd, m.value);
    if (!handled || !mainVideo()) forward(m);
  }, false);

  function hook(v) {
    if (v.__ytv) return;
    v.__ytv = true;
    ['play', 'pause', 'seeked', 'ended', 'loadedmetadata', 'waiting', 'playing'].forEach(function (t) {
      v.addEventListener(t, function () { status(true); });
    });
    v.addEventListener('timeupdate', function () { status(false); });
    v.addEventListener('playing', keepClean);
  }

  setInterval(function () {
    var vs = videos();
    for (var i = 0; i < vs.length; i++) hook(vs[i]);
    // Only look for a "skip ad" button while no full-length episode is playing.
    var mv = mainVideo();
    if (cfg.adblock && (!mv || !(mv.duration > 180))) clickSkipAd();
    keepClean();
    checkError();
  }, 700);
})();
