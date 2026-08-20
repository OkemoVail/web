import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
const chat = readFileSync(new URL('./AI/chat.html', import.meta.url), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

function layer(name) {
  const match = css.match(new RegExp(`--z-${name}:\\s*(\\d+)`));
  assert.ok(match, `missing --z-${name}`);
  return Number(match[1]);
}

test('shared layer tokens form one increasing hierarchy', () => {
  const names = ['content', 'chrome', 'nav', 'popover', 'scrim', 'dialog', 'toast', 'preloader'];
  const values = names.map(layer);
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] > values[i - 1], `${names[i]} must be above ${names[i - 1]}`);
  }
});

test('universal nav and floating motion use shared layers', () => {
  assert.match(css, /\.ov-nav\s*\{[^}]*z-index:\s*var\(--z-nav\)/s);
  assert.match(css, /\.motion-ghost\s*\{[^}]*z-index:\s*var\(--z-toast\)/s);
});

test('Astra fullscreen escapes the results stacking context', () => {
  assert.match(css, /\[data-page="search"\] \.results\s*\{[^}]*z-index:\s*auto/s);
  assert.match(css, /\.ai-panel\.ai-fullscreen\s*\{[^}]*z-index:\s*var\(--z-dialog\)/s);
  assert.match(css, /#ig-preview\s*\{[^}]*z-index:\s*var\(--z-dialog\)/s);
});

test('Astra search bars keep suggestions above following hero controls', () => {
  assert.match(css, /\[data-page="search"\] \.bar:has\(\.suggest:not\(\[hidden\]\)\)\s*\{[^}]*z-index:\s*var\(--z-popover\)/s);
});

test('chat overlays use semantic shared layers', () => {
  assert.match(css, /#sidebar-overlay\s*\{[^}]*z-index:\s*var\(--z-chrome\)/s);
  assert.match(css, /#settings-panel\s*\{[^}]*z-index:\s*var\(--z-dialog\)/s);
  assert.match(css, /\.custom-modal-overlay\s*\{[^}]*z-index:\s*var\(--z-dialog\)/s);
  assert.match(css, /#account-modal[\s\S]*?\{[^}]*z-index:\s*var\(--z-dialog\)/);
});

test('secondary app layers cannot outrank the universal nav accidentally', () => {
  assert.match(css, /\[data-page="word"\] #ai-panel\s*\{[^}]*z-index:\s*var\(--z-chrome\)/s);
  assert.match(css, /\[data-page="manage"\] #status-msg\s*\{[^}]*z-index:\s*var\(--z-toast\)/s);
  assert.match(css, /\[data-page="research"\] #reader-modal\s*\{[^}]*z-index:\s*var\(--z-dialog\)/s);
});
