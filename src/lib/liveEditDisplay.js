// While a gesture moves, scales or rotates part of a mesh, only the positions
// of its vertices change: the faces, the displayed edges and the selection
// stay exactly the same. Working the wireframe and the face highlight out
// again and building new line and fill geometry (with new shaders) on every
// frame made those transforms lag on small meshes. These keep what is drawn
// and only move it to the vertices' new positions.
import { moveFatSegmentPositions } from './fatLines';

// Where each id's vertex sits in the mesh's vertex list.
function vertexSlots(mesh, ids) {
  const index = new Map();
  mesh.vertices.forEach((v, i) => index.set(v.id, i));
  const slots = new Int32Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const s = index.get(ids[i]);
    if (s === undefined) return null;
    slots[i] = s;
  }
  return slots;
}

function slotsCurrent(mesh, ids, slots) {
  const verts = mesh.vertices;
  for (let i = 0; i < ids.length; i++) if (verts[slots[i]]?.id !== ids[i]) return false;
  return true;
}

// Everything the displayed edges and the highlighted surface depend on,
// besides positions.
function edgeState(mesh) {
  return [mesh.faces.length, mesh.vertices.length, mesh.hiddenEdges.length,
    mesh.visibleEdges.length, mesh.explicitEdges.length].join(',');
}

function writePositions(out, mesh, slots, matrix) {
  const verts = mesh.vertices;
  if (!matrix) {
    for (let i = 0; i < slots.length; i++) {
      const v = verts[slots[i]];
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    return;
  }
  // Same arithmetic as Vector3.applyMatrix4.
  const e = matrix.elements;
  for (let i = 0; i < slots.length; i++) {
    const v = verts[slots[i]];
    const x = v.x, y = v.y, z = v.z;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    out[i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    out[i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    out[i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  }
}

// --- Wireframe -------------------------------------------------------------

// Remember which vertices the wireframe's segments join, for the geometry the
// mesh is drawn with now.
export function rememberLiveWireframe(obj, mesh, ids) {
  const slots = vertexSlots(mesh, ids);
  obj.liveWire = slots ? {
    layout: obj.mesh.geometry.userData.axisLiveLayout,
    state: edgeState(mesh),
    paint: mesh.paintWireEdges,
    ids, slots,
    positions: new Float32Array(ids.length * 3),
  } : null;
}

// Move the wireframe's segments to the vertices' new positions. False when
// anything besides positions changed; then it has to be built again.
export function moveLiveWireframe(obj, mesh) {
  const live = obj.liveWire;
  const layout = obj.mesh.geometry.userData.axisLiveLayout;
  if (!live || !layout || live.layout !== layout || live.paint !== mesh.paintWireEdges ||
      live.state !== edgeState(mesh) || !slotsCurrent(mesh, live.ids, live.slots)) return false;
  writePositions(live.positions, mesh, live.slots, null);
  return moveFatSegmentPositions(obj.wireframe, live.positions);
}

// --- Selection highlight -------------------------------------------------

// Remember which vertex every point of the face, edge or vertex highlight
// belongs to. `parts` are the drawn objects: { object, ids, kind } where kind
// is 'fill' (a mesh's position attribute), 'lines' (fat segments) or 'dots'
// (vertex dots); 'localLines' are fat segments in the object's own space.
export function rememberLiveHighlight(manager, mesh, parts) {
  const remembered = [];
  for (const part of parts) {
    if (!part.object) continue;
    const slots = vertexSlots(mesh, part.ids);
    if (!slots) { manager._liveHighlight = null; return; }
    remembered.push({
      ...part, slots,
      scratch: part.kind === 'lines' || part.kind === 'localLines' ? new Float32Array(part.ids.length * 3) : null,
    });
  }
  const sel = manager.selection;
  manager._liveHighlight = {
    selection: sel,
    type: sel.type,
    indices: sel.indices,
    count: sel.indices.length,
    meshId: mesh.id,
    state: edgeState(mesh),
    parts: remembered,
  };
}

// Move the highlight with the vertices. False when the selection or anything
// besides positions changed; then it is built again.
export function moveLiveHighlight(manager) {
  const live = manager._liveHighlight;
  const sel = manager.selection;
  if (!live || sel !== live.selection || sel.type !== live.type || sel.indices !== live.indices ||
      sel.indices.length !== live.count || sel.meshId !== live.meshId) return false;
  const mesh = manager.getMesh(sel.meshId);
  if (!mesh || live.state !== edgeState(mesh)) return false;
  const group = manager.highlightGroup;
  for (const part of live.parts) {
    if (part.object.parent !== group || !slotsCurrent(mesh, part.ids, part.slots)) return false;
  }
  const wm = manager.getWorldMatrix(mesh);
  for (const part of live.parts) {
    if (part.kind === 'fill') {
      const attr = part.object.geometry.getAttribute('position');
      writePositions(attr.array, mesh, part.slots, wm);
      attr.needsUpdate = true;
      part.object.geometry.computeBoundingSphere();
    } else if (part.kind === 'lines' || part.kind === 'localLines') {
      // Object outlines are drawn in the object's own space.
      writePositions(part.scratch, mesh, part.slots, part.kind === 'lines' ? wm : null);
      if (!moveFatSegmentPositions(part.object, part.scratch)) return false;
      if (part.kind === 'localLines') {
        part.object.position.copy(mesh.position);
        part.object.rotation.copy(mesh.rotation);
        part.object.scale.copy(mesh.scale);
      }
    } else if (part.kind === 'dots') {
      writePositions(part.object.userData.axisDotCenters, mesh, part.slots, wm);
      part.object.userData.axisDotsMoved = true;
    }
  }
  return true;
}
