import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [chatHtml, mainJs] = await Promise.all([
  fs.readFile('AI/chat.html', 'utf8'),
  fs.readFile('AI/js/main.js', 'utf8'),
]);

assert.match(chatHtml, /class="sb-new-chat-shortcut"[^>]*data-shortcut-mac="⌘I"[^>]*data-shortcut-windows="Ctrl\+I"/,
  'New Chat exposes platform-specific shortcut labels');
assert.match(chatHtml, /class="sb-new-chat-btn[^\"]*"[^>]*aria-keyshortcuts="Control\+I Meta\+I"/,
  'New Chat advertises both platform shortcuts');
assert.match(mainJs, /e\.key\.toLowerCase\(\) === 'i'/,
  'global shortcut listens for the I key');
assert.match(mainJs, /\(e\.ctrlKey && !e\.metaKey\) \|\| \(e\.metaKey && !e\.ctrlKey\)/,
  'global shortcut accepts Ctrl on Windows/Linux and Command on macOS');
assert.match(mainJs, /contentEditable|HTMLInputElement|HTMLTextAreaElement/,
  'global shortcut skips editable fields');
assert.match(mainJs, /window\.resetChat\(\)/,
  'global shortcut opens a new chat through the existing reset path');

console.log('PASS new chat shortcut contract');
