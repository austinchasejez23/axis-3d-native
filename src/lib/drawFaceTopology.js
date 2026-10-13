import * as THREE from 'three';
import { edgeKey } from './meshTopology';

function projectToPlane(points) {
  const origin = new THREE.Vector3(points[0].x, points[0].y, points[0].z);
  const xAxis = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 1; i < points.length && xAxis.lengthSq() === 0; i++) {
    xAxis.set(points[i].x, points[i].y, points[i].z).sub(origin);
  }
  xAxis.normalize();
  for (let i = 2; i < points.length && normal.lengthSq() < 1e-12; i++) {
    const offset = new THREE.Vector3(points[i].x, points[i].y, points[i].z).sub(origin);
    normal.crossVectors(xAxis, offset);
  }
  normal.normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  return points.map((point) => {
    const offset = new THREE.Vector3(point.x, point.y, point.z).sub(origin);
    return new THREE.Vector2(offset.dot(xAxis), offset.dot(yAxis));
  });
}

function orderedQuad(a, b, points2d) {
  const ids = [...new Set([...a, ...b])];
  if (ids.length !== 4) return null;
  const center = ids.reduce((sum, id) => sum.add(points2d[id]), new THREE.Vector2()).multiplyScalar(0.25);
  ids.sort((i, j) => Math.atan2(points2d[i].y - center.y, points2d[i].x - center.x) - Math.atan2(points2d[j].y - center.y, points2d[j].x - center.x));
  const turns = ids.map((id, i) => {
    const p = points2d[id];
    const q = points2d[ids[(i + 1) % 4]];
    const r = points2d[ids[(i + 2) % 4]];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  if (turns.some((turn) => Math.abs(turn) < 1e-8) || turns.some((turn) => Math.sign(turn) !== Math.sign(turns[0]))) return null;
  const triTurn = (points2d[a[1]].x - points2d[a[0]].x) * (points2d[a[2]].y - points2d[a[0]].y)
    - (points2d[a[1]].y - points2d[a[0]].y) * (points2d[a[2]].x - points2d[a[0]].x);
  if (Math.sign(turns[0]) !== Math.sign(triTurn)) ids.reverse();
  return ids;
}

export function buildDrawFaceTopology(points, vertexIds) {
  if (vertexIds.length <= 4) return { faces: [vertexIds], visibleEdges: [] };
  const points2d = projectToPlane(points);
  const triangles = THREE.ShapeUtils.triangulateShape(points2d, []);
  if (!triangles.length) return { faces: [vertexIds], visibleEdges: [] };

  const graph = triangles.map(() => new Map());
  for (let i = 0; i < triangles.length; i++) {
    for (let j = i + 1; j < triangles.length; j++) {
      const shared = triangles[i].filter((id) => triangles[j].includes(id));
      if (shared.length !== 2) continue;
      const quad = orderedQuad(triangles[i], triangles[j], points2d);
      if (!quad) continue;
      graph[i].set(j, quad);
      graph[j].set(i, quad);
    }
  }

  const remaining = new Set(triangles.map((_, index) => index));
  const pairs = [];
  const remove = (index) => {
    remaining.delete(index);
    for (const neighbor of graph[index].keys()) graph[neighbor].delete(index);
  };
  while (true) {
    let leaf = [...remaining].find((index) => graph[index].size === 1);
    if (leaf == null) {
      leaf = [...remaining].find((index) => graph[index].size > 0);
      if (leaf == null) break;
    }
    const neighbor = graph[leaf].keys().next().value;
    pairs.push({ a: leaf, b: neighbor, quad: graph[leaf].get(neighbor) });
    remove(leaf);
    remove(neighbor);
  }

  const paired = new Set(pairs.flatMap(({ a, b }) => [a, b]));
  const faces = [
    ...pairs.map(({ quad }) => quad.map((index) => vertexIds[index])),
    ...triangles.filter((_, index) => !paired.has(index)).map((triangle) => triangle.map((index) => vertexIds[index])),
  ];
  const occurrences = new Map();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      occurrences.set(key, { v1: Math.min(a, b), v2: Math.max(a, b), count: (occurrences.get(key)?.count || 0) + 1 });
    }
  }
  const visibleEdges = [...occurrences.values()].filter((edge) => edge.count === 2).map(({ v1, v2 }) => ({ v1, v2 }));
  return { faces, visibleEdges };
}