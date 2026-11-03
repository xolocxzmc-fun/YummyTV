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

  var cfg = { adblock: true };
  var lastPost = 0;

  // No pop-ups and no cursor inside players.
  try { window.open = function () { return null; }; } catch (e) {}
  try {
    var st = document.createElement('style');
    st.textContent = '*{cursor:none!important}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

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
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
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
    }
    return false;
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m !== 'object' || !m.tvp) return;
    if (m.tvp === 'config') { cfg = m; forward(m); return; }
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
