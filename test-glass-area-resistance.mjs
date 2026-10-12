import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const file of ['liquid-design/source/liquid-design-physics.js', '.worktrees/liquid-glass/src/liquid-design-physics.js']) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  const physics = context.window.LiquidDesignPhysics;
  const config = { ...physics.DEFAULTS, fluidStretchGain: 2.1, fluidStretchRatio: .3 };
  const extension = (width, height) => physics.deriveIpadFluidState({ active: true, pointerDx: 100, pointerDy: 0 }, { slabHalfWidth: width / 2, slabHalfHeight: height / 2 }, config).rightExtension;
  assert.ok(extension(160, 52) > extension(160, 200), 'increasing area reduces extension with identical width and pointer pressure');
  assert.ok(extension(160, 200) > extension(160, 480), 'resistance increases progressively');
  assert.ok(extension(160, 480) > 0, 'large surfaces remain stretchable');
  const maxExtension = (height) => physics.deriveIpadFluidState({ active: true, pointerDx: 1000000, pointerDy: 0 }, { slabHalfWidth: 80, slabHalfHeight: height / 2 }, config).rightExtension;
  assert.ok(maxExtension(52) > maxExtension(200), 'large glass has a smaller deformation cap even on extreme pulls');
  assert.ok(maxExtension(200) > maxExtension(480), 'maximum deformation decreases progressively with area');
  console.log(`PASS area resistance: ${file}`);
}
