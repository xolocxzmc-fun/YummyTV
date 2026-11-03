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
  var cleanEl = null;
  function setClean(on) {
    try {
      if (on && !cleanEl) {
        cleanEl = addStyle(CLEAN_CSS);
      } else if (!on && cleanEl) { cleanEl.remove(); cleanEl = null; }
    } catch (e) {}
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

  var Q_RE = /^\s*(\d{3,4})\s*p\b/i;
  function qualityItems() {
    var els = document.querySelectorAll('li, button, a, div, span, pjsdiv'), seen = {}, out = [];
    for (var i = 0; i < els.length && i < 6000; i++) {
      var el = els[i];
      if (el.children.length > 2) continue;
      var t = (el.textContent || '').trim();
      if (t.length > 14) continue;
      var m = t.match(Q_RE);
      if (!m) continue;
      var label = m[1] + 'p';
      if (seen[label]) continue;
      seen[label] = 1;
      out.push({ label: label, el: el });
    }
    out.sort(function (a, b) { return parseInt(b.label, 10) - parseInt(a.label, 10); });
    return out;
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
        var q = qualityItems();
        if (!q.length) return false;
        try { window.top.postMessage({ tvp: 'qlist', list: q.map(function (x) { return x.label; }) }, '*'); } catch (e) {}
        return true;
      case 'qset':
        var items = qualityItems();
        for (var i = 0; i < items.length; i++) if (items[i].label === value) { fire(items[i].el); return true; }
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
  }

  setInterval(function () {
    var vs = videos();
    for (var i = 0; i < vs.length; i++) hook(vs[i]);
    // Only look for a "skip ad" button while no full-length episode is playing.
    var mv = mainVideo();
    if (cfg.adblock && (!mv || !(mv.duration > 180))) clickSkipAd();
  }, 1000);
})();
