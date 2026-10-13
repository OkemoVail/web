// ─── Sidebar Toggle ────────────────────────────────────────────

(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    // The collapsed rail rotates the profile pill to vertical; Settings sits
    // above it, so publish the pill's real length for that offset.
    function measureProfile() {
        const slot = document.querySelector('#sidebar .sb-profile-slot');
        if (slot) document.getElementById('sidebar').style.setProperty('--sb-profile-len', slot.offsetWidth + 'px');
    }
    function syncCollapseButton(collapsed) {
        const button = document.querySelector('#sidebar [data-sidebar-collapse]');
        if (!button) return;
        const label = collapsed ? 'Open sidebar' : 'Collapse sidebar';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.setAttribute('aria-expanded', String(!collapsed));
    }
    function applyState(sidebar, collapsed) {
        const mobile = innerWidth < 768;
        if (mobile) sidebar.classList.toggle('-translate-x-full', collapsed);
        else document.body.classList.toggle('sidebar-collapsed', collapsed);
        const library = document.getElementById('sidebar-full-content');
        if (collapsed && mobile && library.contains(document.activeElement)) {
            document.getElementById('menu-toggle-btn').focus({ preventScroll: true });
        }
        // The desktop collapsed rail remains visible and must stay interactive
        // so its toolbar can reopen the sidebar. Mobile still uses inert content
        // while the drawer is off-canvas.
        library.inert = mobile && collapsed;
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.style.display = mobile && !collapsed ? 'block' : 'none';
            overlay.classList.toggle('sidebar-overlay-visible', mobile && !collapsed);
        }
        syncCollapseButton(collapsed);
        window.updateUI?.();
    }
    // Expanded <-> rail is a CSS transition of the same controls (site.css
    // "Rail morph"); glass materials re-measure as their hosts resize, and
    // once more when the move settles.
    let settleTimer = 0;
    let repaintFrame = 0;
    function repaintGlassDuringTransition(sidebar) {
        cancelAnimationFrame(repaintFrame);
        if (reducedMotion.matches || navigator.webdriver) {
            window.LiquidDesign?.repaint?.(sidebar);
            return;
        }
        const started = performance.now();
        const paint = now => {
            window.LiquidDesign?.repaint?.(sidebar);
            if (now - started < 420) repaintFrame = requestAnimationFrame(paint);
            else repaintFrame = 0;
        };
        repaintFrame = requestAnimationFrame(paint);
    }
    function isCollapsed(sidebar) {
        return innerWidth < 768
            ? sidebar.classList.contains('-translate-x-full')
            : document.body.classList.contains('sidebar-collapsed');
    }
    window.isSidebarCollapsed = () => {
        const sidebar = window.els?.sidebar || document.getElementById('sidebar');
        return sidebar ? isCollapsed(sidebar) : false;
    };
    window.setSidebarCollapsed = collapsed => {
        const sidebar = window.els.sidebar;
        if (!sidebar) return;
        const current = isCollapsed(sidebar);
        if (current === collapsed) return;
        // Search is part of the expanded library, so collapsing always resets
        // it. Skip its own exit motion because the entire library is leaving.
        if (collapsed) window.closeChatSearch?.({ animate: false });
        measureProfile();
        applyState(sidebar, collapsed);
        repaintGlassDuringTransition(sidebar);
        clearTimeout(settleTimer);
        const refresh = () => {
            window.LiquidDesign?.refresh(sidebar);
            sidebar.dispatchEvent(new CustomEvent('liquid-color-change', { bubbles: true }));
        };
        if (reducedMotion.matches || navigator.webdriver) refresh();
        else settleTimer = setTimeout(refresh, 420);
    };
    window.toggleSidebar = () => {
        const sidebar = window.els.sidebar;
        if (!sidebar) return;
        window.setSidebarCollapsed(!isCollapsed(sidebar));
    };
    addEventListener('DOMContentLoaded', () => {
        measureProfile();
        syncCollapseButton(document.body.classList.contains('sidebar-collapsed'));
    });
})();
