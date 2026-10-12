// TEMPORARY on-device tap logger for the iPad New chat bug (2026-10-12).
// Active only with ?tapdebug in the page or shell URL. Remove once fixed.
(function () {
    var q = location.search;
    try { q += window.top.location.search; } catch (e) {}
    if (q.indexOf('tapdebug') === -1) return;

    var box = document.createElement('pre');
    box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;width:min(460px,90vw);max-height:45vh;overflow:auto;margin:0;padding:8px;background:rgba(0,0,0,.85);color:#7f7;font:11px/1.35 ui-monospace,monospace;border-radius:8px;pointer-events:none;white-space:pre-wrap';
    var lines = [];
    function log(s) {
        lines.push(s); if (lines.length > 40) lines.shift();
        box.textContent = lines.join('\n');
        box.scrollTop = box.scrollHeight;
    }
    function desc(el) {
        if (!el || !el.tagName) return String(el);
        var c = el.className && (el.className.baseVal != null ? el.className.baseVal : el.className);
        return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + String(c).trim().split(/\s+/).slice(0, 2).join('.') : '');
    }
    function inBtn(el) { return !!(el && el.closest && el.closest('.sb-new-chat-btn')); }

    function attach() {
        document.body.appendChild(box);
        log('w=' + innerWidth + ' h=' + innerHeight + ' shell=' + (window.top !== window) + ' body=' + document.body.className.slice(0, 80));
        ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click'].forEach(function (type) {
            window.addEventListener(type, function (e) {
                var p = e.changedTouches ? e.changedTouches[0] : e;
                var hit = p && document.elementFromPoint(p.clientX, p.clientY);
                log(type + (e.pointerType ? '(' + e.pointerType + ')' : '') + ' t=' + desc(e.target) + ' hit=' + desc(hit) + ' btn=' + inBtn(e.target) + (e.defaultPrevented ? ' PREVENTED' : ''));
            }, true);
            // Bubble-phase twin: tells us if something stopped propagation on the way.
            window.addEventListener(type, function (e) {
                if (type === 'click') log('  click reached window bubble, prevented=' + e.defaultPrevented);
            }, false);
        });
        window.addEventListener('error', function (e) { log('ERROR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });
        var wrap = function () {
            var orig = window.resetChat;
            if (!orig || orig.__tapdebug) return;
            window.resetChat = function () {
                log('resetChat() called, history=' + (window.chatHistory || []).length);
                try { var r = orig.apply(this, arguments); log('resetChat() ok, history=' + window.chatHistory.length); return r; }
                catch (err) { log('resetChat() THREW ' + err.message); throw err; }
            };
            window.resetChat.__tapdebug = true;
        };
        wrap(); setInterval(wrap, 1000);
        var btn = document.querySelector('#sidebar .sb-new-chat-btn');
        if (btn) {
            var r = btn.getBoundingClientRect(), cs = getComputedStyle(btn);
            log('btn rect=' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' pe=' + cs.pointerEvents + ' ta=' + cs.touchAction + ' attrs=' + Array.prototype.map.call(btn.attributes, function (a) { return a.name; }).filter(function (n) { return /lgp|liquid/.test(n); }).join(','));
            log('center hit=' + desc(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)));
        } else log('NO .sb-new-chat-btn found');
    }
    if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
})();
