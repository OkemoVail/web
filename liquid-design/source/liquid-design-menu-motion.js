(function (root) {
  'use strict';
  function smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function frame(pill, menu, time, direction, closing) {
    var t = Math.max(0, Math.min(1, time));
    var join = .24;
    var restingDiameter = Math.min(pill.w, pill.h);
    var diameter = Math.min(restingDiameter * 1.35, pill.w, menu.w, menu.h);
    var pillRadius = Number.isFinite(pill.r) ? pill.r : restingDiameter / 2;
    var menuRadius = Number.isFinite(menu.r) ? menu.r : Math.min(30, menu.w / 2, menu.h / 2);
    var shrink = smooth(t / join);
    // One damped arrival: restoring acceleration remains active at the peak,
    // unlike two independent ease curves that stop at their shared waypoint.
    var u = Math.max(0, (t - join) / (1 - join));
    var springTime = (u - .025 * (1 - Math.exp(-u / .025))) / .975;
    var damping = .72, frequency = 7.6;
    var damped = frequency * Math.sqrt(1 - damping * damping);
    function response(s) {
      return 1 - Math.exp(-damping * frequency * s) *
        (Math.cos(damped * s) + damping * frequency / damped * Math.sin(damped * s));
    }
    var grow = t < join ? 0 : response(springTime);
    // Remove the tiny residual only at the end without a terminal snap.
    grow += (1 - response(1)) * smooth((u - .78) / .22);
    var travel = smooth(t / .68);
    var cx = pill.x + pill.w / 2 + (menu.x + menu.w / 2 - pill.x - pill.w / 2) * travel;
    var cy = pill.y + pill.h / 2 + (menu.y + menu.h / 2 - pill.y - pill.h / 2) * travel;
    // Continuous center travel carries the silhouette through its minimum,
    // even when width reverses direction. All boundary derivatives are smooth.
    cy += direction * 8 * Math.pow(Math.sin(Math.PI * t), 2);
    cy += direction * menu.h * .16 * (grow - Math.min(1, grow));
    // The sheet pops slightly forward in scale and returns to its resting
    // bounds; the pill has no separate upward closing impulse.
    var w = pill.w + (diameter - pill.w) * shrink + (menu.w - diameter) * grow;
    var h = pill.h + (diameter - pill.h) * shrink + (menu.h - diameter) * grow;
    var rounding = smooth((t - .46) / .34);
    var circularRadius = Math.min(w, h) / 2;
    var r = circularRadius + (menuRadius - circularRadius) * rounding;
    if (t === 0) r = pillRadius;
    r = Math.min(r, w / 2, h / 2);
    // The controller reverses path time; both directions use the same frame.
    var tail = 0;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h, r: r, tail: tail,
      reveal: smooth(t / .64), face: 1 - smooth(t / .24) };
  }
  function closingSpring(pill, menu, elapsed, duration, direction, from) {
    from = Number.isFinite(from) ? from : 1;
    var handoff = duration * .4;
    var anchor = pill.y + pill.h / 2;
    function center(ms) {
      var progress = Math.max(0, Math.min(1, ms / duration));
      var shape = frame(pill, menu, from * Math.pow(1 - progress, 2), direction, true);
      return shape.y + shape.h / 2;
    }
    function velocity(ms) { return (center(ms + .05) - center(ms - .05)) / .0001; }
    if (elapsed <= handoff) return { y: center(elapsed), velocity: velocity(elapsed), settled: false };
    // Continue from the closing path's position AND velocity, rather than
    // adding an unrelated pulse. Time is analytic, independent of frame rate.
    var displacement = center(handoff) - anchor;
    var incoming = velocity(handoff);
    var frequency = 26, damping = .5;
    var decay = frequency * damping;
    var oscillation = frequency * Math.sqrt(1 - damping * damping);
    var b = (incoming + decay * displacement) / oscillation;
    var seconds = (elapsed - handoff) / 1000;
    var cosine = Math.cos(oscillation * seconds), sine = Math.sin(oscillation * seconds);
    var envelope = Math.exp(-decay * seconds);
    var offset = envelope * (displacement * cosine + b * sine);
    var speed = envelope * ((b * oscillation - decay * displacement) * cosine -
      (displacement * oscillation + decay * b) * sine);
    // At the first rebound peak, change to a critically damped return.
    // Position, zero peak velocity, and restoring acceleration stay continuous;
    // the return approaches the anchor without a second, opposite-side lobe.
    var peakAngle = Math.atan2(incoming, displacement * oscillation + decay * b);
    if (peakAngle < 0) peakAngle += Math.PI;
    var peakTime = peakAngle / oscillation;
    if (seconds > peakTime) {
      var peakOffset = Math.exp(-decay * peakTime) *
        (displacement * Math.cos(peakAngle) + b * Math.sin(peakAngle));
      var returning = seconds - peakTime;
      var returnEnvelope = Math.exp(-frequency * returning);
      offset = peakOffset * (1 + frequency * returning) * returnEnvelope;
      speed = -peakOffset * frequency * frequency * returning * returnEnvelope;
    }
    return { y: anchor + offset, velocity: speed, settled: Math.abs(offset) < .05 && Math.abs(speed) < 1 };
  }
  var api = { frame: frame, closingSpring: closingSpring };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LiquidDesignMenuMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
