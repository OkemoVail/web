(function () {
  'use strict';

  var policy = window.LumenHeroPolicy;
  var hero = document.getElementById('lumen-hero');
  var stage = document.getElementById('lumen-stage');
  var video = document.getElementById('lumen-fallback');
  var locationLabel = document.getElementById('lumen-location');
  var copy = document.getElementById('lumen-copy');
  var playback = document.getElementById('lumen-playback');
  var status = document.getElementById('lumen-status');
  if (!policy || !hero || !stage || !video || !locationLabel || !copy || !playback) return;

  var signals = collectSignals();
  var mode = 'poster';
  var state = 'loading';
  var active = true;
  var inViewport = true;
  var visible = !document.hidden;
  var destroyed = false;
  var elapsedMs = 0;
  var lastFrame = 0;
  var lastHeldRender = 0;
  var rafId = 0;
  var scene = null;
  var sceneAbort = null;
  var announced = false;
  var fallingBack = false;
  var resizeObserver;
  var intersectionObserver;
  var resolveReady;
  var ready = new Promise(function (resolve) { resolveReady = resolve; });

  function collectSignals() {
    var canvas = document.createElement('canvas');
    var context = null;
    try { context = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (_) {}
    var webgl = Boolean(context);
    if (context) context.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      automated: navigator.webdriver === true,
      saveData: navigator.connection?.saveData === true,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      width: window.innerWidth,
      dpr: window.devicePixelRatio,
      webgl: webgl,
    };
  }

  function assets() {
    var base = 'assets/lumen/';
    return {
      earthDay: { mobile: base + 'earth-day-mobile.webp', desktop: base + 'earth-day-desktop.webp' },
      earthNight: { mobile: base + 'earth-night-mobile.webp', desktop: base + 'earth-night-desktop.webp' },
      earthClouds: { mobile: base + 'earth-clouds-mobile.webp', desktop: base + 'earth-clouds-desktop.webp' },
      earthNormal: { mobile: base + 'earth-normal-mobile.webp', desktop: base + 'earth-normal-desktop.webp' },
      moonAlbedo: { mobile: base + 'moon-albedo-mobile.webp', desktop: base + 'moon-albedo-desktop.webp' },
      moonNormal: { mobile: base + 'moon-normal-mobile.webp', desktop: base + 'moon-normal-desktop.webp' },
    };
  }

  function setPresentation(nextMode, nextState) {
    mode = nextMode;
    state = nextState;
    hero.dataset.mode = mode;
    hero.dataset.state = state;
    playback.hidden = mode === 'poster';
    if (mode !== 'poster') playback.textContent = state === 'held' ? 'Replay' : 'Skip intro';
  }

  function announceReady() {
    if (announced || !status) return;
    announced = true;
    status.textContent = 'Lumen introduction ready';
  }

  function updateLayers(frame) {
    locationLabel.textContent = frame.label;
    locationLabel.hidden = !frame.label;
    copy.hidden = !frame.copyVisible;
  }

  function heldFrame() {
    elapsedMs = policy.DURATION;
    updateLayers(policy.timelineAt(elapsedMs));
    setPresentation(mode, 'held');
    video.pause();
    try { if (video.readyState >= 1) video.currentTime = video.duration || policy.DURATION / 1000; } catch (_) {}
    try {
      scene?.render({ ...policy.timelineAt(elapsedMs), elapsedMs: elapsedMs }, 0);
    } catch (_) {
      if (mode === 'webgl') fallBack('runtime');
    }
    announceReady();
  }

  function shouldRender() { return !destroyed && active && visible && inViewport; }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastFrame = 0;
  }

  function frame(now) {
    rafId = 0;
    if (!shouldRender()) return;
    var delta = lastFrame ? Math.min(100, now - lastFrame) : 0;
    lastFrame = now;
    if (state === 'playing') elapsedMs = Math.min(policy.DURATION, elapsedMs + delta);
    var timeline = policy.timelineAt(elapsedMs);
    updateLayers(timeline);
    try {
      if (mode === 'webgl' && (state !== 'held' || now - lastHeldRender >= 250)) {
        var heldDelta = state === 'held' ? now - lastHeldRender : 0;
        lastHeldRender = now;
        scene.render({ ...timeline, elapsedMs: elapsedMs + heldDelta }, delta);
      }
      if (mode === 'video' && Math.abs(video.currentTime * 1000 - elapsedMs) > 180) video.currentTime = elapsedMs / 1000;
    } catch (_) { if (mode === 'webgl') fallBack('runtime'); else showPoster('runtime'); return; }
    if (elapsedMs >= policy.DURATION) heldFrame();
    if (state === 'playing' || mode === 'webgl' && state === 'held') rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (!rafId && shouldRender() && (state === 'playing' || mode === 'webgl' && state === 'held')) rafId = requestAnimationFrame(frame);
  }

  function chooseVideoSource() {
    var source = Array.from(video.querySelectorAll('source')).find(function (candidate) {
      return !candidate.media || window.matchMedia(candidate.media).matches;
    });
    if (!source) source = video.querySelector('source');
    if (source && !video.getAttribute('src')) {
      video.src = source.dataset.src;
      video.load();
    }
  }

  function showPoster() {
    fallingBack = true;
    stopLoop();
    sceneAbort?.abort();
    scene?.dispose();
    scene = null;
    video.pause();
    Array.from(video.querySelectorAll('source')).forEach(function (source) { source.removeAttribute('src'); });
    video.removeAttribute('src');
    video.load();
    mode = 'poster';
    heldFrame();
    resolveReady({ mode: mode });
  }

  function startVideo() {
    mode = 'video';
    chooseVideoSource();
    setPresentation(mode, 'playing');
    video.play().then(function () {
      announceReady();
      startLoop();
      resolveReady({ mode: mode });
    }, function () { showPoster('autoplay'); });
  }

  function fallBack() {
    if (fallingBack || destroyed) return;
    fallingBack = true;
    stopLoop();
    sceneAbort?.abort();
    scene?.dispose();
    scene = null;
    startVideo();
  }

  async function startWebgl() {
    sceneAbort = new AbortController();
    try {
      var module = await import('./lumen-scene.js');
      if (destroyed || sceneAbort.signal.aborted) return;
      scene = await (window.createLumenScene || module.createLumenScene)({
        mount: stage,
        quality: policy.chooseQuality(signals),
        assets: assets(),
        signal: sceneAbort.signal,
        onContextLost: function () { fallBack('context-loss'); },
      });
      var rect = stage.getBoundingClientRect();
      scene.resize(rect.width, rect.height);
      var warmStart = performance.now();
      scene.render({ ...policy.timelineAt(0), elapsedMs: 0 }, 0);
      signals.warmupFps = 1000 / Math.max(1, performance.now() - warmStart);
      if (policy.chooseMode(signals) !== 'webgl') return fallBack('warm-up');
      mode = 'webgl';
      setPresentation(mode, 'playing');
      announceReady();
      startLoop();
      resolveReady({ mode: mode });
    } catch (error) {
      if (error?.name !== 'AbortError') fallBack('scene');
    }
  }

  function skip() {
    if (mode === 'poster' || destroyed) return;
    stopLoop();
    heldFrame();
    startLoop();
  }

  function replay() {
    if (mode === 'poster' || destroyed) return;
    stopLoop();
    elapsedMs = 0;
    setPresentation(mode, 'playing');
    if (mode === 'video') {
      video.currentTime = 0;
      video.play().catch(function () { showPoster('replay'); });
    }
    scene?.resume();
    startLoop();
  }

  function setActive(nextActive) {
    active = Boolean(nextActive);
    if (!active) {
      stopLoop();
      if (mode !== 'poster') heldFrame();
      scene?.pause();
      return;
    }
    scene?.resume();
    startLoop();
  }

  function handleVisibility() {
    visible = !document.hidden;
    if (!visible) {
      stopLoop();
      video.pause();
      scene?.pause();
    } else if (active) {
      scene?.resume();
      startLoop();
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopLoop();
    sceneAbort?.abort();
    scene?.dispose();
    video.pause();
    document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    playback.removeEventListener('click', handlePlayback);
  }

  function handlePlayback() { if (state === 'held') replay(); else skip(); }
  playback.addEventListener('click', handlePlayback);
  video.addEventListener('error', function () { showPoster('video-error'); });
  document.addEventListener('visibilitychange', handleVisibility);
  if ('IntersectionObserver' in window) {
    intersectionObserver = new IntersectionObserver(function (entries) {
      inViewport = entries[0]?.isIntersecting !== false;
      if (!inViewport) { stopLoop(); video.pause(); scene?.pause(); }
      else if (active && visible) { scene?.resume(); startLoop(); }
    });
    intersectionObserver.observe(hero);
  }
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(function (entries) {
      var rect = entries[0].contentRect;
      scene?.resize(rect.width, rect.height);
    });
    resizeObserver.observe(stage);
  }

  window.LumenHero = {
    ready: ready,
    setActive: setActive,
    skip: skip,
    replay: replay,
    destroy: destroy,
    getState: function () {
      return { mode: mode, state: state, active: active, elapsedMs: elapsedMs, phase: policy.timelineAt(elapsedMs).phase };
    },
  };

  if (signals.reduceMotion || signals.automated) showPoster('motion-policy');
  else if (policy.chooseMode(signals) === 'video') startVideo();
  else startWebgl();
})();
