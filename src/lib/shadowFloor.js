import * as THREE from 'three';
import objectShadowMaterial from '@/lib/objectShadowMaterial';

// A shadow needs a lit surface to darken. The viewport background is close to
// black, so a pure "shadow only" ground could darken it by a few shades at
// most and shadows were barely visible. While shadows are on, the ground is a
// real floor in the background's own colour, a little lighter, lit by the
// scene's lights and fading out into the background towards its edge.
const FLOOR_LIFT = 6; // floor albedo relative to the background colour (linear)
const FLOOR_MIN = 0.04; // keeps a black background's floor from vanishing
// Under custom lights the floor also glows in the background's own colour
// wherever it is out of shadow, so shadows on it stay clearly visible however
// far away or dim the lights are; the lights add their own light on top.
const FLOOR_GLOW = 2.2; // tone mapping darkens it: this matches the background on screen

function fadeTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, '#ffffff');
  gradient.addColorStop(1, '#000000');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function makeShadowFloor() {
  const material = objectShadowMaterial(new THREE.MeshLambertMaterial({
    color: 0x333333,
    transparent: true,
    alphaMap: fadeTexture(),
    // Never write depth: the floor must not occlude wireframe lines or
    // highlights that sit at / below grid level.
    depthWrite: false,
  }));
  // The glow darkens in shadow, by the lights' Shadow strength.
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
totalEmissiveRadiance *= getShadowMask();`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:axis-floor-glow`;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  // Drawn before the (transparent) grid so the grid lines stay on top.
  floor.renderOrder = -1;
  return floor;
}

// Match the floor to the current background colour.
export function updateShadowFloor(floor, backgroundColor, glow = false) {
  const base = new THREE.Color(backgroundColor || '#1c1c1c');
  floor.material.emissive.copy(base).multiplyScalar(glow ? FLOOR_GLOW : 0);
  floor.material.color.setRGB(
    Math.min(1, Math.max(FLOOR_MIN, base.r * FLOOR_LIFT)),
    Math.min(1, Math.max(FLOOR_MIN, base.g * FLOOR_LIFT)),
    Math.min(1, Math.max(FLOOR_MIN, base.b * FLOOR_LIFT)),
  );
  floor.material.opacity = 1;
}
