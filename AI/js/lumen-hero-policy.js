(function () {
  'use strict';

  var DURATION = 8000;

  function chooseMode(s) {
    if (s.reduceMotion || s.automated) return 'poster';
    if (s.saveData || !s.webgl) return 'video';
    if (s.deviceMemory != null && s.deviceMemory < 4) return 'video';
    if (s.hardwareConcurrency != null && s.hardwareConcurrency < 6) return 'video';
    if (s.warmupFps != null && s.warmupFps < 40) return 'video';
    return 'webgl';
  }

  function chooseQuality(s) {
    var mobile = (s.width != null && s.width <= 768) || (s.deviceMemory != null && s.deviceMemory < 8);
    return {
      textureTier: mobile ? 'mobile' : 'desktop',
      pixelRatio: Math.min(s.dpr || 1, mobile ? 1 : 1.5),
      antialias: !mobile && (s.warmupFps == null || s.warmupFps >= 50),
    };
  }

  function timelineAt(ms) {
    var time = Math.max(0, ms);
    if (time >= DURATION) return { phase: 'held', progress: 1, label: '', copyVisible: true };
    if (time >= 6500) return { phase: 'reveal', progress: (time - 6500) / 1500, label: '', copyVisible: true };
    if (time >= 5000) return { phase: 'luna', progress: (time - 5000) / 1500, label: 'LUNA', copyVisible: false };
    if (time >= 2000) return { phase: 'terra', progress: (time - 2000) / 3000, label: 'TERRA', copyVisible: false };
    return { phase: 'solar', progress: time / 2000, label: 'SOLAR', copyVisible: false };
  }

  window.LumenHeroPolicy = { DURATION: DURATION, chooseMode: chooseMode, chooseQuality: chooseQuality, timelineAt: timelineAt };
})();
