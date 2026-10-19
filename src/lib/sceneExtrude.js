import * as THREE from 'three';
import { edgeKey } from './meshTopology';

// Interactive face-extrude helpers, extracted from SceneManager to keep the
// main source under the line limit. Attached to SceneManager.prototype.
export function applySceneExtrude(SceneManager) {
  const P = SceneManager.prototype;

  // Interactive face extrude: duplicates the selected faces into a cap and side
  // walls at zero height, then the user drags to set the extrusion distance along
  // the face normal. Commits on pointer-up; reverts if no drag happened.
  P.beginExtrudeDrag = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'face' || sel.indices.length === 0) return;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    const preSnapshot = { meshes: this.meshes.map(m => m.clone()), selection: { ...this.selection, indices: [...this.selection.indices] } };
    const ek = edgeKey;
    const selSet = new Set(sel.indices);
    const edgeFaces = new Map();
    for (const fi of sel.indices) {
      const f = mesh.faces[fi];
      for (let j = 0; j < f.length; j++) {
        const k = ek(f[j], f[(j + 1) % f.length]);
        if (!edgeFaces.has(k)) edgeFaces.set(k, []);
        edgeFaces.get(k).push(fi);
      }
    }
    const visited = new Set();
    const groups = [];
    for (const fi of sel.indices) {
      if (visited.has(fi)) continue;
      const stack = [fi];
      const group = [];
      while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        group.push(cur);
        const f = mesh.faces[cur];
        for (let j = 0; j < f.length; j++) {
          const k = ek(f[j], f[(j + 1) % f.length]);
          for (const n of edgeFaces.get(k) || []) {
            if (!visited.has(n) && Math.abs(mesh.getFaceNormal(cur).dot(mesh.getFaceNormal(n))) > 0.9995) stack.push(n);
          }
        }
      }
      groups.push(group);
    }
    const newCapFaces = [];
    const newSideFaces = [];
    const items = [];
    const newVid = () => Date.now() + Math.floor(Math.random() * 1e6);
    for (const group of groups) {
      const groupSet = new Set(group);
      let n = new THREE.Vector3();
      const referenceNormal = mesh.getFaceNormal(group[0]).clone();
      for (const fi of group) {
        const faceNormal = mesh.getFaceNormal(fi).clone();
        if (faceNormal.dot(referenceNormal) < 0) faceNormal.negate();
        n.add(faceNormal);
      }
      n.normalize();
      const boundary = [];
      for (const fi of group) {
        const f = mesh.faces[fi];
        for (let j = 0; j < f.length; j++) {
          const a = f[j], b = f[(j + 1) % f.length];
          const adj = (edgeFaces.get(ek(a, b)) || []).filter(x => groupSet.has(x));
          if (adj.length === 1) boundary.push({ a, b });
        }
      }
      const usedVids = new Set();
      for (const fi of group) for (const vid of mesh.faces[fi]) usedVids.add(vid);
      const oldToNew = new Map();
      for (const vid of usedVids) {
        const v = mesh.getVertex(vid);
        const nv = { id: newVid(), x: v.x, y: v.y, z: v.z };
        mesh.vertices.push(nv);
        oldToNew.set(vid, nv.id);
        items.push({ capVid: nv.id, bx: v.x, by: v.y, bz: v.z, nx: n.x, ny: n.y, nz: n.z });
      }
      for (const fi of group) newCapFaces.push(mesh.faces[fi].map(vid => oldToNew.get(vid)));
      for (const { a, b } of boundary) {
        const na = oldToNew.get(a), nb = oldToNew.get(b);
        // One quad face per side wall instead of two triangles. As a single
        // face, all four of its sides are real face boundaries, so every rail
        // and rim line stays visible from both directions, and tools that read
        // a face's shape (bevel) see a flat quad rather than two half-walls.
        newSideFaces.push([a, b, nb, na]);
      }
    }
    mesh.faces = mesh.faces.filter((_, i) => !selSet.has(i));
    const base = mesh.faces.length;
    for (const f of newCapFaces) mesh.faces.push(f);
    const capCount = newCapFaces.length;
    for (const f of newSideFaces) mesh.faces.push(f);
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    const capIndices = [];
    for (let i = 0; i < capCount; i++) capIndices.push(base + i);
    this.setSelection({ meshId: sel.meshId, type: 'face', indices: capIndices });
    let avgN = new THREE.Vector3();
    for (const it of items) avgN.add(new THREE.Vector3(it.nx, it.ny, it.nz));
    avgN.normalize();
    // Convert the local face-normal step to world space once. Pointer drags
    // are measured in world space, so comparing them to the untransformed
    // local normal reverses or skews extrusion on rotated/scaled objects.
    const worldStep = avgN.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.getWorldMatrix(mesh)));
    const worldUnitsPerLocal = Math.max(1e-6, worldStep.length());
    const worldDirection = worldStep.normalize();
    // Activating extrude is its own undoable action: this snapshot takes you
    // back to before the extrude existed. The drag that follows gets its own
    // step (see commitExtrudeDrag), so undo after moving an extrusion undoes
    // only the move and leaves the extrude active.
    this.pushUndoSnapshot(preSnapshot);
    this.extrudeDrag = {
      meshId: sel.meshId, items, preSnapshot, activeSnapshot: this.captureSnapshot(),
      hasDragged: false, normal: avgN, worldDirection, worldUnitsPerLocal,
    };
    this.updateStats();
  };

  // Edge extrude: builds connected quads at zero height and waits for a drag
  // that begins on (or immediately beside) the newly extruded edge chain.
  P.beginEdgeExtrudeDrag = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    if (this.multiSelect) this.exitMultiSelect();
    const preSnapshot = { meshes: this.meshes.map(m => m.clone()), selection: { ...sel, indices: [...sel.indices] } };
    const edges = mesh.getEdges();
    const selected = sel.indices.map((i) => edges[i]).filter(Boolean);
    if (selected.length === 0) return;
    const directionByVertex = new Map();
    const edgeDirections = [];
    for (const e of selected) {
      const A = mesh.getVertex(e.v1), B = mesh.getVertex(e.v2);
      const n = new THREE.Vector3();
      const dir = new THREE.Vector3(B.x - A.x, B.y - A.y, B.z - A.z);
      const mid = new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
      if (dir.lengthSq() > 1e-12) {
        dir.normalize();
        for (const fi of this.adjacentFacesForEdge(mesh, e.v1, e.v2)) {
          const out = new THREE.Vector3().crossVectors(dir, mesh.getFaceNormal(fi));
          if (out.lengthSq() < 1e-12) continue;
          out.normalize();
          if (out.dot(mid.clone().sub(mesh.getFaceCenter(fi))) < 0) out.negate();
          n.add(out);
        }
      }
      if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
      n.normalize();
      edgeDirections.push(n);
      for (const vid of [e.v1, e.v2]) {
        if (!directionByVertex.has(vid)) directionByVertex.set(vid, new THREE.Vector3());
        directionByVertex.get(vid).add(n);
      }
    }
    // A closed selected edge loop must translate as one rigid profile. Giving
    // every vertex its own adjacent-face direction makes circular loops flare,
    // taper and twist during extrusion. Derive one normal from the loop plane.
    const degree = new Map();
    for (const e of selected) {
      degree.set(e.v1, (degree.get(e.v1) || 0) + 1);
      degree.set(e.v2, (degree.get(e.v2) || 0) + 1);
    }
    const isClosedLoop = degree.size >= 3 && [...degree.values()].every((d) => d === 2);
    let loopNormal = null;
    if (isClosedLoop) {
      const neighbors = new Map();
      for (const e of selected) {
        if (!neighbors.has(e.v1)) neighbors.set(e.v1, []);
        if (!neighbors.has(e.v2)) neighbors.set(e.v2, []);
        neighbors.get(e.v1).push(e.v2);
        neighbors.get(e.v2).push(e.v1);
      }
      const ordered = [];
      const start = selected[0].v1;
      let prev = null, cur = start;
      do {
        ordered.push(cur);
        const next = (neighbors.get(cur) || []).find((id) => id !== prev);
        prev = cur;
        cur = next;
      } while (cur != null && cur !== start && ordered.length <= degree.size);

      if (cur === start && ordered.length === degree.size) {
        const n = new THREE.Vector3();
        for (let i = 0; i < ordered.length; i++) {
          const a = mesh.getVertex(ordered[i]);
          const b = mesh.getVertex(ordered[(i + 1) % ordered.length]);
          n.x += (a.y - b.y) * (a.z + b.z);
          n.y += (a.z - b.z) * (a.x + b.x);
          n.z += (a.x - b.x) * (a.y + b.y);
        }
        if (n.lengthSq() > 1e-10) loopNormal = n.normalize();
      }
    }

    const newVid = () => Date.now() + Math.floor(Math.random() * 1e6);
    const duplicateByVertex = new Map();
    const items = [];
    const avgN = new THREE.Vector3();
    for (const [vid, sum] of directionByVertex) {
      const v = mesh.getVertex(vid);
      const n = loopNormal
        ? loopNormal.clone()
        : (sum.lengthSq() > 1e-8 ? sum.normalize() : edgeDirections[0].clone());
      const nv = { id: newVid(), x: v.x, y: v.y, z: v.z };
      mesh.vertices.push(nv);
      duplicateByVertex.set(vid, nv.id);
      items.push({ capVid: nv.id, bx: v.x, by: v.y, bz: v.z, nx: n.x, ny: n.y, nz: n.z });
      avgN.add(n);
    }
    const newPairs = [];
    for (const e of selected) {
      const a2 = duplicateByVertex.get(e.v1), b2 = duplicateByVertex.get(e.v2);
      mesh.faces.push([e.v1, e.v2, b2, a2]);
      newPairs.push({ v1: a2, v2: b2 });
    }
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    const ek = edgeKey;
    const wanted = new Set(newPairs.map(p => ek(p.v1, p.v2)));
    const newIndices = mesh.getEdges().map((e2, i) => (wanted.has(ek(e2.v1, e2.v2)) ? i : -1)).filter(i => i >= 0);
    this.setSelection({ meshId: sel.meshId, type: 'edge', indices: newIndices });
    if (avgN.lengthSq() < 1e-8) avgN.copy(edgeDirections[0]);
    avgN.normalize();
    const worldStep = avgN.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.getWorldMatrix(mesh)));
    const worldUnitsPerLocal = Math.max(1e-6, worldStep.length());
    this.pushUndoSnapshot(preSnapshot);
    this.extrudeDrag = {
      meshId: sel.meshId, items, preSnapshot, activeSnapshot: this.captureSnapshot(),
      hasDragged: false, kind: 'edge', normal: avgN,
      worldDirection: worldStep.normalize(), worldUnitsPerLocal,
    };
    this.updateStats();
  };

  // Drag → extrude offset, measured against the normal AS SEEN ON SCREEN.
  // A world-space dot product against a camera-facing drag plane collapses to
  // zero whenever the extruded face points at the camera (the usual case), so
  // the extrude never moved. Screen-space projection has no such blind spot;
  // when the normal points almost straight at the camera its screen direction
  // is undefined, so vertical drag (up = outward) drives it instead.
  P.extrudeOffsetFromDrag = /** @this {import('./SceneManager.js').SceneManager} */ function (startX, startY, curX, curY) {
    const ed = this.extrudeDrag;
    if (!ed) return 0;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const toScreen = (v) => {
      const p = v.clone().project(this.camera);
      return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height };
    };
    const center = this.getSelectionCenter();
    const probe = Math.max(0.001, this.cameraDist * 0.05);
    const a = toScreen(center);
    const b = toScreen(center.clone().addScaledVector(ed.worldDirection, probe));
    const nx = b.x - a.x, ny = b.y - a.y;
    const nLen = Math.hypot(nx, ny);
    const dx = curX - startX, dy = curY - startY;
    if (nLen > 3) {
      const along = (dx * nx + dy * ny) / nLen;
      return (along * (probe / nLen)) / ed.worldUnitsPerLocal;
    }
    const fov = this.camera.fov * Math.PI / 180;
    const worldPerPixel = (2 * this.cameraDist * Math.tan(fov / 2)) / (rect.height || 1);
    return (-dy * worldPerPixel) / ed.worldUnitsPerLocal;
  };

  // Faces adjacent to an edge (by vertex pair).
  P.adjacentFacesForEdge = /** @this {import('./SceneManager.js').SceneManager} */ function (mesh, v1, v2) {
    const res = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      const f = mesh.faces[i];
      if (f.includes(v1) && f.includes(v2)) res.push(i);
    }
    return res;
  };

  P.updateExtrudeHeight = /** @this {import('./SceneManager.js').SceneManager} */ function (offset) {
    if (!this.extrudeDrag) return;
    const mesh = this.getMesh(this.extrudeDrag.meshId);
    if (!mesh) return;
    const previous = this.extrudeDrag.lastOffset || 0;
    const step = offset - previous;
    this.extrudeDrag.lastOffset = offset;
    for (const it of this.extrudeDrag.items) {
      const v = mesh.vertices.find(vx => vx.id === it.capVid);
      if (!v) continue;
      v.x += it.nx * step;
      v.y += it.ny * step;
      v.z += it.nz * step;
    }
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    this.updateHighlights();
    this.updateHud();
  };

  // Free extrude: the new vertices follow the drag itself, in any direction.
  P.updateExtrudeFree = /** @this {import('./SceneManager.js').SceneManager} */ function (worldDelta) {
    if (!this.extrudeDrag) return;
    const mesh = this.getMesh(this.extrudeDrag.meshId);
    if (!mesh) return;
    const d = this.worldToLocalDelta(mesh, worldDelta);
    const previous = this.extrudeDrag.lastFreeDelta || new THREE.Vector3();
    const step = d.clone().sub(previous);
    this.extrudeDrag.lastFreeDelta = d.clone();
    for (const it of this.extrudeDrag.items) {
      const v = mesh.vertices.find(vx => vx.id === it.capVid);
      if (!v) continue;
      v.x += step.x;
      v.y += step.y;
      v.z += step.z;
    }
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    this.updateHighlights();
    this.updateHud();
  };

  P.commitExtrudeDrag = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (!this.extrudeDrag) return;
    if (this.extrudeDrag.hasDragged) {
      // Undo the MOVE only: step back to the extrude at zero height, still
      // active and selected — not back to before the extrude.
      this.pushUndoSnapshot(this.extrudeDrag.activeSnapshot);
    } else {
      // Nothing was dragged, so the activation is discarded together with its
      // undo entry — undo must not need two taps to clear a no-op.
      this.undoStack.pop();
      this.restoreSnapshot(this.extrudeDrag.preSnapshot);
    }
    this.extrudeDrag = null;
  };
}