import * as THREE from 'three';
import { createPaintLayer, paintDab, beginPaintStroke, finishPaintStroke } from './paintLayer';
import fillEdges from '@/lib/fillEdges';

const blend = (current, target, opacity) => {
  const a = new THREE.Color(current), b = new THREE.Color(target);
  a.lerp(b, Math.max(0, Math.min(1, opacity)));
  return `#${a.getHexString()}`;
};
const refresh = (sm, mesh) => { sm.rebuildThreeMesh(mesh.id); sm.updateObjectMaterial(mesh.id); };

export function fillSelection(sm, color, opacity = 1, recordUndo = true) {
  const sel = sm.selection, mesh = sm.getMesh(sel.meshId);
  if (!mesh) return false;
  if (recordUndo) sm.pushUndo();
  if (sel.type === 'edge') {
    const target = paintTarget(sm, mesh);
    if (!target.edges?.length) return false;
    const layer = ensurePaintLayer(sm, mesh);
    const snapshot = recordUndo ? sm.undoStack[sm.undoStack.length - 1] : sm._paintPreviewSnapshot;
    return fillEdges(sm, mesh, layer, target, color, opacity, snapshot);
  }
  if (sel.type === 'object') {
    // Fills every object of a multi-select group, or just the selected one.
    for (const id of sm.targetMeshIds()) {
      const m = sm.getMesh(id);
      if (!m) continue;
      m.color = new THREE.Color(blend(m.color, color, opacity)).getHex();
      m.vertexColors = {}; m.faceColors = {};
      refresh(sm, m);
    }
    return true;
  } else if (sel.type === 'face') {
    for (const fi of sel.indices) mesh.faceColors[fi] = blend(mesh.faceColors[fi] || mesh.color, color, opacity);
  } else {
    const vids = sel.type === 'vertex'
      ? sel.indices.map(i => mesh.vertices[i]?.id).filter(Boolean)
      : sel.indices.flatMap(i => mesh.getEdgeVertexIds(i));
    for (const vid of new Set(vids)) mesh.vertexColors[vid] = blend(mesh.vertexColors[vid] || mesh.color, color, opacity);
  }
  refresh(sm, mesh);
  return true;
}

// Brush and spray paint into the object's surface paint layer (see
// paintLayer.js). The layer is created on the first stroke; creating it adds
// the atlas UVs to the geometry and the layer to the material shader.
function ensurePaintLayer(sm, mesh) {
  if (mesh.paintLayer) return mesh.paintLayer;
  mesh.paintLayer = createPaintLayer(mesh);
  sm.rebuildThreeMesh(mesh.id);
  sm.updateObjectMaterial(mesh.id);
  return mesh.paintLayer;
}

// null = every face may be painted; an empty Set = this mesh is not a target.
function paintTarget(sm, mesh) {
  const sel = sm.selection;
  if (sel.type === 'object') {
    const selectedIds = sm.isGroupMode() ? sm.selectedMeshIds : [sel.meshId];
    return { faces: selectedIds.includes(mesh.id) ? null : new Set(), edges: null };
  }
  if (sel.meshId !== mesh.id) return { faces: new Set(), edges: null };
  if (sel.type === 'face') return { faces: new Set(sel.indices), edges: null };
  if (sel.type === 'edge') {
    const allEdges = mesh.getEdges();
    const edges = sel.indices.map((i) => allEdges[i]).filter(Boolean).map((e) => ({ a: mesh.getVertex(e.v1), b: mesh.getVertex(e.v2) }));
    const edgeFaces = mesh._ensureEdgeFaceMap();
    const directlyAdjacent = new Set();
    for (const { a, b } of edges) {
      const key = a.id < b.id ? `${a.id},${b.id}` : `${b.id},${a.id}`;
      for (const fi of edgeFaces.get(key)?.faces || []) directlyAdjacent.add(fi);
    }
    // A modeled quad is stored as two triangles. Include the full coplanar face
    // group on both sides of the selected edge so paint never stops at the
    // invisible triangulation diagonal and creates a triangular artifact.
    const faces = new Set();
    for (const fi of directlyAdjacent) {
      for (const groupFace of mesh.getCoplanarFaceGroup(fi)) faces.add(groupFace);
    }
    return { faces, edges };
  }
  return { faces: new Set(), edges: null };
}

