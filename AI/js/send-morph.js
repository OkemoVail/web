/* ═══════════════════════════════════════════════════════════════════════
   AI/js/send-morph.js — iMessage-style seamless send (spec 2026-08-14 §5).
   After render() inserts the just-sent user bubble, a ghost clone of it
   travels from the input capsule to the bubble's final position — one
   continuous motion, no cut between the field and the list.
   Loaded after ../src/motion.js, before js/chat-actions.js.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Morph the most recently rendered user bubble from fromRect.
     Returns true if the morph played; false = caller should do its
     normal (plain) scroll/settle. */
  window.motionMorphLastUserBubble = function (fromRect) {
    if (!fromRect || typeof window.motionGhost !== 'function') return false;
    var bubbles = document.querySelectorAll('#chat-messages .user-msg-bubble');
    var target = bubbles[bubbles.length - 1];
    if (!target) return false;

    // Settle the scroll instantly so the target rect is its FINAL position
    // (a smooth scroll would move the target mid-flight).
    if (window.els && window.els.chatCont) window.els.chatCont.scrollTop = window.els.chatCont.scrollHeight;

    target.style.visibility = 'hidden';
    // Rows have no entrance animation (render() rebuilds would replay it),
    // so the ghost is the only motion — revealing needs no animation reset.
    var started = window.motionGhost(target, fromRect, function () {
      target.style.visibility = '';
    });
    if (!started) target.style.visibility = '';
    return started;
  };
})();
