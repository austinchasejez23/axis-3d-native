import * as THREE from 'three';
import { bridgeContactRing } from './booleanRing';


// Choose the corner used by EditableMesh's fan renderer. Boolean contours
// contain collinear split points; a poor starting corner produces many
// zero-area render triangles even when the actual polygon is perfectly valid.
// Rotating the vertex order changes neither its shape nor its topology.
export function stableFanStart(face, world) {
  if (face.length < 4) return face;
  const pts = face.map((id) => world.get(id));
  if (pts.some((p) => !p)) return face;
  const normal = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    normal.x += (p.y - q.y) * (p.z + q.z);
    normal.y += (p.z - q.z) * (p.x + q.x);
    normal.z += (p.x - q.x) * (p.y + q.y);
  }
  if (normal.lengthSq() < 1e-18) return face;
  normal.normalize();
  let best = 0, bestFlipped = Infinity, bestDegenerate = Infinity, bestFirstArea = -Infinity;
  for (let start = 0; start < pts.length; start++) {
    const origin = pts[start];
    const first = pts[(start + 1) % pts.length];
    const second = pts[(start + 2) % pts.length];
    const firstCross = new THREE.Vector3().subVectors(first, origin).cross(
      new THREE.Vector3().subVectors(second, origin));
    const firstArea = firstCross.lengthSq();
    if (firstArea < 1e-18 || firstCross.dot(normal) <= 0) continue;
    let degenerate = 0, flipped = 0;
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[(start + k) % pts.length], b = pts[(start + k + 1) % pts.length];
      const triangle = new THREE.Vector3().subVectors(a, origin).cross(
        new THREE.Vector3().subVectors(b, origin));
      if (triangle.lengthSq() < 1e-18) degenerate++;
      else if (triangle.dot(normal) < -1e-10) flipped++;
    }
    if (flipped < bestFlipped ||
      (flipped === bestFlipped && degenerate < bestDegenerate) ||
      (flipped === bestFlipped && degenerate === bestDegenerate && firstArea > bestFirstArea)) {
      best = start;
      bestFlipped = flipped;
      bestDegenerate = degenerate;
      bestFirstArea = firstArea;
      if (!flipped && !degenerate) break;
    }
  }
  return best ? [...face.slice(best), ...face.slice(0, best)] : face;
}

// Check shared mesh topology, not wireframe visibility. A closed solid has
// exactly two oppositely directed face boundaries on each mesh edge. The
// Boolean tool uses this before removing the operands from the scene.
export function closedTopologyProblem(mesh) {
  const ids = new Set(mesh.vertices.map((v) => v.id));
  const edges = new Map();
  for (const face of mesh.faces) {
    if (face.length < 3 || new Set(face).size !== face.length) {
      return 'a face has fewer than three distinct vertices';
    }
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      if (!ids.has(a) || !ids.has(b) || a === b) return 'a face has a missing or duplicated vertex';
      const key = a < b ? a + ',' + b : b + ',' + a;
      const record = edges.get(key) || { count: 0, direction: 0 };
      record.count++;
      record.direction += a < b ? 1 : -1;
      edges.set(key, record);
    }
  }
  for (const record of edges.values()) {
    if (record.count !== 2) return 'one or more faces are not joined along their edges';
    if (record.direction !== 0) return 'adjacent face orientations disagree';
  }
  return null;
}


