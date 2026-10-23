import * as THREE from 'three';

// Selection methods for SceneManager, extracted so SceneManager.js stays under
// the edit size limit and selection logic lives in one focused module. All
// methods are assigned to the prototype and use `this` exactly as they did
// inline. Fixes applied here:
//  - faceIndexFromHit: map a raycast hit's buffer-triangle index back to a
//    mesh face index so n-gon faces (Create-Face-by-Border output) are
//    selectable.
//  - isPointOverSelection: a gesture over a selected OBJECT takes priority
//    over camera even when another object is in front (checks ALL hits);
//    selected VERTICES get a larger grace/buffer zone so they're easy to drag.
export function applySceneSelection(SceneManager) {
  const P = SceneManager.prototype;

  // === SELECTION ===
  P.setSelectionMode = /** @this {import('./SceneManager.js').SceneManager} */ function (mode) {
    if (this.extrudeDrag) this.commitExtrudeDrag();
    if (this.drawMode) this.exitDrawMode();
    if (this.cutMode) this.exitCutMode();
    this.exitMultiSelect();
    this.selectionMode = mode;
    this.targetMergePair = null;
    this.clearSelection();
  };

  P.setSelection = /** @this {import('./SceneManager.js').SceneManager} */ function (sel) {
    // Edge mode only ever holds edges: a face OR whole-object selection coming
    // from a tool or a stale action is rejected.
    if (this.selectionMode === 'edge' && (sel.type === 'face' || sel.type === 'object')) {
      this.clearSelection();
      return;
    }
    // Whole-object selection exists only in object mode: vertex / edge / face
    // mode never hold an object selection.
    if (this.selectionMode !== 'object' && sel.type === 'object' && sel.meshId) {
      this.clearSelection();
      return;
    }
    // A new pick in an appearance mode has no visible highlight, so there is
    // nothing to confirm what was just selected. Note whether this is actually
    // a different selection, and flash it below if so.
    const prev = this.selection;
    const prevIdx = prev?.indices || [];
    const nextIdx = sel.indices || [];
    const selectionChanged = !prev || prev.meshId !== sel.meshId || prev.type !== sel.type
      || prevIdx.length !== nextIdx.length || nextIdx.some((v, i) => v !== prevIdx[i]);
    this.selection = sel;
    this.subRotation = { x: 0, y: 0, z: 0 };
    if (sel.meshId) {
      const focus = this.getSelectionCenter();
      const bounds = this.getSelectionBounds();
      this._cameraFocusPoint = focus.clone();
      this._cameraFocusRadius = Math.max(0.25, bounds.sx, bounds.sy, bounds.sz) * 0.5;
    }
    if (sel.type === 'object') {
      this.selectedMeshIds = sel.meshId ? [sel.meshId] : [];
    }
    if (selectionChanged && sel.meshId && this.highlightsSuppressed) {
      this.revealSuppressedSelection();
    }
    // Selection changes must not move or reframe the camera.
    this.updateHighlights();
    this.updateStats();
  };

  P.clearSelection = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    this.targetMergePair = null;
    this.selection = { meshId: null, type: this.selectionMode, indices: [] };
    this.selectedMeshIds = [];
    this.subRotation = { x: 0, y: 0, z: 0 };
    this.updateHighlights();
    this.updateStats();
  };

  P.enterMultiSelect = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.extrudeDrag?.kind === 'edge') return;
    this.multiSelect = true;
    this.cb.onMultiSelectChange?.(true);
    this.updateStats();
  };

  P.exitMultiSelect = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    // Only turns off the paint-add "staging" mode. The selected group itself
    // (selectedMeshIds) is left untouched, so a multi-selection survives being
    // manipulated or acted on instead of collapsing to a single object.
    this.multiSelect = false;
    this.cb.onMultiSelectChange?.(false);
    this.updateHighlights();
    this.updateStats();
  };

  P.isGroupMode = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    return this.selectionMode === 'object' && this.selectedMeshIds.length > 1;
  };

  P.getGroupCenter = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.selectedMeshIds.length === 0) return null;
    const c = new THREE.Vector3();
    let n = 0;
    for (const id of this.selectedMeshIds) {
      const m = this.getMesh(id);
      if (!m) continue;
      c.add(m.position);
      n++;
    }
    return n > 0 ? c.divideScalar(n) : null;
  };

  // Object-mode multi-select: tap to toggle an object in/out of the group.
  P.toggleObjectAtScreenPoint = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    const hits = this.raycastMeshes(x, y);
    if (hits.length === 0) return false;
    const meshId = this.findMeshIdByObject(hits[0].object);
    if (!meshId) return false;
    const before = this.captureSnapshot();
    const i = this.selectedMeshIds.indexOf(meshId);
    if (i >= 0) this.selectedMeshIds.splice(i, 1);
    else this.selectedMeshIds.push(meshId);
    this.selection = {
      meshId: this.selectedMeshIds.length > 0 ? this.selectedMeshIds[0] : null,
      type: 'object',
      indices: [],
    };
    this.updateHighlights();
    this.updateStats();
    if (this.selectionChanged(before)) this.pushUndoSnapshot(before);
    return true;
  };

  P.toggleSelectionAtScreenPoint = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    const mode = this.selectionMode;
    const before = this.captureSnapshot();
    let hit = false;
    if (mode === 'vertex') {
      const v = this.findClosestVertex(x, y);
      if (v) {
        hit = true;
        const sel = this.selection;
        if (sel.meshId === v.meshId) {
          const i = sel.indices.indexOf(v.index);
          if (i >= 0) sel.indices.splice(i, 1);
          else sel.indices.push(v.index);
        } else {
          this.selection = { meshId: v.meshId, type: 'vertex', indices: [v.index] };
        }
      }
    } else if (mode === 'edge') {
      const ed = this.findClosestEdge(x, y);
      if (ed) {
        hit = true;
        const sel = this.selection;
        if (sel.meshId === ed.meshId) {
          const i = sel.indices.indexOf(ed.index);
          if (i >= 0) sel.indices.splice(i, 1);
          else sel.indices.push(ed.index);
        } else {
          this.selection = { meshId: ed.meshId, type: 'edge', indices: [ed.index] };
        }
      }
    } else if (mode === 'face') {
      const hits = this.raycastMeshes(x, y);
      if (hits.length > 0) {
        const meshId = this.findMeshIdByObject(hits[0].object);
        const mesh = this.getMesh(meshId);
        const faceIndex = mesh ? mesh.getFaceIndexFromTriangle(hits[0].faceIndex) : hits[0].faceIndex;
        const group = mesh ? mesh.getCoplanarFaceGroup(faceIndex) : [faceIndex];
        hit = true;
        const sel = this.selection;
        if (sel.meshId === meshId) {
          const allIn = group.every(g => sel.indices.includes(g));
          if (allIn) sel.indices = sel.indices.filter(g => !group.includes(g));
          else { const set = new Set(sel.indices); group.forEach(g => set.add(g)); sel.indices = Array.from(set); }
        } else {
          this.selection = { meshId, type: 'face', indices: group };
        }
      }
    }
    if (hit) {
      this.updateHighlights();
      this.updateStats();
      if (this.selectionChanged(before)) this.pushUndoSnapshot(before);
    }
    return hit;
  };

  P.screenToNDC = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
  };

  P.raycastMeshes = /** @this {import('./SceneManager.js').SceneManager} */ function (ndcX, ndcY) {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [];
    for (const [id, obj] of this.threeObjects) {
      if (!obj.mesh.visible) continue;
      const em = this.getMesh(id);
      if (em && em.locked) continue;          // locked objects are not selectable
      meshes.push(obj.mesh);
    }
    return this.raycaster.intersectObjects(meshes, false);
  };

  P.isWorldPointVisible = /** @this {import('./SceneManager.js').SceneManager} */ function (point) {
    const direction = point.clone().sub(this.camera.position), distance = direction.length();
    if (distance < 1e-6) return true;
    // A point behind the camera is never visible. The occlusion ray below
    // points away from the scene there and hits nothing, which used to pass
    // geometry behind a zoomed-in camera as visible.
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    if (direction.dot(forward) <= (this.camera.near ?? 0)) return false;
    this.raycaster.set(this.camera.position, direction.normalize());
    const objects = [...this.threeObjects.values()].filter(o => o.mesh.visible).map(o => o.mesh);
    const first = this.raycaster.intersectObjects(objects, false)[0];
    return !first || first.distance >= distance - Math.max(0.025, this.cameraDist * 0.006);
  };

  P.findClosestVertex = /** @this {import('./SceneManager.js').SceneManager} */ function (ndcX, ndcY, threshold = 0.08) {
    let closest = null;
    let closestDist = threshold;
    for (const mesh of this.meshes) {
      if (!mesh.visible || mesh.locked) continue;
      const wm = this.getWorldMatrix(mesh);
      for (let i = 0; i < mesh.vertices.length; i++) {
        const v = mesh.vertices[i];
        const wp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        const sp = wp.clone().project(this.camera);
        if (sp.z < -1 || sp.z > 1) continue;
        const dist = Math.hypot(sp.x - ndcX, sp.y - ndcY);
        if (dist < closestDist && this.isWorldPointVisible(wp)) {
          closestDist = dist;
          closest = { meshId: mesh.id, index: i, id: v.id };
        }
      }
    }
    return closest;
  };

  P.findClosestEdge = /** @this {import('./SceneManager.js').SceneManager} */ function (ndcX, ndcY, threshold = 0.08) {
    let closest = null;
    let closestDist = threshold;
    for (const mesh of this.meshes) {
      if (!mesh.visible || mesh.locked) continue;
      const wm = this.getWorldMatrix(mesh);
      const edges = mesh.getEdges();
      for (let i = 0; i < edges.length; i++) {
        const va = mesh.getVertex(edges[i].v1);
        const vb = mesh.getVertex(edges[i].v2);
        let wa = new THREE.Vector3(va.x, va.y, va.z).applyMatrix4(wm);
        let wb = new THREE.Vector3(vb.x, vb.y, vb.z).applyMatrix4(wm);
        // Clip the edge to the part in front of the camera. Projecting a
        // point behind the camera flips it across the screen, so a zoomed-in
        // view picked edges of objects behind the camera (or the far end of
        // an edge passing beside it) as if they were under the finger.
        const near = (this.camera.near ?? 0.01) * 1.001;
        const za = -wa.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
        const zb = -wb.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
        if (za <= near && zb <= near) continue;
        if (za < near) wa = wa.clone().lerp(wb, (near - za) / (zb - za));
        else if (zb < near) wb = wb.clone().lerp(wa, (near - zb) / (za - zb));
        const sa = wa.clone().project(this.camera);
        const sb = wb.clone().project(this.camera);
        if (sa.z < -1 || sb.z < -1 || sa.z > 1 || sb.z > 1) continue;
        const px = ndcX, py = ndcY;
        const ax = sa.x, ay = sa.y, bx = sb.x, by = sb.y;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const closestX = ax + t * dx, closestY = ay + t * dy;
        const dist = Math.hypot(px - closestX, py - closestY);
        if (dist < closestDist && this.isWorldPointVisible(wa.clone().lerp(wb, t))) {
          closestDist = dist;
          closest = { meshId: mesh.id, index: i };
        }
      }
    }
    return closest;
  };

  // Returns true only if the tap actually landed on an already-selected element
  // and removed it. False means "nothing of mine was there" — the caller should
  // fall through to a normal select so tapping NEAR a selection still works.
  P.deselectAtPoint = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return false;
    const { x, y } = this.screenToNDC(clientX, clientY);
    const mode = this.selectionMode;
    let removeIdx = -1;
    if (mode === 'vertex') {
      const v = this.findClosestVertex(x, y, 0.05);
      if (v && v.meshId === sel.meshId) removeIdx = sel.indices.indexOf(v.index);
    } else if (mode === 'edge') {
      const ed = this.findClosestEdge(x, y, 0.05);
      if (ed && ed.meshId === sel.meshId) removeIdx = sel.indices.indexOf(ed.index);
    } else if (mode === 'face') {
      const hits = this.raycastMeshes(x, y);
      if (hits.length > 0) {
        const meshId = this.findMeshIdByObject(hits[0].object);
        if (meshId === sel.meshId) {
          const fIdx = mesh.getFaceIndexFromTriangle(hits[0].faceIndex);
          const group = mesh.getCoplanarFaceGroup(fIdx);
          if (group.length > 0 && group.every(g => sel.indices.includes(g))) {
            sel.indices = sel.indices.filter(g => !group.includes(g));
            this.updateHighlights();
            this.updateStats();
            this.updateHud();
            return true;
          }
        }
      }
    }
    if (removeIdx >= 0) {
      sel.indices.splice(removeIdx, 1);
      if (sel.indices.length === 0) this.clearSelection();
      else { this.updateHighlights(); this.updateStats(); this.updateHud(); }
      return true;
    }
    return false;
  };

  P.selectAtScreenPoint = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    const mode = this.selectionMode;
    // A live topology preview must be cancelled before a new edge is selected.
    // Re-run the edge hit after that callback because cancelling restores the
    // original mesh and therefore its original edge indices.
    if (mode === 'edge') {
      const pendingEdge = this.findClosestEdge(x, y);
      if (pendingEdge) this.cb.onBeforeSelectionTap?.({ meshId: pendingEdge.meshId, type: 'edge', indices: [pendingEdge.index] });
    }
    const before = this.captureSnapshot();
    let selected = false;

    if (mode === 'vertex') {
      const hit = this.findClosestVertex(x, y);
      if (hit) {
        const mesh = this.getMesh(hit.meshId);
        const vertexId = mesh?.vertices[hit.index]?.id;
        if (vertexId != null) {
          const previous = this.targetMergePair;
          this.targetMergePair = previous?.meshId === hit.meshId && previous.targetId !== vertexId
            ? { meshId: hit.meshId, sourceId: previous.targetId, targetId: vertexId }
            : { meshId: hit.meshId, sourceId: null, targetId: vertexId };
        }
        this.setSelection({ meshId: hit.meshId, type: 'vertex', indices: [hit.index] });
        selected = true;
      }
    } else if (mode === 'edge') {
      this.targetMergePair = null;
      const hit = this.findClosestEdge(x, y);
      if (hit) { this.setSelection({ meshId: hit.meshId, type: 'edge', indices: [hit.index] }); selected = true; }
    } else if (mode === 'face') {
      const hits = this.raycastMeshes(x, y);
      if (hits.length > 0) {
        const { meshId, faceIndex } = this.faceIndexFromHit(hits[0]);
        if (meshId) {
          const mesh = this.getMesh(meshId);
          const group = mesh ? mesh.getCoplanarFaceGroup(faceIndex) : [faceIndex];
          this.setSelection({ meshId, type: 'face', indices: group });
          selected = true;
        }
      }
    } else {
      const hits = this.raycastMeshes(x, y);
      if (hits.length > 0) {
        const meshId = this.findMeshIdByObject(hits[0].object);
        if (meshId) { this.setSelection({ meshId, type: 'object', indices: [] }); selected = true; }
      }
    }
    if (!selected) {
      // Clean tap on empty canvas acts as a back button: if a panel/tool/menu
      // consumed it, keep the current selection intact.
      const handled = this.cb.onEmptyTap?.();
      if (!handled) this.clearSelection();
    }
    if (this.selectionChanged(before)) this.pushUndoSnapshot(before);
    if (selected) this.cb.onSelectionTap?.({ ...this.selection, indices: [...this.selection.indices] });
    return selected;
  };

  // Paint-add selection (multi-select drag): add the element under the finger to
  // the current selection, respecting the active mode. Sub-object selection stays
  // on a single mesh; hitting a different mesh switches to it.
  P.selectAtPointAdd = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    const mode = this.selectionMode;
    if (mode === 'object') {
      const hits = this.raycastMeshes(x, y);
      if (hits.length === 0) return false;
      const id = this.findMeshIdByObject(hits[0].object);
      if (!id || this.selectedMeshIds.includes(id)) return false;
      this.selectedMeshIds.push(id);
      this.selection = { meshId: this.selectedMeshIds[0], type: 'object', indices: [] };
      this.updateHighlights();
      this.updateStats();
      return true;
    }
    let hit = null;
    if (mode === 'vertex') hit = this.findClosestVertex(x, y);
    else if (mode === 'edge') hit = this.findClosestEdge(x, y);
    else if (mode === 'face') {
      const hits = this.raycastMeshes(x, y);
      if (hits.length > 0) {
        const meshId = this.findMeshIdByObject(hits[0].object);
        const mesh = this.getMesh(meshId);
        const faceIndex = mesh ? mesh.getFaceIndexFromTriangle(hits[0].faceIndex) : hits[0].faceIndex;
        const group = mesh ? mesh.getCoplanarFaceGroup(faceIndex) : [faceIndex];
        hit = { meshId, index: faceIndex, group };
      }
    }
    if (!hit) return false;
    const sel = this.selection;
    if (sel.meshId !== hit.meshId) {
      this.selection = { meshId: hit.meshId, type: mode, indices: mode === 'face' ? (hit.group || [hit.index]) : [hit.index] };
      this.updateHighlights();
      this.updateStats();
      return true;
    }
    const idx = hit.index;
    if (mode === 'face') {
      const set = new Set(sel.indices);
      const group = hit.group || [idx];
      if (group.every(g => set.has(g))) return false;
      for (const g of group) set.add(g);
      sel.indices = Array.from(set);
    } else {
      if (sel.indices.includes(idx)) return false;
      sel.indices.push(idx);
    }
    this.updateHighlights();
    this.updateStats();
    return true;
  };

  P.findMeshIdByObject = /** @this {import('./SceneManager.js').SceneManager} */ function (obj) {
    for (const [id, data] of this.threeObjects) {
      if (data.mesh === obj) return id;
    }
    return null;
  };

  // Map a raycast hit's triangle index to a mesh face index. N-gon faces
  // (e.g. from Create-Face-by-Border) fan-triangulate into several buffer
  // triangles, so the hit's faceIndex doesn't equal the mesh face index.
  P.faceIndexFromHit = /** @this {import('./SceneManager.js').SceneManager} */ function (hit) {
    const meshId = this.findMeshIdByObject(hit.object);
    const mesh = this.getMesh(meshId);
    const faceIndex = mesh ? mesh.getFaceIndexFromTriangle(hit.faceIndex) : hit.faceIndex;
    return { meshId, faceIndex };
  };

  P.isPointOverSelection = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    if (this.isGroupMode()) {
      const hits = this.raycastMeshes(x, y);
      if (hits.length === 0) return false;
      return hits.some(h => this.selectedMeshIds.includes(this.findMeshIdByObject(h.object)));
    }
    const mode = this.selectionMode;
    const sel = this.selection;
    if (!sel.meshId) return false;

    if (mode === 'vertex') {
      // Grace/buffer zone for already-selected vertices: a drag started within
      // a larger screen radius of any selected vertex translates it, so the
      // tiny vertex point is easy to grab without landing on it exactly.
      const mesh = this.getMesh(sel.meshId);
      if (!mesh) return false;
      const wm = this.getWorldMatrix(mesh);
      const threshold = 0.16;
      for (const idx of sel.indices) {
        const v = mesh.vertices[idx];
        if (!v) continue;
        const wp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        const sp = wp.clone().project(this.camera);
        if (sp.z < -1 || sp.z > 1) continue;
        if (Math.hypot(sp.x - x, sp.y - y) < threshold) return true;
      }
      return false;
    } else if (mode === 'edge') {
      // Measure distance to the SELECTED edges directly. Matching "the nearest
      // edge overall" failed whenever an unselected neighbor was marginally
      // closer, which made grabbing a selected edge nearly impossible on a
      // dense mesh — the camera stole the drag instead.
      const mesh = this.getMesh(sel.meshId);
      if (!mesh) return false;
      const wm = this.getWorldMatrix(mesh);
      const edges = mesh.getEdges();
      const threshold = 0.14;
      for (const idx of sel.indices) {
        const e = edges[idx];
        if (!e) continue;
        const a = mesh.getVertex(e.v1), b = mesh.getVertex(e.v2);
        if (!a || !b) continue;
        const sa = new THREE.Vector3(a.x, a.y, a.z).applyMatrix4(wm).project(this.camera);
        const sb = new THREE.Vector3(b.x, b.y, b.z).applyMatrix4(wm).project(this.camera);
        if (sa.z < -1 || sa.z > 1 || sb.z < -1 || sb.z > 1) continue;
        const dx = sb.x - sa.x, dy = sb.y - sa.y;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((x - sa.x) * dx + (y - sa.y) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        if (Math.hypot(x - (sa.x + t * dx), y - (sa.y + t * dy)) < threshold) return true;
      }
      return false;
    } else if (mode === 'face') {
      const hits = this.raycastMeshes(x, y);
      if (hits.length === 0) return false;
      const mesh = this.getMesh(sel.meshId);
      for (const h of hits) {
        if (this.findMeshIdByObject(h.object) !== sel.meshId) continue;
        const fIdx = mesh ? mesh.getFaceIndexFromTriangle(h.faceIndex) : h.faceIndex;
        if (sel.indices.includes(fIdx)) return true;
      }
      // Selected faces get a generous center grab zone so a mobile drag does
      // not require landing precisely inside a small or steeply viewed polygon.
      if (mesh) {
        const wm = this.getWorldMatrix(mesh);
        for (const index of sel.indices) {
          const center = mesh.getFaceCenter(index).applyMatrix4(wm).project(this.camera);
          if (center.z >= -1 && center.z <= 1 && Math.hypot(center.x - x, center.y - y) < 0.22) return true;
        }
      }
      return false;
    } else {
      // Object mode: a gesture over the selected object takes priority over
      // camera even when another object is in front — check ALL hits, not just
      // the frontmost, so an obstructed selected object still moves.
      const hits = this.raycastMeshes(x, y);
      if (hits.length === 0) return false;
      return hits.some(h => this.findMeshIdByObject(h.object) === sel.meshId);
    }
  };

  // "Close to selection" buffer: a drag started within this screen-space
  // distance of any selected element's projected geometry prioritizes the
  // selection (translate) over camera orbit, so a gesture near a thin edge or
  // face boundary still grabs the selection instead of orbiting.
  P.isPointNearSelection = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY, buffer = 0.12) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    // Segments of the selection's OWN outline (not a bounding box — a box let a
    // gesture in empty space beside the object still grab and move it).
    const collectSegs = (mesh, indices, type) => {
      const wm = this.getWorldMatrix(mesh);
      const segs = [];
      const wp = (v) => new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
      if (type === 'vertex') {
        for (const i of indices) { const v = mesh.vertices[i]; if (v) { const p = wp(v); segs.push([p, p]); } }
      } else if (type === 'edge') {
        const edges = mesh.getEdges();
        for (const idx of indices) {
          const e = edges[idx]; if (!e) continue;
          const a = mesh.getVertex(e.v1), b = mesh.getVertex(e.v2);
          if (a && b) segs.push([wp(a), wp(b)]);
        }
      } else if (type === 'face') {
        for (const idx of indices) {
          const fc = mesh.faces[idx]; if (!fc) continue;
          for (let i = 0; i < fc.length; i++) {
            const a = mesh.getVertex(fc[i]), b = mesh.getVertex(fc[(i + 1) % fc.length]);
            if (a && b) segs.push([wp(a), wp(b)]);
          }
        }
      } else {
        for (const e of mesh.getEdges()) {
          const a = mesh.getVertex(e.v1), b = mesh.getVertex(e.v2);
          if (a && b) segs.push([wp(a), wp(b)]);
        }
      }
      return segs;
    };
    let segs = [];
    if (this.isGroupMode()) {
      for (const id of this.selectedMeshIds) { const m = this.getMesh(id); if (m) segs = segs.concat(collectSegs(m, [], 'object')); }
    } else {
      const sel = this.selection;
      if (!sel.meshId) return false;
      const mesh = this.getMesh(sel.meshId);
      if (!mesh) return false;
      segs = collectSegs(mesh, sel.indices, sel.type);
    }
    // A gesture within `buffer` (screen space) of the selection's own geometry
    // prioritizes the selection over orbit; anything farther runs the camera.
    for (const [wa, wb] of segs) {
      const sa = wa.clone().project(this.camera);
      const sb = wb.clone().project(this.camera);
      if (sa.z < -1 || sa.z > 1 || sb.z < -1 || sb.z > 1) continue;
      const dx = sb.x - sa.x, dy = sb.y - sa.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((x - sa.x) * dx + (y - sa.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(x - (sa.x + t * dx), y - (sa.y + t * dy)) <= buffer) return true;
    }
    return false;
  };

  P.selectInMarquee = /** @this {import('./SceneManager.js').SceneManager} */ function (screenRect) {
    const mode = this.selectionMode;
    const { x: x0, y: y0, w, h } = screenRect;
    const x1 = x0 + w, y1 = y0 + h;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);

    if (mode === 'object') {
      const matched = [];
      for (const mesh of this.meshes) {
        if (!mesh.visible || mesh.locked) continue;
        const wm = this.getWorldMatrix(mesh);
        const center = new THREE.Vector3();
        for (const v of mesh.vertices) center.add(new THREE.Vector3(v.x, v.y, v.z));
        center.divideScalar(mesh.vertices.length).applyMatrix4(wm);
        const sp = center.project(this.camera);
        if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) matched.push(mesh.id);
      }
      if (matched.length > 0) {
        this.selectedMeshIds = matched;
        this.selection = { meshId: matched[0], type: 'object', indices: [] };
        this.updateHighlights();
        this.updateStats();
      }
      return;
    }

    for (const mesh of this.meshes) {
      if (!mesh.visible || mesh.locked) continue;
      const wm = this.getWorldMatrix(mesh);
      const matched = [];
      if (mode === 'vertex') {
        for (let i = 0; i < mesh.vertices.length; i++) {
          const wp = new THREE.Vector3(mesh.vertices[i].x, mesh.vertices[i].y, mesh.vertices[i].z).applyMatrix4(wm);
          const sp = wp.clone().project(this.camera);
          if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) matched.push(i);
        }
      } else if (mode === 'edge') {
        const edges = mesh.getEdges();
        for (let i = 0; i < edges.length; i++) {
          const wp = mesh.getEdgeCenter(i).applyMatrix4(wm);
          const sp = wp.clone().project(this.camera);
          if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) matched.push(i);
        }
      } else if (mode === 'face') {
        for (let i = 0; i < mesh.faces.length; i++) {
          const wp = mesh.getFaceCenter(i).applyMatrix4(wm);
          const sp = wp.clone().project(this.camera);
          if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) matched.push(i);
        }
        const expanded = new Set();
        for (const idx of matched) {
          for (const g of mesh.getCoplanarFaceGroup(idx)) expanded.add(g);
        }
        matched.length = 0;
        for (const g of expanded) matched.push(g);
      }
      if (matched.length > 0) {
        if (this.multiSelect && this.selection.meshId === mesh.id && this.selection.type === mode) {
          const set = new Set(this.selection.indices);
          for (const m of matched) set.add(m);
          this.setSelection({ meshId: mesh.id, type: mode, indices: Array.from(set) });
        } else {
          this.setSelection({ meshId: mesh.id, type: mode, indices: matched });
        }
        return;
      }
    }
    if (!this.multiSelect) this.clearSelection();
  };
}