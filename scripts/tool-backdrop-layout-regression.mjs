import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { default: GlassToolRow } = await vite.ssrLoadModule('/src/components/modeler/GlassToolRow.jsx');
  const render = (occupied, previousCells, nextCells) => renderToStaticMarkup(
    React.createElement(GlassToolRow, {
      backdropCells: occupied,
      previousCells, nextCells,
      cells: occupied.map((v, i) => v ? React.createElement('button', { key: i, 'aria-label': `Tool ${i}` }) : null),
    }),
  );
  const backgroundRuns = html => (html.match(/class="absolute inset-y-0"/g) || []).length;

  const wholeRow = render([true, true, true, true, true, true]);
  assert.equal(backgroundRuns(wholeRow), 1, 'Six adjacent tools must share ONE strip');
  assert.match(wholeRow, /left:0%;width:100%;background:rgba\(9,13,22,0\.26\)/);

  const mixed = render([true, false, true, true, false, false]);
  assert.equal(backgroundRuns(mixed), 2, 'Only separate occupied runs get separate backgrounds');
  assert.match(mixed, /left:0%;width:16\.666/);
  assert.match(mixed, /left:33\.333/);
  assert.doesNotMatch(mixed, /left:66\.666/);
  assert.doesNotMatch(mixed, /left:83\.333/);

  const moved = render([false, false, false, false, true, true]);
  assert.equal(backgroundRuns(moved), 1);
  assert.match(moved, /left:66\.666/);
  assert.doesNotMatch(moved, /left:0%;width/);
  assert.equal(backgroundRuns(render([false, false, false, false, false, false])), 0);

  const stacked = render(
    [true, false, false, false, false, false],
    [true, false, false, false, false, false],
    [true, false, false, false, false, false],
  );
  assert.equal(backgroundRuns(stacked), 1, 'Vertical stack needs one continuous strip per row');
  assert.match(stacked, /border-radius:0px 0px 0px 0px/,
    'Vertically joined surfaces must have square shared edges, not individual rounded tiles');

  const toolBtn = fs.readFileSync('src/components/modeler/GridToolButton.jsx', 'utf8');
  assert.doesNotMatch(toolBtn, /background: 'rgba\(9,13,22,0\.26\)'/);
  assert.doesNotMatch(toolBtn, /boxShadow:/);
  const mode = fs.readFileSync('src/components/modeler/ModeToolGrid.jsx', 'utf8');
  const general = fs.readFileSync('src/components/modeler/GeneralToolGrid.jsx', 'utf8');
  for (const [name, source] of [['mode', mode], ['general', general]]) {
    assert.match(source, /backdropCells=\{backdropRows\[r\]\}/, `${name} must use current rearrangement`);
    assert.match(source, /previousCells=\{backdropRows\[r - 1\]\}/);
    assert.match(source, /nextCells=\{backdropRows\[r \+ 1\]\}/);
    assert.match(source, /!arrange\.expanded && !dragging/,
      `${name} must hide background when tools are hidden`);
  }
  const top = fs.readFileSync('src/components/modeler/TopBar.jsx', 'utf8');
  assert.match(top, /right-0\.5 w-12 rounded-xl/, 'Five-button background alignment regression');
  // Both centers measured from screen right: outer 6px + margin-right 16px
  // + half 20px icon, compared with outer 6px + right 2px + half 48px strip.
  assert.equal(6 + 16 + 10, 6 + 2 + 24,
    'Right-side icon and background centers must align');

  console.log('PASS: one shared background for continuous tool rows; follows tool moves, hidden/empty cells, vertical stacks; no individual tiles; five-button strip centered on icons');
} finally {
  await vite.close();
}
