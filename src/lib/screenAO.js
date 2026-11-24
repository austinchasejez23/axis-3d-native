import * as THREE from 'three';
import { theme } from './theme';

// Ambient occlusion for the viewport: corners, grooves, holes and places where
// objects meet get darker, the way they do in real light, so form and depth
// read without the wireframe.
//
// Each frame (only while the view or the scene changes) the objects' depth is
// drawn at half size, occlusion is worked out from it on the screen, then
// smoothed. Object materials read the result at their own pixel, so only the
// objects are shaded: lines, the grid, gizmos and highlights are untouched.

// Objects that take part carry this layer (set when their mesh is built).
export const SCREEN_AO_LAYER = 5;

const SAMPLES = 12;
// Reach of the shading on screen, in CSS pixels, and how dark it gets.
const RADIUS_CSS_PX = 26;
const STRENGTH = 0.85;

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

// Shared by every object material, so one update reaches all of them.
const uniforms = {
  axisAOMap: { value: white },
  axisAOSize: { value: new THREE.Vector2(1, 1) },
  axisAOStrength: { value: 0 },
};

// Adds the occlusion to a material: it dims the soft fill and reflections
// fully and the direct light partly, so lit creases still show.
export function applyScreenAOShader(material) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    if (this.transparent) return;
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D axisAOMap;
uniform vec2 axisAOSize;
uniform float axisAOStrength;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
float axisScreenAO = mix(1.0, texture2D(axisAOMap, gl_FragCoord.xy / axisAOSize).r, axisAOStrength);
reflectedLight.indirectDiffuse *= axisScreenAO;
reflectedLight.indirectSpecular *= axisScreenAO;
reflectedLight.directDiffuse *= mix(1.0, axisScreenAO, 0.6);
reflectedLight.directSpecular *= mix(1.0, axisScreenAO, 0.6);`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:axis-screen-ao-v1${material.transparent ? '-off' : ''}`;
  return material;
}

const FULL_SCREEN_VERTEX = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAGMENT = `varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uResolution;
uniform float uRadiusPx;
uniform float uOrtho;
uniform vec3 uKernel[${SAMPLES}];

vec3 viewAt(vec2 uv, float depth) {
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }

void main() {
  float d = depthAt(vUv);
  if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewAt(vUv, d);
  vec2 texel = 1.0 / uResolution;
  // Surface direction from the neighbours, taking the nearer neighbour on each
  // axis so object outlines do not bend it.
  vec3 pr = viewAt(vUv + vec2(texel.x, 0.0), depthAt(vUv + vec2(texel.x, 0.0)));
  vec3 pl = viewAt(vUv - vec2(texel.x, 0.0), depthAt(vUv - vec2(texel.x, 0.0)));
  vec3 pu = viewAt(vUv + vec2(0.0, texel.y), depthAt(vUv + vec2(0.0, texel.y)));
  vec3 pd = viewAt(vUv - vec2(0.0, texel.y), depthAt(vUv - vec2(0.0, texel.y)));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  vec3 toEye = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-P);
  if (dot(N, toEye) < 0.0) N = -N;
  // How much one pixel covers at this depth.
  float pixel = uOrtho > 0.5 ? 2.0 / (uProj[1][1] * uResolution.y) : 2.0 * abs(P.z) / (uProj[1][1] * uResolution.y);
  float radius = uRadiusPx * pixel;
  // A different turn of the sample pattern at each pixel; the blur evens it out.
  float angle = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 rv = vec3(cos(angle), sin(angle), 0.0);
  vec3 T = normalize(rv - N * dot(rv, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);
  float occlusion = 0.0;
  for (int i = 0; i < ${SAMPLES}; i++) {
    vec3 S = P + TBN * uKernel[i] * radius;
    vec4 clip = uProj * vec4(S, 1.0);
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    float sd = depthAt(suv);
    if (sd >= 1.0) continue;
    float sz = viewAt(suv, sd).z;
    float range = smoothstep(0.0, 1.0, radius / max(abs(P.z - sz), 1e-6));
    occlusion += (sz >= S.z + radius * 0.03 ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occlusion / float(${SAMPLES});
  gl_FragColor = vec4(vec3(ao * ao), 1.0);
}`;

// Smooths the pattern out over 4×4 pixels, but not across object outlines.
const BLUR_FRAGMENT = `varying vec2 vUv;
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uResolution;
float viewZ(vec2 uv) {
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0);
  return p.z / p.w;
}
void main() {
  vec2 texel = 1.0 / uResolution;
  float z = viewZ(vUv);
  float sum = 0.0, weight = 0.0;
  for (int x = -2; x < 2; x++) {
    for (int y = -2; y < 2; y++) {
      vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * texel;
      float w = 1.0 / (1.0 + 400.0 * abs(viewZ(uv) - z) / max(abs(z), 1e-4));
      sum += texture2D(tAO, uv).r * w;
      weight += w;
    }
  }
  gl_FragColor = vec4(vec3(sum / max(weight, 1e-6)), 1.0);
}`;

function makeKernel() {
  const kernel = [];
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < SAMPLES; i++) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, 0.15 + rand() * 0.85).normalize();
    // More samples close to the surface point.
    const t = (i + 1) / SAMPLES;
    v.multiplyScalar(0.2 + 0.8 * t * t);
    kernel.push(v);
  }
  return kernel;
}

function fullScreenPass(material) {
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return scene;
}

function makeTarget(w, h, depth) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: !!depth, generateMipmaps: false,
  });
  if (depth) rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
  return rt;
}

