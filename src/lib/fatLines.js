import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const _size = new THREE.Vector2();

// Lines get no depth offset of their own: faces are already drawn slightly
// behind their edges (their polygon offset), which keeps every edge visible on
// its own faces. Any offset added to lines as well grows with distance, so
// zoomed out it let edges under nearby faces show through them.

// The line shader, with optional thinning with distance.
function patchLineShader(mat) {
  Object.assign(mat.uniforms, {
    axisOrthoDepth: { value: 1 },
    axisReference: { value: 0 },
    axisMinWidth: { value: 1 },
  });
  mat.vertexShader = mat.vertexShader
    .replace('uniform float linewidth;', `uniform float linewidth;
		uniform float axisOrthoDepth;
		uniform float axisReference;
		uniform float axisMinWidth;`)
    .replace('offset *= linewidth;', `float axisWidth = linewidth;
				// Thinner beyond the reference distance, as the model itself gets
				// smaller, but never below the minimum width.
				if ( axisReference > 0.0 ) {
					float axisDepth = perspective ? max( - ( ( position.y < 0.5 ) ? start.z : end.z ), 1e-6 ) : axisOrthoDepth;
					axisWidth = clamp( linewidth * axisReference / axisDepth, min( axisMinWidth, linewidth ), linewidth );
				}
				offset *= axisWidth;`);
}

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
  patchLineShader(mat);

  renderer.getSize(_size);
  mat.resolution.set(_size.x, _size.y);

  const seg = new LineSegments2(geo, mat);
  seg.computeLineDistances();
  // The orthographic view's depth for thinning: its orbit distance.
  seg.onBeforeRender = (r, scene, camera) => {
    mat.uniforms.axisOrthoDepth.value = camera.userData?.viewDistance ?? 1;
  };

  return seg;
}

// Make a line thin out with distance from the camera: full width up to the
// distance `reference()` returns, thinner beyond it in proportion to the
// distance, never below `minPx` pixels.
export function thinWithDistance(lineSegments, reference, minPx = 1) {
  const uniforms = lineSegments.material.uniforms;
  uniforms.axisMinWidth.value = minPx;
  const before = lineSegments.onBeforeRender;
  lineSegments.onBeforeRender = (r, scene, camera, ...rest) => {
    before.call(lineSegments, r, scene, camera, ...rest);
    uniforms.axisReference.value = Math.max(1e-6, reference());
  };
  return lineSegments;
}

export function replaceFatSegmentPositions(lineSegments, positions) {
  const oldGeometry = lineSegments.geometry;

  const newGeometry = new LineSegmentsGeometry();
  newGeometry.setPositions(positions);

  lineSegments.geometry = newGeometry;
  lineSegments.computeLineDistances();

  if (oldGeometry) oldGeometry.dispose();
}

// Move the existing segments to new end points without making a new geometry:
// the same number of segments, written straight into the buffer the shader
// already reads. Returns false (nothing changed) when the count differs.
export function moveFatSegmentPositions(lineSegments, positions) {
  const geometry = lineSegments.geometry;
  const buffer = geometry?.attributes?.instanceStart?.data;
  if (!buffer || buffer.array.length !== positions.length) return false;
  buffer.array.set(positions);
  buffer.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}
