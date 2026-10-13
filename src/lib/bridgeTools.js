import * as THREE from 'three';

const vertexPosition = (mesh, id) => {
  const vertex = mesh.getVertex(id);
  return new THREE.Vector3(vertex.x, vertex.y, vertex.z);
};

const orientOutward = (mesh, ids) => {
  const points = ids.map((id) => vertexPosition(mesh, id));
  const normal = new THREE.Vector3().subVectors(points[1], points[0])
    .cross(new THREE.Vector3().subVectors(points[2], points[0]));
  const faceCenter = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const meshCenter = mesh.vertices.reduce(
    (sum, vertex) => sum.add(new THREE.Vector3(vertex.x, vertex.y, vertex.z)),
    new THREE.Vector3(),
  ).divideScalar(mesh.vertices.length || 1);
  return normal.dot(faceCenter.sub(meshCenter)) >= 0 ? ids : [...ids].reverse();
};

const orderBoundary = (edges) => {
  if (!edges.length) return [];
  const loop = [edges[0].v1, edges[0].v2];
  const unused = edges.slice(1);
  while (unused.length) {
    const last = loop[loop.length - 1];
    const index = unused.findIndex((edge) => edge.v1 === last || edge.v2 === last);
    if (index < 0) return [];
    const edge = unused.splice(index, 1)[0];
    const next = edge.v1 === last ? edge.v2 : edge.v1;
    if (next === loop[0]) break;
    loop.push(next);
  }
  return loop;
};

export const getFaceBridgeGroups = (mesh, indices) => {
  if (!mesh) return [];
  const remaining = new Set(indices);
  const groups = [];
  while (remaining.size) {
    const seed = remaining.values().next().value;
    const faceIndices = mesh.getCoplanarFaceGroup(seed).filter((index) => remaining.has(index));
    faceIndices.forEach((index) => remaining.delete(index));
    const edgeCounts = new Map();
    for (const index of faceIndices) {
      const face = mesh.faces[index];
      for (let i = 0; i < face.length; i++) {
        const v1 = face[i], v2 = face[(i + 1) % face.length];
        const key = v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
        const entry = edgeCounts.get(key) || { v1, v2, count: 0 };
        entry.count += 1;
        edgeCounts.set(key, entry);
      }
    }
    const loop = orderBoundary([...edgeCounts.values()].filter((edge) => edge.count === 1));
    groups.push({ indices: faceIndices, loop, normal: mesh.getFaceNormal(seed) });
  }
  return groups;
};

const alignFaceVertices = (mesh, first, second) => {
  let best = null;
  for (const direction of [1, -1]) {
    for (let offset = 0; offset < second.length; offset++) {
      const aligned = first.map((_, index) => second[(offset + direction * index + second.length) % second.length]);
      const distance = first.reduce(
        (sum, id, index) => sum + vertexPosition(mesh, id).distanceToSquared(vertexPosition(mesh, aligned[index])),
        0,
      );
      if (!best || distance < best.distance) best = { aligned, distance };
    }
  }
  return best.aligned;
};

const bridgeFaces = (manager, mesh, groups) => {
  const first = groups[0].loop;
  const aligned = alignFaceVertices(mesh, first, groups[1].loop);
  const bridges = first.map((id, index) => {
    const next = (index + 1) % first.length;
    return orientOutward(mesh, [id, first[next], aligned[next], aligned[index]]);
  });
  const selected = new Set(groups.flatMap((group) => group.indices));
  mesh.faces = mesh.faces.filter((_, index) => !selected.has(index));
  mesh.faces.push(...bridges);
  mesh.invalidateCache();
  manager.rebuildThreeMesh(mesh.id);
  manager.selectionMode = 'object';
  manager.cb.onSelectionModeChange?.('object');
  manager.setSelection({ meshId: mesh.id, type: 'object', indices: [] });
};

const bridgeEdges = (manager, mesh, indices) => {
  const edges = mesh.getEdges();
  const first = edges[indices[0]];
  const second = edges[indices[1]];
  const direct = vertexPosition(mesh, first.v1).distanceToSquared(vertexPosition(mesh, second.v1))
    + vertexPosition(mesh, first.v2).distanceToSquared(vertexPosition(mesh, second.v2));
  const crossed = vertexPosition(mesh, first.v1).distanceToSquared(vertexPosition(mesh, second.v2))
    + vertexPosition(mesh, first.v2).distanceToSquared(vertexPosition(mesh, second.v1));
  const face = direct <= crossed
    ? [first.v1, first.v2, second.v2, second.v1]
    : [first.v1, first.v2, second.v1, second.v2];
  const newFaceIndex = mesh.faces.length;
  mesh.faces.push(orientOutward(mesh, face));
  mesh.invalidateCache();
  manager.rebuildThreeMesh(mesh.id);
  manager.selectionMode = 'face';
  manager.cb.onSelectionModeChange?.('face');
  manager.setSelection({ meshId: mesh.id, type: 'face', indices: [newFaceIndex] });
};

export function bridgeSelection(manager) {
  const selection = manager.selection;
  const mesh = manager.getMesh(selection.meshId);
  if (!mesh) return false;
  if (selection.type === 'face') {
    const groups = getFaceBridgeGroups(mesh, selection.indices);
    if (groups.length !== 2 || groups[0].loop.length !== groups[1].loop.length || groups[0].normal.dot(groups[1].normal) >= -0.5) return false;
    manager.pushUndo();
    bridgeFaces(manager, mesh, groups);
  } else if (selection.type === 'edge') {
    if (selection.indices.length !== 2) return false;
    manager.pushUndo();
    bridgeEdges(manager, mesh, selection.indices);
  } else return false;
  manager.updateStats();
  return true;
}