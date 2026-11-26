import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Rotation numbers count the way the turn went (like Blender), within ±360:
// small twist steps up to 270° read 270, turning the other way reads −90,
// 400° reads 40, and typed numbers stay as typed.
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent' });
try {
  const THREE = await server.ssrLoadModule('three');
  const { addTurn, newTurnCount, setTurn, turnToDegrees, limitDegrees, countedDegrees } = await server.ssrLoadModule('/src/lib/rotationNumbers.js');
  const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  const step = (axis, degrees) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), degrees * Math.PI / 180);

  const count = newTurnCount();
  for (let i = 0; i < 27; i++) addTurn(count, step([0, 0, 1], 10));
  assert.ok(close(count.rotation, [0, 0, 270]), `270° of twisting reads 270, got ${count.rotation}`);
  for (let i = 0; i < 13; i++) addTurn(count, step([0, 0, 1], 10));
  assert.ok(close(count.rotation, [0, 0, 40]), `400° reads 40, got ${count.rotation}`);
  console.log('PASS: twisting counts on past 180 and never past 360');

  const back = newTurnCount();
  for (let i = 0; i < 9; i++) addTurn(back, step([0, 0, 1], -10));
  assert.ok(close(back.rotation, [0, 0, -90]), `turning the other way reads -90, got ${back.rotation}`);
  const tilt = newTurnCount();
  for (let i = 0; i < 12; i++) addTurn(tilt, step([0, 1, 0], 10));
  assert.ok(close(tilt.rotation, [0, 120, 0]), `120° around Y reads 0, 120, 0, got ${tilt.rotation}`);
  console.log('PASS: the other way reads negative, and Y past 90 stays on Y');

  const typed = newTurnCount();
  setTurn(typed, [0, 0, 270]);
  assert.deepEqual(typed.rotation, [0, 0, 270]);
  setTurn(typed, [0, 0, 450]);
  assert.deepEqual(typed.rotation, [0, 0, 90]);
  assert.equal(limitDegrees(-400), -40);
  assert.equal(limitDegrees(360), 360);
  const toward = turnToDegrees(newTurnCount(), [0, 0, 90]);
  assert.ok(Math.abs(new THREE.Euler().setFromQuaternion(toward).z - Math.PI / 2) < 1e-9, 'the turn to a typed angle');
  console.log('PASS: typed numbers stay as typed, within ±360');

  // The numbers for an existing turn follow the ones shown before.
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 270 * Math.PI / 180));
  assert.ok(close(countedDegrees(q, [0, 0, 260]), [0, 0, 270]));
  assert.ok(close(countedDegrees(q, [0, 0, -80]), [0, 0, -90]));
  console.log('PASS: the same turn reads closest to the numbers shown before');
} finally { await server.close(); }