// Consolidate ONLY faces produced or modified by a Boolean operation.
// Keep original mesh edges, face colors and all untouched faces intact.
// Merge real coplanar geometry rather than hiding unwanted triangle edges.
export function compactContactFaces(faces, colors, changed, world, preserveEdge, idAt, oldHiddenSeam = (_edgeKey) => false, isCutterFanEdge = (_firstId, _secondId) => false) {
  const edgeKey = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  const bridgeEdges = new Set();
  const normalOf = (points) => {
    const n = new THREE.Vector3();
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      n.x += (p.y - q.y) * (p.z + q.z);
      n.y += (p.z - q.z) * (p.x + q.x);
      n.z += (p.x - q.x) * (p.y + q.y);
    }
    return n.lengthSq() > 1e-24 ? n.normalize() : null;
  };
  const convex = (points, n) => {
    const w = n.dot(points[0]);
    for (const p of points) if (Math.abs(n.dot(p) - w) > 1e-5) return false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const c = points[(i + 2) % points.length];
      if (new THREE.Vector3().subVectors(b, a).cross(
        new THREE.Vector3().subVectors(c, b)).dot(n) < -1e-10) return false;
    }
    return true;
  };


  // A cylinder cutter's cap is usually a radial fan of triangles. On a
  // blind pocket that cap becomes the FLOOR; keep its outer rim but replace
  // all fan triangles with ONE real polygon. Only cutter-generated fan
  // spokes qualify, so an existing user-created fan elsewhere is untouched.
  const collapseCutterCapFans = () => {
    const allUses = new Map(), candidates = new Map();
    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      if (!face) continue;
      for (const id of face) {
        if (!allUses.has(id)) allUses.set(id, []);
        allUses.get(id).push(fi);
      }
      if (!changed.has(fi) || face.length !== 3) continue;
      for (let i = 0; i < 3; i++) {
        const center = face[i];
        if (!isCutterFanEdge(center, face[(i+1)%3]) ||
            !isCutterFanEdge(center, face[(i+2)%3])) continue;
        if (!candidates.has(center)) candidates.set(center, []);
        candidates.get(center).push(fi);
      }
    }
    for (const [center, group] of candidates) {
      if (group.length < 3) continue;
      const uses = allUses.get(center) || [];
      if (uses.length !== group.length || uses.some((fi)=>!group.includes(fi))) continue;
      if (group.some((fi)=>!faces[fi] || colors[fi] !== colors[group[0]])) continue;
      const ref = normalOf(faces[group[0]].map((id)=>world.get(id)));
      if (!ref || group.some((fi)=> {
        const n=normalOf(faces[fi].map((id)=>world.get(id)));
        return !n || n.dot(ref) < 0.99999;
      })) continue;
      const next = new Map(), incoming = new Map();
      let valid = true;
      for (const fi of group) {
        const f = faces[fi], i=f.indexOf(center);
        const u=f[(i+1)%3], v=f[(i+2)%3];
        if (next.has(u)) { valid=false; break; }
        next.set(u,v);
        incoming.set(v,(incoming.get(v)||0)+1);
      }
      if (!valid || incoming.size!==group.length || [...incoming.values()].some(n=>n!==1)) continue;
      const loop = [];
      const start = next.keys().next().value;
      let cur = start;
      while (cur != null && !loop.includes(cur) && loop.length <= group.length) {
        loop.push(cur);
        cur = next.get(cur);
      }
      if (cur!==start || loop.length !== group.length) continue;
      const rim=loop.map((id)=>world.get(id));
      if (!convex(rim,ref)) continue;
      const n=normalOf(rim);
      if (!n || n.dot(ref)<0.99999) continue;
      const area = (p) => {
        const sum = new THREE.Vector3();
        for (let j=0;j<p.length;j++) {
          const a=p[j], b=p[(j+1)%p.length];
          sum.x += (a.y-b.y)*(a.z+b.z);
          sum.y += (a.z-b.z)*(a.x+b.x);
          sum.z += (a.x-b.x)*(a.y+b.y);
        }
        return sum.length()/2;
      };
      const piecesArea=group.reduce((sum,fi)=>sum+area(faces[fi].map((id)=>world.get(id))),0);
      if (Math.abs(area(rim)-piecesArea)>Math.max(1e-7,piecesArea*1e-4)) continue;
      for (const fi of group) { faces[fi]=null; changed.delete(fi); }
      changed.add(faces.length);
      faces.push(loop);
      colors.push(colors[group[0]]);
    }
  };
  collapseCutterCapFans();
  // Partial cutter caps can retain a center with several clipped triangles.
  // Replace that planar star with its actual perimeter when it is convex.
  const collapsePartialCaps = () => {
    const centers = new Set();
    for (const fi of changed) {
      const f = faces[fi];
      if (!f) continue;
      for (let i=0;i<f.length;i++) {
        if (isCutterFanEdge(f[i],f[(i+1)%f.length]) ||
            isCutterFanEdge(f[i],f[(i-1+f.length)%f.length])) centers.add(f[i]);
      }
    }
    for (const center of centers) {
      const group=[];
      for (let fi=0;fi<faces.length;fi++) if (faces[fi]?.includes(center)) group.push(fi);
      if (group.length<3 || group.length>100 ||
          group.some(fi=>!changed.has(fi)||colors[fi]!==colors[group[0]])) continue;
      const ref=normalOf(faces[group[0]].map(id=>world.get(id)));
      if (!ref || group.some(fi=>{
        const pts=faces[fi].map(id=>world.get(id)), n=normalOf(pts);
        return !n || ref.dot(n)<.99999 ||
          pts.some(p=>Math.abs(ref.dot(p)-ref.dot(world.get(center)))>1e-5);
      })) continue;
      const next=new Map(), incoming=new Map();
      let valid=true;
      for (const fi of group) {
        const f=faces[fi], offset=f.indexOf(center);
        for (let k=1;k<f.length-1;k++) {
          const a=f[(offset+k)%f.length], b=f[(offset+k+1)%f.length];
          if (next.has(a)) {valid=false;break;}
          next.set(a,b);incoming.set(b,(incoming.get(b)||0)+1);
        }
        if (!valid) break;
      }
      if (!valid || incoming.size!==next.size || next.size<3 ||
          [...incoming.values()].some(n=>n!==1)) continue;
      const outline=[],start=next.keys().next().value;
      let current=start;
      while(current!=null && !outline.includes(current) && outline.length<=next.size) {
        outline.push(current); current=next.get(current);
      }
      if (current!==start || outline.length!==next.size || outline.includes(center)) continue;
      const n=normalOf(outline.map(id=>world.get(id)));
      if (!n || n.dot(ref)<.99999 || !convex(outline.map(id=>world.get(id)),n)) continue;
      const area=ids=>{
        const vec=new THREE.Vector3();
        for(let i=0;i<ids.length;i++)
          vec.add(new THREE.Vector3().crossVectors(world.get(ids[i]),world.get(ids[(i+1)%ids.length])));
        return vec.length()/2;
      };
      const total=group.reduce((sum,fi)=>sum+area(faces[fi]),0);
      if (Math.abs(area(outline)-total)>Math.max(1e-7,total*1e-4)) continue;
      const color=colors[group[0]];
      for (const fi of group) {faces[fi]=null;changed.delete(fi);}
      changed.add(faces.length);faces.push(outline);colors.push(color);
    }
  };
  collapsePartialCaps();

  // Rebuild a planar contact patch with an interior hole from its existing
  // boundary loops. Earcut triangulates ONLY the patch between the unchanged
  // base perimeter and the cutter's actual rim. It introduces no new vertices.
  // The convex merge pass below then combines those triangles into editable
  // polygons, rather than retaining the original plane-splitting fan.
  const remeshPlanarHoles = () => {
    const adjacency = new Map();
    const facePlanes = new Map();
    for (const fi of changed) {
      const f = faces[fi];
      if (!f) continue;
      const n = normalOf(f.map((id) => world.get(id)));
      if (!n) continue;
      facePlanes.set(fi, { n, w: n.dot(world.get(f[0])) });
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        const key = edgeKey(a, b);
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(key).push(fi);
      }
    }
    const links = new Map();
    for (const fi of facePlanes.keys()) links.set(fi, new Set());
    for (const members of adjacency.values()) {
      if (members.length !== 2) continue;
      const [a, b] = members;
      const p = facePlanes.get(a), q = facePlanes.get(b);
      if (colors[a] !== colors[b] || p.n.dot(q.n) < 0.99999 ||
        Math.abs(p.w - q.n.dot(world.get(faces[a][0]))) > 1e-5) continue;
      links.get(a).add(b);
      links.get(b).add(a);
    }
    const visited = new Set();
    const pointArea = (points) => {
      let value = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length];
        value += p.x * q.y - q.x * p.y;
      }
      return value / 2;
    };
    const insideLoop = (p, loop) => {
      let inLoop = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i], b = loop[j];
        if ((a.y > p.y) !== (b.y > p.y) &&
          p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inLoop = !inLoop;
      }
      return inLoop;
    };
    for (const start of links.keys()) {
      if (visited.has(start)) continue;
      const group = [];
      const stack = [start];
      visited.add(start);
      while (stack.length) {
        const fi = stack.pop();
        group.push(fi);
        for (const other of links.get(fi)) {
          if (visited.has(other)) continue;
          visited.add(other);
          stack.push(other);
        }
      }
      // A heavily subdivided patch can be safely left to the convex cleanup
      // rather than blocking the Android UI with a quadratic retopology pass.
      if (group.length < 3 || group.length > 2500) continue;
      const groupSet = new Set(group);
      const border = [];
      for (const fi of group) {
        const f = faces[fi];
        for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length];
          const adjacent = adjacency.get(edgeKey(a, b)) || [];
          if (!adjacent.some((other) => other !== fi && groupSet.has(other))) border.push([a, b]);
        }
      }
      if (border.length < 6 || border.length > 1000) continue;
      const next = new Map(), incoming = new Map();
      let valid = true;
      for (const [a, b] of border) {
        if (next.has(a)) { valid = false; break; }
        next.set(a, b);
        incoming.set(b, (incoming.get(b) || 0) + 1);
      }
      if (!valid || [...next.keys()].some((id) => incoming.get(id) !== 1)) continue;
      const loops = [], seen = new Set();
      for (const begin of next.keys()) {
        if (seen.has(begin)) continue;
        const loop = [];
        let curr = begin;
        while (!seen.has(curr) && curr != null) {
          loop.push(curr);
          seen.add(curr);
          curr = next.get(curr);
          if (loop.length > border.length) break;
        }
        if (curr !== begin || loop.length < 3) { valid = false; break; }
        loops.push(loop);
      }
      if (!valid || loops.length < 2 || loops.length > 8) continue;
      const n = facePlanes.get(group[0]).n;
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const project = (p) => ax >= ay && ax >= az
        ? new THREE.Vector2(p.y, p.z) : ay >= az
          ? new THREE.Vector2(p.z, p.x) : new THREE.Vector2(p.x, p.y);
      const projected = loops.map((ids) => ids.map((id) => project(world.get(id))));
      const areas = projected.map((pts) => Math.abs(pointArea(pts)));
      const outerIndex = areas.indexOf(Math.max(...areas));
      const outer = loops[outerIndex].slice();
      const inner = loops.filter((_, i) => i !== outerIndex).map((loop) => loop.slice());
      const outerPts = outer.map((id) => project(world.get(id)));
      if (!THREE.ShapeUtils.isClockWise(outerPts)) { outer.reverse(); outerPts.reverse(); }
      const holes = [];
      for (const ids of inner) {
        const pts = ids.map((id) => project(world.get(id)));
        if (!insideLoop(pts[0], outerPts)) { valid = false; break; }
        if (THREE.ShapeUtils.isClockWise(pts)) { ids.reverse(); pts.reverse(); }
        holes.push(pts);
      }
      if (!valid) continue;
      const expectedArea = group.reduce((sum, fi) => {
        return sum + Math.abs(pointArea(faces[fi].map((id) => project(world.get(id)))));
      }, 0);
      // For one fully enclosed cutter loop, explicitly connect its rim
      // vertices to existing base boundary vertices with a polygon strip.
      // Unlike Earcut this doesn't produce hidden long diagonals or fans.
      const ring = inner.length === 1
        ? bridgeContactRing(outer, inner[0], world, project, idAt)
        : null;
      if (globalThis.process?.env?.AXIS_BOOLEAN_DEBUG) console.info('BOOL_RING', group.length, outer.length, inner.map(x => x.length).join(','), !!ring);
      const replacement = [];
      let area = 0;
      if (ring) {
        for (const polygon of ring.faces) {
          const ids = [...polygon];
          area += Math.abs(pointArea(ids.map((id) => project(world.get(id)))));
          const points = ids.map((id) => world.get(id));
          if (normalOf(points).dot(n) < 0) ids.reverse();
          replacement.push(ids);
        }
      } else {
        let triangles;
        try { triangles = THREE.ShapeUtils.triangulateShape(outerPts, holes); }
        catch { continue; }
        const allIds = [...outer, ...inner.flat()];
        const allPoints = [...outerPts, ...holes.flat()];
        for (const triangle of triangles) {
          const ids = triangle.map((i) => allIds[i]);
          const pts = triangle.map((i) => allPoints[i]);
          const signed = pointArea(pts);
          if (Math.abs(signed) < 1e-11 || new Set(ids).size < 3) continue;
          area += Math.abs(signed);
          const a = world.get(ids[0]), b = world.get(ids[1]), c = world.get(ids[2]);
          const direction = new THREE.Vector3().subVectors(b, a).cross(
            new THREE.Vector3().subVectors(c, a)).dot(n);
          if (direction < 0) ids.reverse();
          replacement.push(ids);
        }
      }
      if (!replacement.length || Math.abs(area - expectedArea) > Math.max(1e-7, expectedArea * 1e-4)) continue;
      // Earcut skips collinear points on contour edges. Those points are
      // nevertheless REQUIRED by neighbouring unmodified faces. Split only
      // the new triangles along those edges so every boundary vertex remains
      // shared and the untouched mesh stays watertight.
      const boundaryIds = [...new Set(loops.flat())];
      // The bridged ring already uses every original contour vertex. Only
      // Earcut's triangles need their boundary edge segments restored.
      const refined = ring ? [...replacement] : [];
      if (!ring) for (const triangle of replacement) {
        let pieces = [triangle];
        for (const id of boundaryIds) {
          const p = world.get(id);
          const nextPieces = [];
          for (const piece of pieces) {
            if (piece.includes(id)) { nextPieces.push(piece); continue; }
            let split = false;
            for (let i = 0; i < 3; i++) {
              const a = world.get(piece[i]), b = world.get(piece[(i + 1) % 3]);
              const dir = new THREE.Vector3().subVectors(b, a);
              const lengthSq = dir.lengthSq();
              if (lengthSq < 1e-16) continue;
              const t = new THREE.Vector3().subVectors(p, a).dot(dir) / lengthSq;
              if (t <= 1e-6 || t >= 1 - 1e-6) continue;
              if (p.distanceToSquared(a.clone().addScaledVector(dir, t)) > 1e-10) continue;
              const x = piece[i], y = piece[(i + 1) % 3], z = piece[(i + 2) % 3];
              nextPieces.push([x, id, z], [id, y, z]);
              split = true;
              break;
            }
            if (!split) nextPieces.push(piece);
          }
          pieces = nextPieces;
        }
        refined.push(...pieces);
      }
      if (!refined.length) continue;
      // Never install a planar replacement unless its boundary is IDENTICAL
      // to the original contact patch and all its internal edges pair up.
      // This guards the untouched neighbouring faces from open seams.
      // If a spoke lands partway along an existing base edge, split that edge
      // in the reference boundary too. The same inserted vertex is then
      // threaded through every neighboring untouched face at commit time.
      const insertions = new Map();
      if (ring) for (const item of ring.splits) {
        const k = edgeKey(item.a, item.b);
        if (!insertions.has(k)) insertions.set(k, []);
        insertions.get(k).push(item);
      }
      const splitChain = (a, b) => {
        const items = insertions.get(edgeKey(a, b)) || [];
        return [a, ...items.slice().sort((x, y) =>
          (x.a === a ? x.t : 1 - x.t) - (y.a === a ? y.t : 1 - y.t))
          .map((item) => item.id), b];
      };
      const expectedBorder = new Set();
      for (const [a, b] of border) {
        const chain = splitChain(a, b);
        for (let j = 0; j < chain.length - 1; j++) {
          expectedBorder.add(edgeKey(chain[j], chain[j + 1]));
        }
      }
      const counts = new Map();
      for (const f of refined) for (let i = 0; i < f.length; i++) {
        const key = edgeKey(f[i], f[(i + 1) % f.length]);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const resultBorder = [...counts].filter(([, count]) => count === 1).map(([key]) => key);
      if (resultBorder.length !== expectedBorder.size ||
        resultBorder.some((key) => !expectedBorder.has(key)) ||
        [...counts.values()].some((count) => count > 2)) continue;
      // Thread the newly created base-edge vertices into neighboring faces.
      // Their surface remains untouched: only the shared edge is subdivided.
      if (ring && ring.splits.length) {
        for (let fi = 0; fi < faces.length; fi++) {
          if (groupSet.has(fi) || !faces[fi]) continue;
          const original = faces[fi], expanded = [];
          let modified = false;
          for (let i = 0; i < original.length; i++) {
            const a = original[i], b = original[(i + 1) % original.length];
            const chain = splitChain(a, b);
            expanded.push(a, ...chain.slice(1, -1));
            if (chain.length > 2) modified = true;
          }
          if (modified) {
            faces[fi] = stableFanStart(expanded, world);
            // Stitch the untouched neighbour without making it a cleanup candidate.
          }
        }
      }
      for (const fi of group) { faces[fi] = null; changed.delete(fi); }
      if (ring) {
        // A reconstructed ring is made of actual editable face strips, not
        // triangulation fragments. Keep every one of their boundary edges
        // visible, including the cutter rim, base segments and the spokes.
        // User-deleted edges are still respected by the solver's later check.
        for (const face of refined) for (let i = 0; i < face.length; i++) {
          bridgeEdges.add(edgeKey(face[i], face[(i + 1) % face.length]));
        }
      }
      for (const f of refined) {
        changed.add(faces.length);
        faces.push(f);
        colors.push(colors[start]);
      }
    }
  };
  remeshPlanarHoles();

  // A cut can change just one of the two triangles making up an old quad.
  // Its old (hidden) triangulation diagonal then borders an unchanged
  // triangle. Bring THAT triangle into the local cleanup so the diagonal
  // can disappear as actual topology, without touching existing visible
  // grid edges or distant faces.
  const originalChanged = new Set(changed);
  const borders = new Map();
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    if (!f) continue;
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length], key = edgeKey(a, b);
      if (!borders.has(key)) borders.set(key, []);
      borders.get(key).push(fi);
    }
  }
  for (const [key, pair] of borders) {
    if (pair.length !== 2 || !oldHiddenSeam(key)) continue;
    const [a, b] = pair;
    if (originalChanged.has(a) === originalChanged.has(b)) continue;
    if (colors[a] !== colors[b]) continue;
    const nA = normalOf(faces[a].map((id) => world.get(id)));
    const nB = normalOf(faces[b].map((id) => world.get(id)));
    if (nA && nB && nA.dot(nB) > 0.99999) {
      changed.add(a);
      changed.add(b);
    }
  }

  // An editable polygon may be concave as long as its contour is simple.
  // Triangulation is deferred to EditableMesh's internal rendering geometry.
  const simplePlanar = (points, normal) => {
    if (points.length > 256) return false;
    const plane = normal.dot(points[0]);
    if (points.some((p) => Math.abs(normal.dot(p) - plane) > 1e-5)) return false;
    const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
    const flat = points.map((p) => ax >= ay && ax >= az
      ? { x: p.y, y: p.z } : ay >= az
        ? { x: p.z, y: p.x } : { x: p.x, y: p.y });
    const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const segmentOverlap = (a,b,c,d) => {
      const o1=cross(a,b,c), o2=cross(a,b,d), o3=cross(c,d,a), o4=cross(c,d,b);
      const e=1e-9;
      if (((o1>e && o2< -e)||(o1< -e && o2>e)) &&
          ((o3>e && o4< -e)||(o3< -e && o4>e))) return true;
      if (Math.abs(o1)<e && Math.abs(o2)<e && Math.abs(o3)<e && Math.abs(o4)<e) {
        const axis=Math.abs(b.x-a.x)>Math.abs(b.y-a.y)?'x':'y';
        const [ab0,ab1]=[a[axis],b[axis]].sort((x,y)=>x-y);
        const [cd0,cd1]=[c[axis],d[axis]].sort((x,y)=>x-y);
        return Math.min(ab1,cd1)-Math.max(ab0,cd0)>e;
      }
      return false;
    };
    for (let i=0;i<flat.length;i++) {
      const a=flat[i],b=flat[(i+1)%flat.length];
      if (Math.hypot(a.x-b.x,a.y-b.y)<1e-8) return false;
      for (let j=i+2;j<flat.length;j++) {
        if ((j+1)%flat.length===i) continue;
        if (segmentOverlap(a,b,flat[j],flat[(j+1)%flat.length])) return false;
      }
    }
    let signedArea=0;
    for (let i=0;i<flat.length;i++) {
      const a=flat[i],b=flat[(i+1)%flat.length];
      signedArea+=a.x*b.y-b.x*a.y;
    }
    return Math.abs(signedArea)>1e-10;
  };

  const join = (first, second, ia, ib) => {
    const a = first[ia], b = first[(ia + 1) % first.length];
    if (second[ib] !== b || second[(ib + 1) % second.length] !== a) return null;
    const result = [b];
    let i = (ia + 2) % first.length;
    while (first[i] !== a) { result.push(first[i]); i = (i + 1) % first.length; }
    result.push(a);
    i = (ib + 2) % second.length;
    while (second[i] !== b) { result.push(second[i]); i = (i + 1) % second.length; }
    if (new Set(result).size !== result.length) return null;
    const points = result.map((id) => world.get(id));
    if (points.some((p) => !p)) return null;
    const n = normalOf(points);
    if (!n) return null;
    if (!convex(points, n) && !simplePlanar(points, n)) return null;
    return result;
  };
  // Merge disjoint pairs in each pass to avoid quadratic performance on
  // larger cut surfaces. This removes the shared edge from actual topology.
  for (let pass = 0; pass < 30; pass++) {
    const adjacency = new Map();
    for (let fi = 0; fi < faces.length; fi++) {
      if (!changed.has(fi) || !faces[fi]) continue;
      const face = faces[fi];
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const k = edgeKey(a, b);
        if (!adjacency.has(k)) adjacency.set(k, []);
        adjacency.get(k).push({ fi, i, a, b });
      }
    }
    const candidates = [];
    for (const [key, entries] of adjacency) {
      if (entries.length !== 2) continue;
      const [left, right] = entries;
      if (left.fi === right.fi || colors[left.fi] !== colors[right.fi]) continue;
      if (bridgeEdges.has(key) || preserveEdge(key, world.get(left.a), world.get(left.b))) continue;
      const f = faces[left.fi], g = faces[right.fi];
      const n1 = normalOf(f.map((id) => world.get(id)));
      const n2 = normalOf(g.map((id) => world.get(id)));
      if (!n1 || !n2 || n1.dot(n2) < 0.99999) continue;
      const merged = join(f, g, left.i, right.i);
      if (!merged) continue;
      const score = (merged.length === 4 ? 100 : 0) +
        world.get(left.a).distanceTo(world.get(left.b)) / merged.length;
      candidates.push({ left: left.fi, right: right.fi, merged, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const used = new Set();
    let mergedCount = 0;
    for (const item of candidates) {
      if (used.has(item.left) || used.has(item.right)) continue;
      used.add(item.left); used.add(item.right);
      faces[item.left] = item.merged;
      faces[item.right] = null;
      mergedCount++;
    }
    if (!mergedCount) break;
  }
  const keptFaces = [], keptColors = [], keptChanged = new Set();
  for (let i = 0; i < faces.length; i++) {
    if (!faces[i]) continue;
    if (changed.has(i)) keptChanged.add(keptFaces.length);
    keptFaces.push(faces[i]);
    keptColors.push(colors[i]);
  }
  faces.splice(0, faces.length, ...keptFaces);
  colors.splice(0, colors.length, ...keptColors);
  changed.clear();
  for (const fi of keptChanged) changed.add(fi);
  return bridgeEdges;
}