// (Re)makes the half-size targets for a new screen size.
function sizeTargets(state, w, h) {
  for (const rt of [state.depthRT, state.aoRT, state.blurRT]) { rt?.depthTexture?.dispose(); rt?.dispose(); }
  state.depthRT = makeTarget(w, h, true);
  state.aoRT = makeTarget(w, h, false);
  state.blurRT = makeTarget(w, h, false);
  state.aoMaterial.uniforms.tDepth.value = state.depthRT.depthTexture;
  state.blurMaterial.uniforms.tDepth.value = state.depthRT.depthTexture;
  state.blurMaterial.uniforms.tAO.value = state.aoRT.texture;
  state.size.set(w, h);
  state.signature = [];
}

function createState() {
  const aoMaterial = new THREE.ShaderMaterial({
    vertexShader: FULL_SCREEN_VERTEX, fragmentShader: AO_FRAGMENT,
    uniforms: {
      tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2(1, 1) }, uRadiusPx: { value: 1 }, uOrtho: { value: 0 }, uKernel: { value: makeKernel() },
    },
    depthTest: false, depthWrite: false,
  });
  const blurMaterial = new THREE.ShaderMaterial({
    vertexShader: FULL_SCREEN_VERTEX, fragmentShader: BLUR_FRAGMENT,
    uniforms: {
      tAO: { value: null }, tDepth: { value: null }, uInvProj: { value: aoMaterial.uniforms.uInvProj.value },
      uResolution: { value: aoMaterial.uniforms.uResolution.value },
    },
    depthTest: false, depthWrite: false,
  });
  return {
    depthRT: null, aoRT: null, blurRT: null, aoMaterial, blurMaterial,
    aoScene: fullScreenPass(aoMaterial), blurScene: fullScreenPass(blurMaterial),
    quadCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    depthMaterial: new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }),
    size: new THREE.Vector2(), signature: [],
  };
}

// Everything that changes what the occlusion looks like: the view, the size,
// and each object's placement, shape and visibility.
function sceneSignature(sm, size) {
  const sig = [size.x, size.y, ...sm.camera.matrixWorld.elements, ...sm.camera.projectionMatrix.elements];
  for (const [, obj] of sm.threeObjects) {
    const mesh = obj.mesh;
    sig.push(mesh.visible ? 1 : 0, mesh.geometry?.id ?? 0, mesh.geometry?.attributes?.position?.version ?? 0, ...mesh.matrixWorld.elements);
  }
  return sig;
}

function sameSignature(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Works out the occlusion for this frame and turns it on for the objects'
// materials. Call endScreenAO after drawing, so other drawing (thumbnails,
// reflections) is not shaded with it.
export function beginScreenAO(sm) {
  uniforms.axisAOStrength.value = 0;
  if (!theme.defaultLightingEnabled || !sm.threeObjects?.size) return;
  const renderer = sm.renderer;
  if (!renderer.capabilities?.isWebGL2) return;
  const state = sm._screenAO || (sm._screenAO = createState());
  const full = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.max(1, Math.round(full.x / 2)), h = Math.max(1, Math.round(full.y / 2));
  if (!state.depthRT || state.size.x !== w || state.size.y !== h) sizeTargets(state, w, h);
  sm.camera.updateMatrixWorld();
  const signature = sceneSignature(sm, state.size);
  if (!sameSignature(signature, state.signature)) {
    state.signature = signature;
    const scene = sm.scene, camera = sm.camera;
    const hidden = [];
    for (const [, obj] of sm.threeObjects) {
      if (obj.mesh.visible && obj.material?.transparent) { obj.mesh.visible = false; hidden.push(obj.mesh); }
    }
    const mask = camera.layers.mask;
    const override = scene.overrideMaterial, background = scene.background;
    const shadows = renderer.shadowMap.enabled;
    const previousTarget = renderer.getRenderTarget();
    camera.layers.set(SCREEN_AO_LAYER);
    scene.overrideMaterial = state.depthMaterial;
    scene.background = null;
    renderer.shadowMap.enabled = false;
    try {
      renderer.setRenderTarget(state.depthRT);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      camera.layers.mask = mask;
      scene.overrideMaterial = override;
      scene.background = background;
      renderer.shadowMap.enabled = shadows;
      for (const mesh of hidden) mesh.visible = true;
    }
    const pixelRatio = renderer.getPixelRatio();
    const ao = state.aoMaterial.uniforms;
    ao.uProj.value.copy(camera.projectionMatrix);
    ao.uInvProj.value.copy(camera.projectionMatrixInverse);
    ao.uResolution.value.set(w, h);
    ao.uRadiusPx.value = RADIUS_CSS_PX * pixelRatio / 2;
    ao.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
    renderer.setRenderTarget(state.aoRT);
    renderer.render(state.aoScene, state.quadCamera);
    renderer.setRenderTarget(state.blurRT);
    renderer.render(state.blurScene, state.quadCamera);
    renderer.setRenderTarget(previousTarget);
  }
  uniforms.axisAOMap.value = state.blurRT.texture;
  uniforms.axisAOSize.value.copy(full);
  uniforms.axisAOStrength.value = STRENGTH;
}

export function endScreenAO() {
  uniforms.axisAOStrength.value = 0;
}

export function disposeScreenAO(sm) {
  const state = sm._screenAO;
  if (!state) return;
  for (const rt of [state.depthRT, state.aoRT, state.blurRT]) { rt?.depthTexture?.dispose(); rt?.dispose(); }
  state.aoMaterial.dispose(); state.blurMaterial.dispose(); state.depthMaterial.dispose();
  sm._screenAO = null;
  uniforms.axisAOMap.value = white;
}
