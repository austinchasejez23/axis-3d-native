import assert from 'node:assert/strict';
import fs from 'node:fs';

// Protect the layout and interaction wiring without requiring a browser-only
// theme hook to render under Node's server renderer.
const source = fs.readFileSync('src/components/modeler/TopBar.jsx', 'utf8');
const viewport = fs.readFileSync('src/components/modeler/ViewportModeButtons.jsx', 'utf8');
const boost = fs.readFileSync('src/components/modeler/RenderBoostButtons.jsx', 'utf8');

assert.match(source, /ChevronLeft, ChevronRight/, 'Fixed control must support both chevron directions');
assert.match(source, /sideControlsExpanded, setSideControlsExpanded/);
assert.match(source, /sideChevronFacesRight, setSideChevronFacesRight/);
assert.match(source, /onClick=\{toggleSideControls\}/);
assert.match(source, /setSideControlsExpanded\(nextExpanded\)/);
assert.match(source, /aria-expanded=\{sideControlsExpanded\}/);
assert.match(source, /aria-controls="axis-side-controls"/);
assert.match(source, /id="axis-side-controls"/);
assert.match(source, /onTransitionEnd=\{\(event\) => \{/);
assert.match(source, /event\.propertyName === 'transform'/);
assert.match(source, /setSideChevronFacesRight\(!sideControlsExpanded\)/,
  'Chevron direction changes after the slide transition completes');
assert.match(source, /translateX\(calc\(-100% - 12px\)\)/,
  'Collapsed panel must slide fully past the left screen edge');
assert.match(source, /sideControlsRef\.current\.inert = !sideControlsExpanded/,
  'Off-screen controls must be inert and unavailable to keyboard focus');
assert.match(source, /motion-reduce:transition-none/);
assert.match(source, /\+ 5\.6rem\)/, 'Fixed chevron must occupy the former top control position');
assert.match(source, /\+ 8\.6rem\)/, 'Seven controls move down enough to make space for the chevron');
assert.match(source, /<ViewportModeButtons clay=\{clayViewport\} transparent=\{transparentViewport\}/);
assert.match(source, /<RenderBoostButtons orientationOpen=\{orientationOpen\}/);
assert.match(source, /transition-transform duration-300 ease-in-out/, 'Entire group must animate as one');
for (const label of ['Toggle clay viewport', 'Toggle transparent viewport']) {
  assert.ok(viewport.includes('aria-label="' + label + '"'), 'Retain ' + label);
}
for (const label of [
  'Reset orientation', 'Toggle free transform',
  'Toggle snapping', 'Toggle resistance', 'Focus on selection',
]) {
  assert.ok(boost.includes('aria-label="' + label + '"'), 'Retain ' + label);
}
console.log('PASS: fixed chevron, seven original buttons, off-screen slide, return transition, and keyboard accessibility');