export function paintAt(sm, clientX, clientY) {
  const tool = sm.paintTool;
  if (!tool || tool.tool === 'fill') return;
  const selectionType = sm.selection.type;
  if (selectionType === 'vertex') return;
  const ndc = sm.screenToNDC(clientX, clientY);
  let hit = sm.raycastMeshes(ndc.x, ndc.y)[0];
  // A ray exactly on a selected edge can miss both neighboring triangles due
  // to floating-point boundary rules. Probe a tiny ring around the finger so
  // the edge stroke remains continuous without changing the camera.
  if (!hit && sm.selection.type === 'edge') {
    for (const [ox, oy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const nearby = sm.screenToNDC(clientX + ox, clientY + oy);
      hit = sm.raycastMeshes(nearby.x, nearby.y)[0];
      if (hit) break;
    }
  }
  if (!hit) return;
  const mesh = sm.getMesh(sm.findMeshIdByObject(hit.object));
  if (!mesh) return;
  const target = paintTarget(sm, mesh);
  if (target.faces && target.faces.size === 0) return;

  // Brush size is a fraction of the object's apparent size; it is fixed for
  // the whole stroke (the camera cannot move while one finger paints).
  const stroke = sm._paintStroke || (sm._paintStroke = beginPaintStroke(sm.paintSizeToScreenPixels(tool.size)));
  const layer = ensurePaintLayer(sm, mesh);

  // Screen radius → world radius at the touched depth → local radius.
  const wm = sm.getWorldMatrix(mesh);
  const center = hit.point.clone().applyMatrix4(wm.clone().invert());
  const dist = sm.camera.position.distanceTo(hit.point);
  const fov = sm.camera.fov * Math.PI / 180;
  const vh = sm.renderer.domElement.clientHeight || window.innerHeight;
  const worldPerPixel = (2 * dist * Math.tan(fov / 2)) / Math.max(1, vh);
  const s = new THREE.Vector3().setFromMatrixScale(wm);
  const radius = (stroke.screenRadius * worldPerPixel) / Math.max(1e-6, (s.x + s.y + s.z) / 3);
  const normal = hit.face?.normal
    ? hit.face.normal.clone().normalize()
    : mesh.getFaceNormal(mesh.getFaceIndexFromTriangle(hit.faceIndex ?? 0));

  const spray = tool.tool === 'spray';
  const softness = Math.max(0, Math.min(1, (tool.smoothness ?? 0) / 100));
  paintDab(layer, mesh, {
    meshId: mesh.id,
    stroke,
    center,
    normal,
    radius,
    color: new THREE.Color(tool.color).getHex(),
    // Spray: each dab is lighter than the brush so a stroke builds up, but dense
    // enough that repeated passes reach a fully dark coat. Hardness runs over
    // the whole slider: a spray is never a hard disc, so it maps 0–100 onto
    // half-soft → fully soft.
    opacity: ((tool.opacity ?? 100) / 100) * (spray ? 0.45 : 1),
    softness: spray ? 0.5 + 0.5 * softness : softness,
    faces: target.faces,
    influenceEdges: target.edges,
  });
}

// Finger/mouse lifted: the pixels the stroke overwrote become part of the undo
// step that was pushed when the stroke began.
export function endPaintStroke(sm) {
  const stroke = sm._paintStroke;
  if (!stroke) return;
  sm._paintStroke = null;
  const patches = finishPaintStroke(stroke);
  if (!patches.length) return;
  // While paint is pending the stroke waits for Apply rather than becoming an
  // undo step of its own.
  if (sm._paintPending) {
    sm._paintPending.strokes.push(patches);
    sm._notifyPaintPending?.();
    return;
  }
  const top = sm.undoStack[sm.undoStack.length - 1];
  if (top) top.paintPatches = (top.paintPatches || []).concat(patches);
}