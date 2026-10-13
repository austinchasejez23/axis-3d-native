import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const _size = new THREE.Vector2();

export function makeFatSegments(positions, color, widthPx, renderer) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color,
    linewidth: widthPx,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });

  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -4;
  mat.polygonOffsetUnits = -4;

  renderer.getSize(_size);
  mat.resolution.set(_size.x, _size.y);

  const seg = new LineSegments2(geo, mat);
  seg.computeLineDistances();

  return seg;
}

export function replaceFatSegmentPositions(lineSegments, positions) {
  const oldGeometry = lineSegments.geometry;

  const newGeometry = new LineSegmentsGeometry();
  newGeometry.setPositions(positions);

  lineSegments.geometry = newGeometry;
  lineSegments.computeLineDistances();

  if (oldGeometry) oldGeometry.dispose();
}