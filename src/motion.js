/* ═══════════════════════════════════════════════════════════════════════
   src/motion.js — site-wide motion runtime (no dependencies).
   1. Scroll reveals: elements with [data-reveal] fade+rise when scrolled
      into view (optional data-reveal-delay="<ms>"). Styles are gated behind
      html.motion-ready, so content is NEVER hidden when JS is absent.
   2. window.motionGhost(targetEl, fromRect, onDone) — FLIP-style travel:
      a clone of targetEl flies from fromRect to the element's real rect
      (the "iMessage send" morph), following a gently curved arc rather
      than a straight line. Caller hides the real element and
      reveals it in onDone.
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

    /* Curved flight path: bow the midpoint perpendicular to the straight
       from→to line (upward-bowing arc) so the ghost follows a curve. */
    var fromCX = fromRect.left + fromRect.width / 2, fromCY = fromRect.top + fromRect.height / 2;
    var toCX = toRect.left + toRect.width / 2, toCY = toRect.top + toRect.height / 2;
    var dx = toCX - fromCX, dy = toCY - fromCY, dist = Math.hypot(dx, dy) || 1;
    var perpX = -dy / dist, perpY = dx / dist;                       // unit perpendicular
    if (perpY > 0 || (perpY === 0 && perpX < 0)) { perpX = -perpX; perpY = -perpY; } // bow upward
    var bow = Math.min(dist * 0.12, 56);
    var arcCX = (fromCX + toCX) / 2 + perpX * bow, arcCY = (fromCY + toCY) / 2 + perpY * bow;
    var midW = (fromRect.width + toRect.width) / 2, midH = (fromRect.height + toRect.height) / 2;
    var midRadius = /^\d+(\.\d+)?px$/.test(radius) ? ((22 + parseFloat(radius)) / 2) + 'px' : '22px';

    var anim = ghost.animate([
      { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px', borderRadius: '22px' },
      { left: (arcCX - midW / 2) + 'px', top: (arcCY - midH / 2) + 'px', width: midW + 'px', height: midH + 'px', borderRadius: midRadius },
      { left: toRect.left + 'px', top: toRect.top + 'px', width: toRect.width + 'px', height: toRect.height + 'px', borderRadius: radius }
    ], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }); /* var(--ease-smooth) — no overshoot */

    function finish() { ghost.remove(); done(); }
    anim.onfinish = finish;
    anim.oncancel = finish;
    return true;
  };
})();
