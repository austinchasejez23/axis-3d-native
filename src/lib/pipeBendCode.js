import * as THREE from 'three';

/**
 * Swept elbow / radius bend.
 *
 * This is NOT a bevel. Nothing is offset or mitered. Instead:
 *
 *   1. the selected loop is read as the tube's CROSS-SECTION,
 *   2. that section is slid along leg A onto the plane perpendicular to leg A
 *      at the tangent point (setback = R * tan(turn / 2)),
 *   3. the section is then RIGIDLY ROTATED about ONE common bend axis through
 *      the full turn angle.
 *
 * Because every ring is the same section rotated as a rigid body, the profile
 * is preserved exactly (no pinching, no fanning), the arcs are concentric, and
 * the first/last rings are tangent to the two straight legs — a real elbow.
 *
 * perEdge: [{ dA, dB }] directions leaving the loop on each side.
 * corners: [{ vv }] original loop vertices, in loop order.
 * radius:  TRUE centerline bend radius.
 */
export function createPipeBendSweep({ perEdge, corners, radius, legA, legB }) {
  if (!perEdge?.length || !corners?.length) return null;

  // --- 1. Common leg axes ------------------------------------------------
  // Prefer the TRUE leg axes measured from the longitudinal wall edges: the
  // in-plane face directions below tilt with the miter and would give a wrong
  // bend plane/angle (a sheared elbow). Fall back to averaging only when the
  // measured axes are unavailable.
  const dA = legA ? legA.clone() : new THREE.Vector3();
  const dB = legB ? legB.clone() : new THREE.Vector3();
  if (!legA || !legB) {
    dA.set(0, 0, 0); dB.set(0, 0, 0);
    for (const e of perEdge) { dA.add(e.dA); dB.add(e.dB); }
  }
  if (dA.lengthSq() < 1e-12 || dB.lengthSq() < 1e-12) return null;
  dA.normalize();
  dB.normalize();

  // Only valid when the loop really separates two straight legs. On a mitered
  // tube the in-plane leg direction of each wall facet tilts with the miter —
  // by up to half the bend angle — so per-facet directions can disagree with
  // the average by 20–45° on a perfectly good pipe. A strict gate here
  // silently disabled the radial sweep and fell back to per-vertex fillets
  // (evenly spaced rings). 45° tolerance keeps real pipes on the sweep path
  // while still rejecting irregular creases.
  for (const e of perEdge) {
    if (e.dA.dot(dA) < 0.7 || e.dB.dot(dB) < 0.7) return null;
  }

  // --- 2. Turn angle and bend plane -------------------------------------
  const theta = Math.acos(THREE.MathUtils.clamp(dA.dot(dB), -1, 1));
  const omega = Math.PI - theta; // how far the section rotates
  if (!Number.isFinite(omega) || omega < 1e-4 || omega > Math.PI - 1e-4) return null;

  const W = new THREE.Vector3().crossVectors(dA, dB);
  if (W.lengthSq() < 1e-12) return null;
  W.normalize();

  const R = Math.max(1e-6, Number(radius) || 0.1);

  // --- 3. Bend direction ------------------------------------------------
  // Travelling through the bend, the tangent at the start is -dA and must
  // become +dB after rotating through omega. Pick the sign that does that.
  const testSign = (sign) => {
    const end = dA.clone().negate().applyAxisAngle(W, sign * omega);
    return { sign, error: 1 - end.dot(dB) };
  };
  const pos = testSign(1);
  const neg = testSign(-1);
  const sign = pos.error <= neg.error ? 1 : -1;

  // Unit direction from the section center toward the bend axis (the INNER
  // side of the bend).
  const u = new THREE.Vector3().crossVectors(dA, W).multiplyScalar(sign);

  // Loop centroid = section center at the sharp corner.
  const C = new THREE.Vector3();
  for (const c of corners) C.add(c.vv);
  C.divideScalar(corners.length);

  // --- 4. Effective centerline radius -----------------------------------
  // How far the section extends toward the inner side of the bend. The bend
  // axis must stay OUTSIDE the tube wall — a centerline radius smaller than
  // this puts the axis inside the tube, so the inner wall sweeps around the
  // wrong side and flattens. Clamping to just past the inner wall makes small
  // radii produce the tightest valid elbow: the inner wall pinches hard into
  // the corner while the outer wall fans wide.
  let innerHalf = 0;
  for (const c of corners) innerHalf = Math.max(innerHalf, c.vv.clone().sub(C).dot(u));
  const Rc = Math.max(R, innerHalf * 1.05);

  // --- 5. Tangent setback along each leg --------------------------------
  const T = Rc * Math.tan(omega * 0.5);

  // Section center on the leg-A tangent plane.
  const startCenter = C.clone().addScaledVector(dA, T);

  // Slide each loop vertex ALONG leg A onto that plane. This turns a mitered
  // loop into the tube's true perpendicular cross-section.
  const section = corners.map(({ vv }) => {
    const s = T - vv.clone().sub(C).dot(dA);
    return vv.clone().addScaledVector(dA, s);
  });

  // Bend axis: perpendicular to leg A, in the bend plane, Rc away from the
  // section center on the inner side of the turn.
  const axisPoint = startCenter.clone().addScaledVector(u, Rc);

  // --- 6. Rigid rotation of the whole section ---------------------------
  return (vertexIndex, t) => {
    const p = section[vertexIndex];
    if (!p) return null;
    return p.clone().sub(axisPoint).applyAxisAngle(W, sign * omega * t).add(axisPoint);
  };
}