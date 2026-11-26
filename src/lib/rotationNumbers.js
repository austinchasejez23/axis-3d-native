import * as THREE from 'three';

// Rotation numbers count the way the turn went, the same as Blender: turning
// 270° reads 270, not −90, and turning the other way by 90° reads −90. The
// same turn can be written with many sets of X, Y, Z angles; the set closest
// to the numbers shown before is used, so the numbers follow the turn
// smoothly. Nothing goes past ±360: a 400° turn reads 40.

const FULL = Math.PI * 2;
const D = Math.PI / 180;

const limit = (value, full) => {
  let v = value;
  while (v > full + 1e-9) v -= full;
  while (v < -full - 1e-9) v += full;
  return v;
};

/** Keeps one angle in degrees within ±360. */
export const limitDegrees = (degrees) => {
  const v = limit(degrees, 360);
  return Math.abs(v) < 1e-9 ? 0 : v;
};

/**
 * The X, Y, Z angles (radians) for `quaternion` that are closest to
 * `previous` (radians), each kept within ±360°.
 * @param {THREE.Quaternion} quaternion
 * @param {number[]} previous
 * @param {THREE.EulerOrder} [order]
 */
export function countedAngles(quaternion, previous, order = 'XYZ') {
  const e = new THREE.Euler().setFromQuaternion(quaternion, order);
  // The same turn as a second set of angles (true for all six X/Y/Z orders).
  const sets = [[e.x, e.y, e.z], [e.x + Math.PI, Math.PI - e.y, e.z + Math.PI]];
  let best = sets[0], bestGap = Infinity;
  for (const set of sets) {
    const near = set.map((a, i) => a + FULL * Math.round((previous[i] - a) / FULL));
    const gap = near.reduce((sum, a, i) => sum + Math.abs(a - previous[i]), 0);
    if (gap < bestGap - 1e-12) { bestGap = gap; best = near; }
  }
  return best.map((a) => limit(a, FULL));
}

/**
 * The same as countedAngles, in degrees.
 * @param {THREE.Quaternion} quaternion
 * @param {number[]} previous
 * @param {THREE.EulerOrder} [order]
 */
export const countedDegrees = (quaternion, previous, order = 'XYZ') =>
  countedAngles(quaternion, previous.map((d) => d * D), order).map((a) => limitDegrees(a / D));

/**
 * A turn as a quaternion from X, Y, Z degrees.
 * @param {number[]} degrees
 * @param {THREE.EulerOrder} [order]
 */
export const turnFromDegrees = (degrees, order = 'XYZ') =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(degrees[0] * D, degrees[1] * D, degrees[2] * D, order));

/** True when the X, Y, Z degrees describe exactly this turn. */
export const degreesMatch = (degrees, quaternion, order = 'XYZ') =>
  Math.abs(turnFromDegrees(degrees, order).dot(quaternion)) > 1 - 1e-9;

// A count that starts at 0: how far something has been turned since.
// { q: the turn so far, rotation: its X, Y, Z numbers in degrees }

/** A count at 0. */
export const newTurnCount = () => ({ q: new THREE.Quaternion(), rotation: [0, 0, 0] });

/**
 * Adds a world turn `q` to a count.
 * @param {{q: THREE.Quaternion, rotation: number[]}} count
 * @param {THREE.Quaternion} q
 */
export function addTurn(count, q) {
  count.q.premultiply(q).normalize();
  count.rotation = countedDegrees(count.q, count.rotation);
}

/**
 * Sets a count to typed X, Y, Z degrees, kept exactly as typed (within ±360).
 * @param {{q: THREE.Quaternion, rotation: number[]}} count
 * @param {number[]} degrees
 */
export function setTurn(count, degrees) {
  count.rotation = degrees.map(limitDegrees);
  count.q.copy(turnFromDegrees(count.rotation));
}

/**
 * The world turn that takes a count from where it is to typed degrees.
 * @param {{q: THREE.Quaternion}} count
 * @param {number[]} degrees
 */
export function turnToDegrees(count, degrees) {
  const turn = turnFromDegrees(degrees.map(limitDegrees)).multiply(count.q.clone().invert()).normalize();
  if (turn.w < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
  return turn;
}
