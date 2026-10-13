import * as THREE from 'three';

// Standalone measurement computation operating on a SceneManager instance,
// kept here so the (large) SceneManager stays untouched. Returns screen-space
// labels in scene (world) units for the current selection.
// option: 'edge' (per-edge lengths) | 'bbox' (W×H×D) | 'both'.
// object mode -> the few forward-most edges / object bbox;
// face mode   -> edges of selected faces / their bbox;
// edge mode   -> selected edges / their endpoints' bbox.
export function getMeasurements(manager, option = 'edge') {
  const out = [];
  const sel = manager.selection;
  if (!sel.meshId) return out;
  const mesh = manager.getMesh(sel.meshId);
  if (!mesh) return out;
  const mode = manager.selectionMode;
  const wm = manager.getWorldMatrix(mesh);
  const rect = manager.renderer.domElement.getBoundingClientRect();
  const project = (worldPoint) => {
    const ndc = worldPoint.clone().project(manager.camera);
    if (ndc.z < -1 || ndc.z > 1) return null;
    return {
      x: ((ndc.x + 1) / 2) * rect.width + rect.left,
      y: ((-ndc.y + 1) / 2) * rect.height + rect.top,
    };
  };
  const addEdge = (va, vb) => {
    const wa = new THREE.Vector3(va.x, va.y, va.z).applyMatrix4(wm);
    const wb = new THREE.Vector3(vb.x, vb.y, vb.z).applyMatrix4(wm);
    const mid = wa.clone().lerp(wb, 0.5);
    // Hide labels for edges that are occluded (not visible from the camera).
    if (manager.isWorldPointVisible && !manager.isWorldPointVisible(mid)) return;
    const screen = project(mid);
    if (!screen) return;
    out.push({ x: screen.x, y: screen.y, length: wa.distanceTo(wb) });
  };

  const wantEdge = option === 'edge' || option === 'both';
  const wantBbox = option === 'bbox' || option === 'both';
  const edges = mesh.getEdges();

  // A selected face displays the lengths of the edges forming its boundary.
  // Count each perimeter edge once, including when several adjacent faces
  // are selected. The labels update continuously as the face changes shape.
  if (wantEdge && mode === 'face' && sel.indices.length) {
    const selectedFaces = new Set(sel.indices);
    const edgeCounts = new Map();
    for (const fi of selectedFaces) {
      const face = mesh.faces[fi];
      if (!face) continue;
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const key = [a, b].sort((x, y) => x - y).join(',');
        const entry = edgeCounts.get(key) || { a, b, count: 0 };
        entry.count++;
        edgeCounts.set(key, entry);
      }
    }
    for (const { a, b, count } of edgeCounts.values()) {
      if (count !== 1) continue;
      const va = mesh.getVertex(a), vb = mesh.getVertex(b);
      if (va && vb) addEdge(va, vb);
    }
  }

  // While stretching a face, also show connecting-edge lengths, where one
  // endpoint belongs to the face and the other to surrounding geometry.
  if (wantEdge && mode === 'face' && sel.indices.length &&
      (manager.activeAction === 'move' || manager.activeAction === 'scale')) {
    const faceVertices = new Set();
    for (const fi of sel.indices) {
      for (const gi of mesh.getCoplanarFaceGroup(fi)) {
        for (const vid of mesh.faces[gi] || []) faceVertices.add(vid);
      }
    }
    const seen = new Set();
    for (const edge of edges) {
      if (faceVertices.has(edge.v1) === faceVertices.has(edge.v2)) continue;
      const key = [edge.v1, edge.v2].sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const va = mesh.getVertex(edge.v1), vb = mesh.getVertex(edge.v2);
      if (va && vb) addEdge(va, vb);
    }
  }

  // Show an individual length for every selected edge, including multi-select.
  // Deduplicate indices so the same edge never receives overlapping labels.
  if (wantEdge && mode === 'edge' && sel.indices.length > 0) {
    for (const index of new Set(sel.indices)) {
      const e = edges[index];
      if (!e) continue;
      const va = mesh.getVertex(e.v1), vb = mesh.getVertex(e.v2);
      if (va && vb) addEdge(va, vb);
    }
  } else if (wantEdge && mode === 'object') {
    // In object mode only the few forward-most edges — closest to the camera,
    // and not occluded — carry labels, never every edge of the object.
    const drawEdges = (mesh.visibleEdges && mesh.visibleEdges.length) ? mesh.visibleEdges : edges;
    const candidates = [];
    for (const e of drawEdges) {
      const va = mesh.getVertex(e.v1), vb = mesh.getVertex(e.v2);
      if (!va || !vb) continue;
      const wa = new THREE.Vector3(va.x, va.y, va.z).applyMatrix4(wm);
      const wb = new THREE.Vector3(vb.x, vb.y, vb.z).applyMatrix4(wm);
      candidates.push({ va, vb, dist: manager.camera.position.distanceTo(wa.clone().lerp(wb, 0.5)) });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates.slice(0, 3)) addEdge(c.va, c.vb);
  }

  if (wantBbox) {
    const ids = new Set();
    if (mode === 'object' || mode === 'face') {
      for (const v of mesh.vertices) ids.add(v.id);
    } else if (mode === 'edge') {
      for (const ei of sel.indices) {
        const e = edges[ei];
        if (e) { ids.add(e.v1); ids.add(e.v2); }
      }
    }
    const pts = [];
    for (const vid of ids) {
      const v = mesh.getVertex(vid);
      if (v) pts.push(new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm));
    }
    if (pts.length > 0) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const p of pts) { min.min(p); max.max(p); }
      const center = min.clone().lerp(max, 0.5);
      const screen = project(center);
      if (screen) {
        const dims = [
          { prefix: 'W', length: max.x - min.x },
          { prefix: 'H', length: max.y - min.y },
          { prefix: 'D', length: max.z - min.z },
        ];
        dims.forEach((d, i) => out.push({ x: screen.x, y: screen.y + (i - 1) * 14, length: d.length, prefix: d.prefix }));
      }
    }
  }

  return out;
}