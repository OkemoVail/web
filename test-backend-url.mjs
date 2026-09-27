import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('./AI/js/main.js', import.meta.url), 'utf8');

assert.doesNotMatch(main, /\/tunnel_url/, 'chat boot must not discover a replacement backend URL');
assert.doesNotMatch(
  main,
  /localStorage\.setItem\(['"]vail_custom_backend_url['"]/,
  'chat boot must not overwrite the user-configured backend URL',
);

console.log('Backend URL boot assertions passed.');
