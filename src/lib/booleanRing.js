// Connect a cutter's planar rim to the surrounding base-face boundary.
// Where the base boundary has fewer vertices than the cutter, add vertices
// ON EXISTING base edges and later thread them into neighboring faces.
// This yields a strip of real editable faces, not an Earcut triangle fan.
export function bridgeContactRing(outerLoop, holeLoop, world, project, idAt) {
  if (outerLoop.length < 3 || holeLoop.length < 3) return null;
  const decline = (reason) => {
    if (globalThis.process?.env?.AXIS_BOOLEAN_DEBUG) console.info('RING_SKIP', reason, outerLoop.length, holeLoop.length);
    return null;
  };
  const coord = (id) => project(world.get(id));
  const area2D = (points) => {
    let value = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      value += p.x * q.y - q.x * p.y;
    }
    return value * 0.5;
  };
  const outer = [...outerLoop], hole = [...holeLoop];
  if (area2D(outer.map(coord)) < 0) outer.reverse();
  if (area2D(hole.map(coord)) < 0) hole.reverse();
  const holePoints = hole.map(coord);
  const originalOuter = outer.map(coord);
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  // The clipping solver can add many collinear points along each original
  // cutter segment. Keep those points on the boundary, but only actual rim
  // corners require a spoke to the base. This avoids a 32-segment cylinder
  // receiving 100+ unnecessary radial connections.
  const cornerIndices = [];
  for (let i = 0; i < hole.length; i++) {
    const previous = holePoints[(i - 1 + hole.length) % hole.length];
    const current = holePoints[i], next = holePoints[(i + 1) % hole.length];
    const u = subtract(current, previous), v = subtract(next, current);
    const length = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
    if (length < 1e-12) continue;
    const curvature = cross(u, v) / length;
    if (curvature > 0.012) cornerIndices.push(i);
    // This ring builder is for convex holes. Concave outlines still use the
    // existing conservative mesher instead of producing invalid n-gons.
    else if (curvature < -0.012) return decline('hole not convex');
  }
  if (cornerIndices.length < 3) return decline('fewer than 3 corners');
  const corners = cornerIndices.map((i) => hole[i]);
  const cornerPoints = corners.map(coord);
  const center = cornerPoints.reduce((sum, p) => {
    sum.x += p.x; sum.y += p.y;
    return sum;
  }, { x: 0, y: 0 });
  center.x /= corners.length;
  center.y /= corners.length;
  const distanceSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const pointInside = (p, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  if (!pointInside(center, originalOuter)) return decline('center outside base ring');
  const splits = new Map();
  const anchors = [];
  const occupiedAnchors = new Set();
  const perimeter = originalOuter.reduce((sum, p, i) => {
    const q = originalOuter[(i + 1) % originalOuter.length];
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  const spacing = cornerPoints.reduce((min, p, i) => {
    const q = cornerPoints[(i + 1) % cornerPoints.length];
    return Math.min(min, Math.hypot(q.x - p.x, q.y - p.y));
  }, Infinity);
  const maxAnchorShift = Math.min(spacing * .75, perimeter * .14);
  // Radial projection is stable for the convex/star-shaped contact patches
  // produced by ordinary cylinder-to-face cuts. The projection remains within
  // an original base edge. No new free-floating vertex is created.
  for (const p of cornerPoints) {
    const direction = subtract(p, center);
    const innerDist = Math.hypot(direction.x, direction.y);
    if (innerDist < 1e-9) return decline('degenerate corner center');
    let hit = null;
    for (let i = 0; i < outer.length; i++) {
      const a = originalOuter[i], b = originalOuter[(i + 1) % outer.length];
      const edge = subtract(b, a);
      const denom = cross(direction, edge);
      if (Math.abs(denom) < 1e-12) continue;
      const relative = subtract(a, center);
      const alongRay = cross(relative, edge) / denom;
      const alongEdge = cross(relative, direction) / denom;
      if (alongRay <= 1 + 1e-6 || alongEdge < -1e-7 || alongEdge > 1 + 1e-7) continue;
      if (!hit || alongRay < hit.alongRay) hit = {
        side: i, t: Math.max(0, Math.min(1, alongEdge)), alongRay
      };
    }
    if (!hit) return decline('ray missed base border');
    const { side, t } = hit;
    const a = outer[side], b = outer[(side + 1) % outer.length];
    let anchor;
    const hitPosition = {
      x: originalOuter[side].x + (originalOuter[(side + 1) % outer.length].x - originalOuter[side].x) * t,
      y: originalOuter[side].y + (originalOuter[(side + 1) % outer.length].y - originalOuter[side].y) * t
    };
    const candidates = outer.map((id, index) => ({ id,
      distance: Math.sqrt(distanceSq(originalOuter[index], hitPosition)) }))
      .filter(candidate => !occupiedAnchors.has(candidate.id) && candidate.distance <= maxAnchorShift)
      .sort((left, right) => left.distance - right.distance);
    // Connect to a nearby existing base vertex rather than inserting
    // another vertex into a previously untouched base edge.
    if (candidates.length) anchor = candidates[0].id;
    else if (t < 1e-6 && !occupiedAnchors.has(a)) anchor = a;
    else if (t > 1 - 1e-6 && !occupiedAnchors.has(b)) anchor = b;
    else {
      const first = world.get(a), second = world.get(b);
      const position = first.clone().lerp(second, t);
      anchor = idAt(position);
      const key = a < b ? a + ',' + b : b + ',' + a;
      if (!splits.has(key)) splits.set(key, []);
      // t is stored in the orientation of the original loop edge.
      splits.get(key).push({ a, b, t, id: anchor });
    }
    anchors.push(anchor);
    occupiedAnchors.add(anchor);
  }
  const expanded = [];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    expanded.push(a);
    const key = a < b ? a + ',' + b : b + ',' + a;
    const inserts = (splits.get(key) || []).filter((x) => x.a === a && x.b === b)
      .sort((x, y) => x.t - y.t);
    for (const item of inserts) if (expanded[expanded.length - 1] !== item.id) {
      expanded.push(item.id);
    }
  }
  const anchorIndices = anchors.map((id) => expanded.indexOf(id));
  if (anchorIndices.some((index) => index < 0) ||
    new Set(anchorIndices).size !== corners.length) return decline('duplicate spokes');
  const faces = [], bridges = new Set();
  const m = expanded.length, n = corners.length;
  let circumference = 0;
  for (let i = 0; i < n; i++) {
    const step = (anchorIndices[(i + 1) % n] - anchorIndices[i] + m) % m;
    if (!step) return decline('zero step');
    circumference += step;
    const ids = [corners[i]];
    for (let j = 0; j <= step; j++) ids.push(expanded[(anchorIndices[i] + j) % m]);
    ids.push(corners[(i + 1) % n]);
    // Walk the original cutter boundary BACK to this segment's first
    // corner. Its collinear intermediate vertices remain in the same face
    // edge and stay shared with the cylinder wall.
    const begin = cornerIndices[i], end = cornerIndices[(i + 1) % n];
    let k = (end - 1 + hole.length) % hole.length;
    while (k !== begin) {
      ids.push(hole[k]);
      k = (k - 1 + hole.length) % hole.length;
    }
    if (new Set(ids).size !== ids.length) return decline('duplicate polygon vertices');
    const points = ids.map(coord);
    if (area2D(points) < 1e-11) return decline('negative polygon area');
    // The face renderer fan-triangulates polygons. Convexity is essential;
    // otherwise triangles can stretch over the hole or across a bevel.
    for (let j = 0; j < points.length; j++) {
      const a = points[j], b = points[(j + 1) % points.length];
      const c = points[(j + 2) % points.length];
      const turn = cross(subtract(b, a), subtract(c, b));
      // A nearly collinear cut-grid vertex can have a tiny negative turn from
      // numerical drift. Reject substantial concavity, not that subpixel kink.
      if (turn < -Math.max(1e-8, Math.abs(area2D(points)) * 0.01)) {
        if (globalThis.process?.env?.AXIS_BOOLEAN_DEBUG) console.info('RING_CONCAVE', i, j, turn, points.map((p) => [p.x.toFixed(3), p.y.toFixed(3)]));
        return decline('nonconvex polygon');
      }
    }
    const a = corners[i], b = expanded[anchorIndices[i]];
    bridges.add(a < b ? a + ',' + b : b + ',' + a);
    faces.push(ids);
  }
  if (circumference !== m) return decline('crossed spokes');
  const expected = Math.abs(area2D(originalOuter)) - Math.abs(area2D(holePoints));
  const actual = faces.reduce((sum, ids) => sum + area2D(ids.map(coord)), 0);
  if (expected < 1e-9 || Math.abs(expected - actual) > Math.max(1e-7, expected * 1e-4)) return decline('area mismatch');
  // Record only additional points. They must be inserted into adjacent faces
  // along the SAME old boundary edge or the mesh develops T-junctions.
  const inserted = [...splits.values()].flat().filter((item) => item.id !== item.a && item.id !== item.b);
  if (inserted.some((item) => {
    const p = coord(item.id), a = coord(item.a), b = coord(item.b);
    return distanceSq(p, {
      x: a.x + (b.x - a.x) * item.t,
      y: a.y + (b.y - a.y) * item.t
    }) > 1e-9;
  })) return null;
  return { faces, bridges, splits: inserted, outerBoundary: expanded };
}