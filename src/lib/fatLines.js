import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const _size = new THREE.Vector2();

// Share of its distance from the camera by which a line is drawn nearer the
// camera, so it shows over the faces it lies on. A fixed polygon offset did
// this before, but that offset grows with distance faster than the gaps
// between surfaces do, so zoomed out, edges behind faces showed through them.
const LINE_PULL = 0.002;

// The line shader, with the pull above and optional thinning with distance.
function patchLineShader(mat) {
  Object.assign(mat.uniforms, {
    axisPull: { value: LINE_PULL },
    axisOrthoDepth: { value: 1 },
    axisReference: { value: 0 },
    axisMinWidth: { value: 1 },
  });
  mat.vertexShader = mat.vertexShader
    .replace('uniform float linewidth;', `uniform float linewidth;
		uniform float axisPull;
		uniform float axisOrthoDepth;
		uniform float axisReference;
		uniform float axisMinWidth;`)
    .replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );', `vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			// Draw nearer the camera by a share of the distance: along the view
			// ray in perspective (the line stays where it is on screen), straight
			// towards the camera in orthographic.
			if ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ) {
				start.xyz *= 1.0 - axisPull;
				end.xyz *= 1.0 - axisPull;
			} else {
				start.z += axisPull * axisOrthoDepth;
				end.z += axisPull * axisOrthoDepth;
			}`)
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
  // The orthographic view's depth for the pull and thinning: its orbit distance.
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
