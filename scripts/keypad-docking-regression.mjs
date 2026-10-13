import assert from 'node:assert/strict';
import fs from 'node:fs';

// Both keypads portal to document.body. .safe-bottom there applies Android's
// safe-area AGAIN, below the WebView's already-safe modeler workspace.
for (const filename of ['ModelingNumberPad.jsx', 'HudNumberPad.jsx']) {
  const source = fs.readFileSync(`src/components/modeler/${filename}`, 'utf8');
  assert.match(source, /createPortal\(/, `${filename} should still portal above the canvas`);
  assert.match(source, /fixed bottom-0 left-0 right-0 z-\[90\] modeling-sheet/,
    `${filename} must dock directly to the bottom of the app viewport`);
  assert.doesNotMatch(source, /safe-bottom/,
    `${filename} must not add a second Android safe-area inset`);
  assert.match(source, /--modeling-keypad-height/,
    `${filename} must keep the panel height synchronized to its measured height`);
}
const panel = fs.readFileSync('src/components/modeler/ModelingPanel.jsx', 'utf8');
assert.match(panel, /keypadOpen \? 'var\(--modeling-keypad-height, 10\.5rem\)'/,
  'Modeling panels should remain immediately above the lowered keypads');
console.log('PASS: modeler and HUD keypads bottom-docked with no duplicate Android safe inset, synchronized panel positioning maintained');
