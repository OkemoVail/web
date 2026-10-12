import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [source, bundle] = await Promise.all([
  fs.readFile('liquid-design/source/liquid-design-live-demo.js', 'utf8'),
  fs.readFile('liquid-design/liquid-design.js', 'utf8'),
]);
const adapter = await fs.readFile('src/liquid-design-site.js', 'utf8');

for (const runtime of [source, bundle]) {
  // Plain surfaces skip nested buttons/links entirely; static-action toolbars
  // hand them to the glass without capture, so the click still fires and the
  // pill can stretch once the pointer pulls past its edge.
  assert.ok(runtime.includes("var nestedAction = options.editableSurface && event.target.closest('button, a');")
    && runtime.includes('if (nestedAction && !options.staticActionSurface) return;'),
    'glass surfaces preserve nested action clicks');
  assert.match(runtime, /if \(nestedAction \|\| \(options\.editableSurface && event\.target\.closest\('input, textarea, select, \[contenteditable\]'\)\)\) \{[\s\S]*?editingPointer = /,
    'static-action toolbar presses defer capture like an editable field');
}
// As a plain button the toolbar wrapper takes pointer capture, retargeting
// the click away from its nested Search/Collapse buttons.
assert.match(adapter, /getAttribute\('data-liquid-design'\) === 'surface' \? 'surface'/,
  'site adapter preserves author-declared surfaces so nested buttons keep their clicks');
// A glass button swallows clicks after a >2px wobble, so New chat stays a plain row.
assert.doesNotMatch(adapter, /\.sb-new-chat-btn/,
  'site adapter leaves the New chat row as a plain button');

console.log('PASS glass collapse click contract');
