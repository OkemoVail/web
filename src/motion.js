/* ═══════════════════════════════════════════════════════════════════════
   src/motion.js — site-wide motion runtime (no dependencies).
   1. Scroll reveals: elements with [data-reveal] fade+rise when scrolled
      into view (optional data-reveal-delay="<ms>"). Styles are gated behind
      html.motion-ready, so content is NEVER hidden when JS is absent.
   2. window.motionGhost(targetEl, fromRect, onDone) — FLIP-style travel:
      a clone of targetEl flies from fromRect to the element's real rect
      (the "iMessage send" morph) on a "sideways whip" — a 45%-bowed
      quadratic-bezier arc timed easeOutCubic (snap off, long glide in).
      Caller hides the real element and reveals it in onDone.
   Everything bails (content shown instantly, morph skipped) under
   prefers-reduced-motion AND under automation (navigator.webdriver) so
   Playwright screenshots stay deterministic.
   LIMITATIONS: reduce/automated are read once at load (a mid-session OS
   toggle applies next reload — the CSS media query adapts live regardless);
   [data-reveal] is for STATIC markup only — elements added after
   DOMContentLoaded are never observed (and under reduced-motion would stay
   hidden), so never put it on dynamically-created content.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var automated = !!navigator.webdriver;

  document.documentElement.classList.add('motion-ready');

  function revealAll() {
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('revealed'); });
  }

  function initReveals() {
    if (reduce || automated) { revealAll(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.transitionDelay = (el.dataset.revealDelay || 0) + 'ms';
        el.classList.add('revealed');
        el.addEventListener('transitionend', function () { el.style.transitionDelay = ''; }, { once: true });
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReveals);
  else initReveals();

  /* motionGhost: fly a clone of targetEl from fromRect to targetEl's rect.
     Returns true if the animation started (onDone fires at the end),
     false if skipped (onDone still fires, so callers can reveal). */
  window.motionGhost = function (targetEl, fromRect, onDone) {
    var done = function () { if (onDone) onDone(); };
    if (reduce || automated || !targetEl || !fromRect || typeof targetEl.animate !== 'function') { done(); return false; }
    var toRect = targetEl.getBoundingClientRect();
    if (!toRect.width || !toRect.height) { done(); return false; }

    var ghost = targetEl.cloneNode(true);          // clone => exact target styling
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.add('motion-ghost');
    var radius = getComputedStyle(targetEl).borderRadius;
    Object.assign(ghost.style, {
      position: 'fixed', margin: '0', maxWidth: 'none', maxHeight: 'none',
      left: fromRect.left + 'px', top: fromRect.top + 'px',
      width: fromRect.width + 'px', height: fromRect.height + 'px',
      borderRadius: '22px', overflow: 'hidden',
      visibility: 'visible', animation: 'none', transition: 'none',
      boxSizing: 'border-box', pointerEvents: 'none', zIndex: '9999'
    });
    document.body.appendChild(ghost);

    /* Flight: "sideways whip" — a quadratic bezier that bows perpendicular
       to the from→to line (45% of the distance, capped at 140px, toward
       screen-right on vertical flights), timed with easeOutCubic so the
       ghost snaps off the line fast and glides in long (picked from the
       10-variant arc lab, motion-demo.html §7, 2026-08-15). Frames are
       pre-eased and linearly interpolated, so the flight is ONE smooth
       curve — no velocity bumps at keyframe joints. */
    var fromCX = fromRect.left + fromRect.width / 2, fromCY = fromRect.top + fromRect.height / 2;
    var toCX = toRect.left + toRect.width / 2, toCY = toRect.top + toRect.height / 2;
    var dx = toCX - fromCX, dy = toCY - fromCY, dist = Math.hypot(dx, dy) || 1;
    var perpX = -dy / dist, perpY = dx / dist;                       // unit perpendicular
    if (perpX < 0) { perpX = -perpX; perpY = -perpY; }               // bow toward screen-right
    var bow = Math.min(dist * 0.45, 140);
    var arcCX = (fromCX + toCX) / 2 + perpX * bow, arcCY = (fromCY + toCY) / 2 + perpY * bow;
    var rFrom = 22, rTo = /^\d+(\.\d+)?px$/.test(radius) ? parseFloat(radius) : 22;
    var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

    var STEPS = 8, frames = [];
    for (var i = 0; i <= STEPS; i++) {
      var o = i / STEPS;                                             // uniform time offset
      var t = easeOut(o);                                            // eased progress
      var u = 1 - t;
      var w = fromRect.width + (toRect.width - fromRect.width) * t;
      var h = fromRect.height + (toRect.height - fromRect.height) * t;
      var cx = u * u * fromCX + 2 * u * t * arcCX + t * t * toCX;    // quad bezier point
      var cy = u * u * fromCY + 2 * u * t * arcCY + t * t * toCY;
      frames.push({
        offset: o,
        left: (cx - w / 2) + 'px', top: (cy - h / 2) + 'px',
        width: w + 'px', height: h + 'px',
        borderRadius: i === STEPS ? radius : (rFrom + (rTo - rFrom) * t) + 'px'
      });
    }

    var anim = ghost.animate(frames, { duration: 480, easing: 'linear', fill: 'forwards' }); /* easing is baked into the sampled frames */

    function finish() { ghost.remove(); done(); }
    anim.onfinish = finish;
    anim.oncancel = finish;
    return true;
  };
})();
