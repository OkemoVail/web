(function () {
  'use strict';
  // One analytic, critically damped response for page and layout geometry.
  // Real elapsed time makes the same motion at 30, 60 and 120 Hz; position and
  // velocity are retained when a new target interrupts the current response.
  var frequency = 22;
  function step(state, dt) {
    var offset = state.x - state.target;
    var coefficient = state.v + frequency * offset;
    var decay = Math.exp(-frequency * dt);
    state.x = state.target + (offset + coefficient * dt) * decay;
    state.v = (state.v - frequency * coefficient * dt) * decay;
    if (Math.abs(state.target - state.x) < .03 && Math.abs(state.v) < .1) { state.x = state.target; state.v = 0; }
  }
  window.GlassShellMotion = { step: step, elapsed: function (now, previous) { return previous ? Math.max(0, (now - previous) / 1000) : 0; } };
})();
