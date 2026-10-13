import { adjacentFaceIndicesForEdge, edgeKey } from './meshTopology';

const pairKey = edgeKey;

export function collectTopologicalEdgeLoop(mesh, edges, startIndex) {
  const start = edges[startIndex];
  if (!start) return [];
  const startKey = pairKey(start.v1, start.v2);
  const edgeIndex = new Map();
  const incident = new Map();
  const faces = new Map();
  edges.forEach((edge, index) => {
    const key = pairKey(edge.v1, edge.v2);
    edgeIndex.set(key, index);
    if (!incident.has(edge.v1)) incident.set(edge.v1, []);
    if (!incident.has(edge.v2)) incident.set(edge.v2, []);
    incident.get(edge.v1).push(key);
    incident.get(edge.v2).push(key);
  });
  const edgeFaces = (key) => {
    if (!faces.has(key)) {
      const [a, b] = key.split(',').map(Number);
      faces.set(key, adjacentFaceIndicesForEdge(mesh, a, b));
    }
    return faces.get(key);
  };
  const logicalFaces = (key) => new Set(edgeFaces(key).map((faceIndex) =>
    mesh.getCoplanarFaceGroup(faceIndex).slice().sort((a, b) => a - b).join('/')
  ));
  const otherVertex = (key, vertex) => {
    const [a, b] = key.split(',').map(Number);
    return a === vertex ? b : a;
  };
  const walk = (from, at) => {
    const path = [];
    const seen = new Set([startKey]);
    let previous = from;
    let current = at;
    for (let guard = 0; guard < edges.length; guard++) {
      const incoming = pairKey(previous, current);
      const candidates = (incident.get(current) || []).filter((key) => key !== incoming);
      const incomingFaces = logicalFaces(incoming);
      const legal = edgeFaces(incoming).length === 1
        ? candidates.filter((key) => edgeFaces(key).length === 1)
        : candidates.filter((key) => [...logicalFaces(key)].every((face) => !incomingFaces.has(face)));
      if (legal.length !== 1) return { path, closed: false };
      const next = legal[0];
      if (next === startKey) return { path, closed: true };
      if (seen.has(next)) return { path, closed: false };
      seen.add(next);
      path.push(next);
      previous = current;
      current = otherVertex(next, current);
    }
    return { path, closed: false };
  };
  const forward = walk(start.v1, start.v2);
  const keys = forward.closed
    ? [startKey, ...forward.path]
    : [...walk(start.v2, start.v1).path.reverse(), startKey, ...forward.path];
  return [...new Set(keys)].map((key) => edgeIndex.get(key)).filter((index) => index !== undefined);
}