import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
const heroSection = css.match(/\[data-page="ai-home"\] \.hero-section \{([\s\S]*?)\n\s*\}/)?.[1] || '';
const lumenHero = css.match(/\[data-page="ai-home"\] #lumen-hero \{([\s\S]*?)\n\s*\}/)?.[1] || '';

assert.match(heroSection, /display:\s*flex;/, 'AI hero section is a flex container');
assert.match(heroSection, /background(?:-color)?:\s*var\(--bg\);/, 'AI hero section follows the active site theme');
assert.match(lumenHero, /background(?:-color)?:\s*#020409;/i, 'Lumen fallback remains dark in every site theme');

console.log('ok - AI hero background follows the active site theme');
