import { edgeKey } from './meshTopology';
// Convert the current selection to a different element mode by selecting every
// target element that "contacts" the current selection:
//   vertex → edge : edges incident to the vertex
//   edge  → face : faces sharing the edge's two vertices
//   face  → vertex: every vertex of the (quad) face
//   …and the symmetric cases. See user examples in the request.

export function applySceneConvert(SceneManagerClass) {
  SceneManagerClass.prototype.convertSelection = function (target) {
    const sel = this.selection;
    if (!sel.meshId || !target) return;
    // face → face is meaningful (it grows the selection to surrounding faces),
    // so allow it through; other same-type conversions are no-ops.
    if (target === sel.type && target === 'object') return;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    this.pushUndo();

    const mode = sel.type;
    const srcVerts = new Set();
    const srcFaces = new Set();

    if (mode === 'object') {
      mesh.vertices.forEach(v => srcVerts.add(v.id));
      mesh.faces.forEach((_, i) => srcFaces.add(i));
    } else if (mode === 'vertex') {
      for (const i of sel.indices) { const v = mesh.vertices[i]; if (v) srcVerts.add(v.id); }
    } else if (mode === 'edge') {
      const edges = mesh.getEdges();
      for (const i of sel.indices) { const e = edges[i]; if (e) { srcVerts.add(e.v1); srcVerts.add(e.v2); } }
      for (let fi = 0; fi < mesh.faces.length; fi++) {
        const f = mesh.faces[fi];
        for (const i of sel.indices) { const e = edges[i]; if (e && f.includes(e.v1) && f.includes(e.v2)) { srcFaces.add(fi); break; } }
      }
      // A visible face (e.g. a quad) is stored as several triangles; take the
      // whole face, not just the triangle that happens to contain the edge.
      for (const fi of [...srcFaces]) for (const g of mesh.getCoplanarFaceGroup(fi)) srcFaces.add(g);
    } else if (mode === 'face') {
      for (const fi of sel.indices) {
        const grp = mesh.getCoplanarFaceGroup(fi);
        for (const g of grp) { srcFaces.add(g); for (const v of mesh.faces[g]) srcVerts.add(v); }
      }
    }

    let newIndices = [];
    if (target === 'object') {
      // Keep the manager's own selectionMode in sync with the new target; the
      // React callback skips re-setting the manager (to avoid a loop), so without
      // this the manager keeps the OLD mode and the next tap selects the wrong
      // element type (e.g. a face highlighted while the toolbar shows Object).
      // Mode switches FIRST: object selections are rejected outside object mode.
      this.selectionMode = 'object';
      this.cb.onSelectionModeChange?.('object');
      this.setSelection({ meshId: sel.meshId, type: 'object', indices: [] });
      return;
    }
    if (target === 'vertex') {
      const grown = new Set(srcVerts);
      if (mode === 'vertex') {
        // Same-type: grow to every vertex touching a selected vertex (edge-adjacent).
        for (const e of mesh.getEdges()) {
          if (srcVerts.has(e.v1)) grown.add(e.v2);
          if (srcVerts.has(e.v2)) grown.add(e.v1);
        }
      }
      newIndices = [...grown].map(vid => mesh.vertices.findIndex(v => v.id === vid)).filter(i => i >= 0);
    } else if (target === 'edge') {
      const edges = mesh.getEdges();
      const incident = (mode === 'vertex' || mode === 'edge');
      edges.forEach((e, i) => {
        const oneIn = srcVerts.has(e.v1) || srcVerts.has(e.v2);
        const bothIn = srcVerts.has(e.v1) && srcVerts.has(e.v2);
        if (incident ? oneIn : bothIn) newIndices.push(i);
      });
    } else if (target === 'face') {
      if (mode === 'vertex') {
        const touched = new Set();
        for (let fi = 0; fi < mesh.faces.length; fi++) {
          if (mesh.faces[fi].some(v => srcVerts.has(v))) for (const g of mesh.getCoplanarFaceGroup(fi)) touched.add(g);
        }
        newIndices = [...touched];
      } else if (mode === 'face') {
        // Converting face → face selects the SURROUNDING (edge-adjacent) faces,
        // each expanded to its coplanar group so a quad counts as one face.
        const selFaceSet = new Set(srcFaces);
        const ek = edgeKey;
        const edgeToFaces = new Map();
        for (let fi = 0; fi < mesh.faces.length; fi++) {
          const fc = mesh.faces[fi];
          for (let j = 0; j < fc.length; j++) {
            const k = ek(fc[j], fc[(j + 1) % fc.length]);
            if (!edgeToFaces.has(k)) edgeToFaces.set(k, []);
            edgeToFaces.get(k).push(fi);
          }
        }
        const neighborSet = new Set();
        for (const fi of srcFaces) {
          const fc = mesh.faces[fi];
          for (let j = 0; j < fc.length; j++) {
            const adj = edgeToFaces.get(ek(fc[j], fc[(j + 1) % fc.length])) || [];
            for (const n of adj) if (n !== fi && !selFaceSet.has(n)) neighborSet.add(n);
          }
        }
        const expanded = new Set();
        for (const n of neighborSet) for (const g of mesh.getCoplanarFaceGroup(n)) expanded.add(g);
        // Keep the originally selected faces (grown to their coplanar groups)
        // so conversion never deselects what was already selected.
        for (const fi of srcFaces) for (const g of mesh.getCoplanarFaceGroup(fi)) expanded.add(g);
        newIndices = [...expanded];
      } else {
        newIndices = [...srcFaces];
      }
    }

    // Switch modes before applying the converted selection. setSelection
    // validates the requested type against the current manager mode.
    this.selectionMode = target;
    this.cb.onSelectionModeChange?.(target);
    this.setSelection({ meshId: sel.meshId, type: target, indices: newIndices });
  };
}