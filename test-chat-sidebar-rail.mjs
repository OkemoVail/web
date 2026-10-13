import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css = await fs.readFile('src/site.css', 'utf8');
const sidebarJs = await fs.readFile('AI/js/sidebar.js', 'utf8');
const glassPlugin = await fs.readFile('liquid-design/source/liquid-design-plugin.js', 'utf8');
const html = await fs.readFile('AI/chat.html', 'utf8');

// Expanded and rail share one set of placed controls (user wireframe 2026-10-12).
assert.match(html, /class="sb-tools-dock"[\s\S]*?class="chat-sidebar-actions"/, 'toolbar pill sits in its positioning dock');
assert.match(html, /class="sb-profile-slot"[\s\S]*?class="sb-profile-btn/, 'profile pill sits in its rotating slot');
assert.match(css, /sidebar-collapsed #sidebar .sb-tools-dock {[^}]*rotate: -90deg;/,
  'collapsed toolbar pill rotates vertical, Collapse on top');
assert.match(css, /sidebar-collapsed #sidebar \.sb-profile-slot \{ left: 5px; bottom: 5px; rotate: -90deg; \}/,
  'collapsed profile pill turns vertical, name reading upward');
assert.match(css, /sidebar-collapsed #sidebar #profile-row-actions \{\s*(?:\/\*[^*]*\*\/\s*)?right: 5px; bottom: calc\(13px \+ var\(--sb-profile-len/,
  'collapsed Settings sits above the profile pill');
assert.match(css, /transition: left var\(--dur-3\)[\s\S]*?rotate var\(--dur-3\)/, 'controls move instead of swapping');
assert.match(sidebarJs, /library\.inert\s*=\s*mobile\s*&&\s*collapsed;/, 'desktop collapsed rail remains interactive');
assert.match(sidebarJs, /LiquidDesign\?\.repaint\?\.\(sidebar\)/,
  'glass lighting is repainted throughout the rail rotation');
assert.match(glassPlugin, /lightRotation = frameAngle \? 'rotate\(' \+ -frameAngle[\s\S]*?group\.lightGradient\.setAttribute\('gradientTransform', lightRotation\)/,
  'glass highlight counter-rotates to remain page-fixed');
assert.match(glassPlugin, /angle \* energy \* \.2 - frameAngle/,
  'prismatic highlight remains page-fixed too');

assert.match(css, /sidebar-collapsed #sidebar { border-radius: 30px; }/, 'collapsed rail is a full capsule');

console.log('PASS sidebar rail contract');
