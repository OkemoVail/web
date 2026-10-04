// Import the approved portable engine without editing its reference worktree.
// Once imported, builds are self-contained: node liquid-design/build.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const files = ['liquid-design-physics.js', 'liquid-design-union.js', 'liquid-design-live-demo.js', 'liquid-design-menu-motion.js', 'liquid-design-colors.js', 'liquid-design-components.js', 'liquid-design-plugin-components.js', 'liquid-design-plugin.js', 'liquid-design-navigation.js'];
const source = path.join(directory, 'source');
if (process.argv.includes('--import-approved')) {
  const approved = path.resolve(directory, '../.worktrees/liquid-glass');
  await fs.mkdir(source, { recursive: true });
  for (const file of files) await fs.copyFile(path.join(approved, 'src', file), path.join(source, file));
  await fs.copyFile(path.join(approved, 'liquid-design/liquid-design.css'), path.join(directory, 'liquid-design.css'));
}
const sources = await Promise.all(files.map(file => fs.readFile(path.join(source, file), 'utf8')));
const header = `/* Liquid Design — approved portable engine; build: node liquid-design/build.mjs */
(function(host){'use strict';if(host.LiquidDesign)return;
var window=Object.create(host),module=undefined;
['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','matchMedia'].forEach(function(k){window[k]=host[k].bind(host)});
`;
await fs.writeFile(path.join(directory, 'liquid-design.js'), header + sources.join('\n') + '\nhost.LiquidDesign=window.LiquidDesign;\n})(window);\n');
console.log('Built self-contained liquid-design/liquid-design.js (no playground script).');
if (process.argv.includes('--export-portable')) {
  const portable = path.resolve(directory, '../.worktrees/liquid-glass');
  for (const file of files) await fs.copyFile(path.join(source, file), path.join(portable, 'src', file));
  await fs.copyFile(path.join(directory, 'liquid-design.css'), path.join(portable, 'src/liquid-design-plugin.css'));
  await fs.copyFile(path.join(directory, 'liquid-design.js'), path.join(portable, 'liquid-design/liquid-design.js'));
  await fs.copyFile(path.join(directory, 'liquid-design.css'), path.join(portable, 'liquid-design/liquid-design.css'));
  await fs.copyFile(path.join(portable, 'liquid-design/example.html'), path.join(directory, 'example.html'));
  await fs.copyFile(path.join(portable, 'liquid-design/playground.js'), path.join(directory, 'playground.js'));
  console.log('Exported approved sources and standalone assets to the original plugin worktree.');
}
