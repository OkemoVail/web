(function () {
  'use strict';

  // GPU capability probes and shader compilation must not block a page slide.
  if (window.GlassPageBridge && !window.__glassPageSettled) {
    addEventListener('glasspagesettled', initialize, { once: true });
  } else initialize();
  function initialize() {

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
  var active = hero.getAttribute('data-carousel-active') !== 'false';
  var inViewport = true;
  var visible = !document.hidden;
  var destroyed = false;
  var elapsedMs = 0;
  var lastFrame = 0;
  var lastHeldRender = 0;
  var heldMotionMs = 0;
  var rafId = 0;
  var generation = 0;
  var replayCount = 0;
  var scene = null;
  var sceneAbort = null;
  var pendingVideo = false;
  var announced = false;
  var resizeObserver;
  var intersectionObserver;
  var resolveReady;
  var readySettled = false;
  var ready = new Promise(function (resolve) { resolveReady = resolve; });
  var SLOW_FRAME_WINDOW = 45;
  var SLOW_FRAME_GRACE_MS = 1000;
  var slowFrames = [];

  function collectSignals() {
    var canvas = document.createElement('canvas');
    var context = null;
    // The pre-rendered cinematic avoids synchronous GPU context/shader work
    // competing with live backdrop glass in the persistent navigation shell.
    if (!window.GlassPageBridge) {
      try { context = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (_) {}
    }
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

  function heldProjections() {
    var mobile = window.innerWidth <= 640;
    var aspect = stage.clientWidth / stage.clientHeight;
    var camera = [0, -21, 0.4];
    var target = [3.2, 0, 1.2];
    var forward = normalize(target.map(function (value, index) { return value - camera[index]; }));
    var right = normalize(cross(forward, [0, 0, 1]));
    var up = cross(right, forward);
    var tan = Math.tan(58 * Math.PI / 360);
    function normalize(vector) {
      var length = Math.hypot.apply(Math, vector);
      return vector.map(function (value) { return value / length; });
    }
    function cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    function dot(a, b) { return a.reduce(function (sum, value, index) { return sum + value * b[index]; }, 0); }
    function project(position, radius) {
      var relative = position.map(function (value, index) { return value - camera[index]; });
      var depth = dot(relative, forward);
      var x = 0.5 + dot(relative, right) / (2 * depth * tan * aspect);
      if (mobile) x -= -0.14;
      return { x: x, y: 0.5 - dot(relative, up) / (2 * depth * tan), radius: radius / (2 * depth * tan) };
    }
    return {
      earth: project([mobile ? 2.5 : 4.2, 0, 1.2], 2.35),
      moon: project([mobile ? 0.25 : 0.7, -1.1, -0.45], 0.72),
    };
  }

  function current(attempt) { return !destroyed && attempt === generation; }

  function settleReady(result) {
    if (readySettled) return;
    readySettled = true;
    resolveReady(result);
  }

  function setPresentation(nextMode, nextState) {
    if (destroyed) return;
    mode = nextMode;
    state = nextState;
    hero.dataset.mode = mode;
    hero.dataset.state = state;
    playback.hidden = mode === 'poster';
    // Keep the glass-owned content wrapper attached when the label changes.
    var playbackLabel = playback.querySelector(':scope > .lgp-content') || playback;
    var nextLabel = state === 'held' ? 'Replay' : 'Skip intro';
    if (playbackLabel.textContent !== nextLabel) playbackLabel.textContent = nextLabel;
  }

  function announceReady() {
    if (destroyed || announced || !status) return;
    announced = true;
    status.textContent = 'Lumen introduction ready';
  }

  function updateLayers(frame) {
    if (destroyed) return;
    locationLabel.textContent = frame.label;
    locationLabel.hidden = !frame.label;
    copy.hidden = !frame.copyVisible;
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastFrame = 0;
    slowFrames = [];
  }

  function canRun() { return !destroyed && active && visible && inViewport; }

  function clearVideoSource() {
    video.pause();
    video.removeAttribute('src');
    Array.from(video.querySelectorAll('source')).forEach(function (source) { source.removeAttribute('src'); });
    video.load();
  }

  function renderHeldSafely() {
    if (!scene || mode !== 'webgl') return;
    try { scene.render({ ...policy.timelineAt(policy.DURATION), elapsedMs: policy.DURATION }, 0); } catch (_) {}
  }

  function enterHeld(renderFinal) {
    stopLoop();
    video.pause();
    elapsedMs = policy.DURATION;
    updateLayers(policy.timelineAt(elapsedMs));
    setPresentation(mode, 'held');
    if (mode === 'video') {
      try { if (video.readyState >= 1) video.currentTime = Math.min(video.duration || 8, 8); } catch (_) {}
    }
    if (renderFinal) renderHeldSafely();
    announceReady();
  }

  function schedule(attempt) {
    if (!rafId && current(attempt) && canRun() && (state === 'playing' || mode === 'webgl' && state === 'held')) {
      rafId = requestAnimationFrame(function (now) { frame(now, attempt); });
    }
  }

  function frame(now, attempt) {
    rafId = 0;
    if (!current(attempt) || !canRun()) return;
    var delta = lastFrame ? Math.min(100, now - lastFrame) : 0;
    lastFrame = now;
    if (mode === 'webgl' && state === 'playing' && elapsedMs >= SLOW_FRAME_GRACE_MS && delta > 0) {
      slowFrames.push(delta);
      if (slowFrames.length > SLOW_FRAME_WINDOW) slowFrames.shift();
      if (slowFrames.length === SLOW_FRAME_WINDOW) {
        var averageInterval = slowFrames.reduce(function (sum, value) { return sum + value; }, 0) / slowFrames.length;
        var slowRatio = slowFrames.filter(function (value) { return value > 1000 / 30; }).length / slowFrames.length;
        if (averageInterval > 1000 / 30 && slowRatio >= 0.8) {
          showPoster('sustained-slow', attempt);
          return;
        }
      }
    }
    if (state === 'playing') elapsedMs = Math.min(policy.DURATION, elapsedMs + delta);
    var timeline = policy.timelineAt(elapsedMs);
    updateLayers(timeline);
    try {
      if (mode === 'webgl' && (state !== 'held' || now - lastHeldRender >= 250)) {
        var heldDelta = state === 'held' ? now - lastHeldRender : 0;
        lastHeldRender = now;
        heldMotionMs += heldDelta;
        scene.render({ ...timeline, elapsedMs: elapsedMs + heldMotionMs }, delta);
      }
      if (mode === 'video' && Math.abs(video.currentTime * 1000 - elapsedMs) > 180) video.currentTime = elapsedMs / 1000;
    } catch (_) {
      if (mode === 'webgl') showPoster('runtime', attempt);
      else showPoster('runtime', attempt);
      return;
    }
    if (elapsedMs >= policy.DURATION) enterHeld(true);
    schedule(attempt);
  }

  function chooseVideoSource() {
    var source = Array.from(video.querySelectorAll('source')).find(function (candidate) {
      return !candidate.media || window.matchMedia(candidate.media).matches;
    }) || video.querySelector('source');
    if (source && !video.getAttribute('src')) {
      video.src = source.dataset.src;
      video.load();
    }
  }

  function showPoster(reason, attempt) {
    if (attempt != null && !current(attempt)) return;
    generation += 1;
    pendingVideo = false;
    stopLoop();
    sceneAbort?.abort();
    scene?.dispose();
    scene = null;
    clearVideoSource();
    mode = 'poster';
    elapsedMs = policy.DURATION;
    updateLayers(policy.timelineAt(elapsedMs));
    setPresentation('poster', 'held');
    announceReady();
    settleReady({ mode: 'poster' });
  }

  function handleVideoError(event) {
    var attempt = Number(video.dataset.attempt);
    if (!destroyed && mode === 'video' && current(attempt) && event.currentTarget === video) showPoster('video-error', attempt);
  }

  function handleVideoEnded() {
    var attempt = Number(video.dataset.attempt);
    if (mode === 'video' && current(attempt)) enterHeld(false);
  }

  function startVideo(attempt) {
    if (!current(attempt)) return;
    if (!canRun()) {
      pendingVideo = true;
      setPresentation('poster', 'loading');
      return;
    }
    pendingVideo = false;
    mode = 'video';
    video.dataset.attempt = String(attempt);
    chooseVideoSource();
    setPresentation('video', 'playing');
    video.play().then(function () {
      if (!current(attempt) || mode !== 'video') return;
      announceReady();
      settleReady({ mode: 'video' });
      schedule(attempt);
    }, function () {
      if (current(attempt) && mode === 'video') showPoster('autoplay', attempt);
    });
  }

  async function startWebgl() {
    var attempt = ++generation;
    sceneAbort = new AbortController();
    try {
      var module = await import('./lumen-scene.js');
      if (!current(attempt)) return;
      var candidate = await (window.createLumenScene || module.createLumenScene)({
        mount: stage,
        quality: policy.chooseQuality(signals),
        assets: assets(),
        signal: sceneAbort.signal,
        onContextLost: function () { showPoster('context-loss', attempt); },
      });
      if (!current(attempt)) { candidate.dispose(); return; }
      scene = candidate;
      var rect = stage.getBoundingClientRect();
      scene.resize(rect.width, rect.height);
      mode = 'webgl';
      elapsedMs = 0;
      setPresentation('webgl', 'playing');
      announceReady();
      settleReady({ mode: 'webgl' });
      schedule(attempt);
    } catch (error) {
      if (current(attempt) && error?.name !== 'AbortError') showPoster('scene', attempt);
    }
  }

  function skip() {
    if (mode === 'poster' || destroyed) return;
    enterHeld(true);
    schedule(generation);
  }

  function replay() {
    if (mode === 'poster' || destroyed || !canRun()) return;
    replayCount += 1;
    var attempt = generation;
    stopLoop();
    elapsedMs = 0;
    setPresentation(mode, 'playing');
    scene?.resume();
    if (mode === 'video') {
      video.currentTime = 0;
      video.play().catch(function () { if (current(attempt)) showPoster('replay', attempt); });
    }
    schedule(attempt);
  }

  function pauseLifecycle(finalize) {
    stopLoop();
    video.pause();
    if (finalize && mode !== 'poster') enterHeld(true);
    scene?.pause();
  }

  function resumeLifecycle() {
    if (!canRun()) return;
    if (pendingVideo) { startVideo(generation); return; }
    scene?.resume();
    if (state === 'playing' && mode === 'video') {
      var attempt = generation;
      video.play().catch(function () { if (current(attempt)) showPoster('resume', attempt); });
    }
    schedule(generation);
  }

  function setActive(nextActive) {
    if (destroyed) return;
    active = Boolean(nextActive);
    if (!active) pauseLifecycle(true);
    else resumeLifecycle();
  }

  function handleVisibility() {
    if (destroyed) return;
    visible = !document.hidden;
    if (!visible) pauseLifecycle(false);
    else resumeLifecycle();
  }

  function handleIntersection(entries) {
    if (destroyed) return;
    inViewport = entries[0]?.isIntersecting !== false;
    if (!inViewport) pauseLifecycle(false);
    else resumeLifecycle();
  }

  function handleResize(entries) {
    if (destroyed || !scene) return;
    var rect = entries[0].contentRect;
    scene.resize(rect.width, rect.height);
  }

  function handlePlayback() { if (!destroyed) state === 'held' ? replay() : skip(); }

  function destroy() {
    if (destroyed) return;
    generation += 1;
    destroyed = true;
    pendingVideo = false;
    stopLoop();
    sceneAbort?.abort();
    scene?.dispose();
    scene = null;
    video.removeEventListener('error', handleVideoError);
    video.removeEventListener('ended', handleVideoEnded);
    clearVideoSource();
    document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    playback.removeEventListener('click', handlePlayback);
    settleReady({ mode: 'poster' });
  }

  playback.addEventListener('click', handlePlayback);
  video.addEventListener('error', handleVideoError);
  video.addEventListener('ended', handleVideoEnded);
  document.addEventListener('visibilitychange', handleVisibility);
  if ('IntersectionObserver' in window) {
    intersectionObserver = new IntersectionObserver(handleIntersection);
    intersectionObserver.observe(hero);
  }
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(handleResize);
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
  if (new URLSearchParams(window.location.search).get('lumen-test') === '1') {
    window.LumenHeroTest = {
      getProjections: heldProjections,
      getLifecycleIdentity: function () { return { generation: generation, replayCount: replayCount }; },
    };
  }

  if (signals.reduceMotion || signals.automated) showPoster('motion-policy');
  else if (policy.chooseMode(signals) === 'video') startVideo(++generation);
  else startWebgl();
  }
})();
