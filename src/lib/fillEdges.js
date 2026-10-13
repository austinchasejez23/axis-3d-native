import * as THREE from 'three';
import { paintDab, beginPaintStroke, finishPaintStroke } from '@/lib/paintLayer';
import { edgeKey } from './meshTopology';

// Fill uses distance to each edge on the surface, never vertex interpolation.
export default function fillEdges(sm, mesh, layer, target, color, opacity, snapshot) {
  const edgeFaces = mesh._ensureEdgeFaceMap();

  const pointSegmentDistance = (p, a, b) => {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 > 1e-12
      ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2))
      : 0;
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
  };

  const influences = target.edges.map(({ a, b }) => {
    const faces = new Set();
    for (const fi of edgeFaces.get(edgeKey(a.id, b.id))?.faces || []) {
      for (const grouped of mesh.getCoplanarFaceGroup(fi)) faces.add(grouped);
    }
    let radius = 0;
    for (const fi of faces) {
      for (const id of mesh.faces[fi]) radius = Math.max(radius, pointSegmentDistance(mesh.getVertex(id), a, b));
    }
    return { a, b, faces, radius: Math.max(radius, 1e-6) };
  });

  const bounds = new THREE.Box3();
  for (const v of mesh.vertices) bounds.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
  const stroke = beginPaintStroke(0);
  const changed = paintDab(layer, mesh, {
    meshId: mesh.id, stroke, center: bounds.getCenter(new THREE.Vector3()),
    normal: new THREE.Vector3(), radius: Math.max(bounds.getSize(new THREE.Vector3()).length(), 1e-6),
    color: new THREE.Color(color).getHex(), opacity: Math.max(0, Math.min(1, opacity)),
    softness: 0, faces: target.faces, influenceEdges: influences,
  });
  if (snapshot) snapshot.paintPatches = finishPaintStroke(stroke);
  return changed;
}