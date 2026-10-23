import * as THREE from 'three';
import { theme } from './theme';
import { applyPaintLayerShader } from './paintLayer';
import { isClosedSurface } from './renderBoost';
import objectShadowMaterial from '@/lib/objectShadowMaterial';

// Legacy projects stored the old near-white default. Render that untouched
// default as neutral modeling clay, while preserving every chosen/painted color.
const solidViewportColor = (mesh, painted) => {
  if (painted) return 0xffffff;
  return mesh.color === 0xf0f0f0 ? 0xaeb4bc : mesh.color;
};

// Workbench-style form shading for the ordinary solid viewport. A stable
// camera-space studio key separates broad planes at every orbit angle, while
// derivative cavity shading keeps creases and silhouettes readable.
function applySolidCavityShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `vec3 axisViewNormal = normalize(normal);
float axisStudioKey = dot(axisViewNormal, normalize(vec3(-0.55, 0.72, 0.42)));
float axisPlaneShade = mix(0.58, 1.08, smoothstep(-0.35, 0.85, axisStudioKey));
float axisNormalChange = length(fwidth(axisViewNormal));
float axisCavity = smoothstep(0.06, 0.55, axisNormalChange);
outgoingLight *= axisPlaneShade * (1.0 - axisCavity * 0.22);
#include <opaque_fragment>`
    );
  };
  material.customProgramCacheKey = () => 'axis-solid-workbench-v2';
}

// Material creation extracted from SceneManager so the scene manager stays under
// the file-size edit limit. Order: material preset (chrome / matte / silvery /
// clearcoat) → per-object Clear Coat → global shine → matte Lambert. Lambert
// (matte) ignores the environment map, so brightening the env only affects PBR.

export function createMaterial(mesh, viewportMode = {}) {
  if (mesh.referenceUrl) return objectShadowMaterial(new THREE.MeshLambertMaterial({
    color: 0xffffff, map: mesh.mapTexture || null, side: THREE.DoubleSide,
    transparent: true, alphaTest: 0.01,
  }));
  let mat;
  if (viewportMode.clay) {
    mat = new THREE.MeshStandardMaterial({
      color: 0xaeb4bc,
      metalness: 0,
      roughness: 0.82,
      flatShading: !mesh.smoothShading,
      side: THREE.DoubleSide,
    });
    applySolidCavityShader(mat);
  } else {
    mat = _createMaterialInner(mesh);
  }
  if (!mat) return mat;
  if (viewportMode.clay) {
    if (viewportMode.transparent) {
      mat.transparent = true;
      mat.opacity = 0.28;
      mat.depthWrite = false;
    }
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    mat.needsUpdate = true;
    return objectShadowMaterial(mat);
  }
  // Real-time reflections: the runtime cube env map (assigned by SceneManager's
  // reflection manager) reflects the actual scene. We only tune roughness +
  // envMapIntensity here so reflection strength/blur are controllable; the
  // base color, metalness, and clear coat are preserved. Lambert can't sample
  // an env map, so upgrade it to a standard material when reflections are on.
  const isPBR = mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial;
  const painted = mesh.hasPaint?.() || false;
  const surfaceColor = solidViewportColor(mesh, painted);
  if (mesh.reflectionEnabled) {
    // Reflections no longer overwrite the surface: the Metalness / Roughness
    // sliders still decide how polished it is, and the reflection Blur slider
    // only ADDS blur on top of that. Reflection strength defaults to 1 so
    // turning reflections on never flattens the surface to nothing.
    const baseRough = mesh.roughness != null
      ? mesh.roughness
      : (mesh.metalness != null ? 0.6 - mesh.metalness * 0.5 : 0.5);
    const reflRough = Math.max(0.04, Math.max(baseRough, mesh.reflectionRoughness ?? 0));
    const reflStrength = Math.max(0, Math.min(2, mesh.reflectionIntensity ?? 1));
    if (mat.isMeshLambertMaterial) {
      mat.dispose();
      mat = new THREE.MeshStandardMaterial({
        color: surfaceColor,
        metalness: mesh.metalness ?? 0.0,
        roughness: reflRough,
        envMapIntensity: reflStrength,
        flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
      });
    } else {
      mat.roughness = reflRough;
      mat.envMapIntensity = reflStrength;
      if (mesh.metalness != null) mat.metalness = mesh.metalness;
    }
    mat.needsUpdate = true;
  } else if (isPBR) {
    // Base PBR overrides from the Roughness / Metalness sliders (null = preset).
    // With no explicit Roughness set, metalness alone drives the surface from
    // dull (0) to polished metal (1) so the slider has a visible range.
    if (mesh.metalness != null) {
      mat.metalness = mesh.metalness;
      mat.envMapIntensity = 1 + mesh.metalness * 1.5;
    }
    if (mesh.roughness != null) mat.roughness = mesh.roughness;
    else if (mesh.metalness != null) mat.roughness = 0.6 - mesh.metalness * 0.5;
  } else if (mesh.roughness != null || mesh.metalness != null) {
    // Lambert has no roughness/metalness, so the sliders would do nothing.
    // Upgrade to a standard material as soon as either is set.
    mat.dispose();
    mat = new THREE.MeshStandardMaterial({
      color: surfaceColor, vertexColors: painted,
      roughness: mesh.roughness ?? Math.max(0.15, 0.5 - (mesh.metalness ?? 0) * 0.35),
      metalness: mesh.metalness ?? 0,
      envMapIntensity: 1 + (mesh.metalness ?? 0) * 1.8,
      flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
  }
  // Clear coat is an independent slider, so it layers on top of whatever the
  // preset produced (presets build Standard materials, which have no clearcoat).
  if (mesh.clearCoatEnabled && !mat.isMeshPhysicalMaterial) {
    const ci = Math.max(0, Math.min(1, mesh.clearCoatIntensity ?? 0.5));
    const prev = mat;
    mat = new THREE.MeshPhysicalMaterial({
      color: prev.color.clone(), vertexColors: prev.vertexColors,
      metalness: prev.metalness ?? 0, roughness: prev.roughness ?? 0.5,
      envMapIntensity: prev.envMapIntensity ?? 1,
      clearcoat: 1.0, clearcoatRoughness: Math.max(0.04, 0.35 - ci * 0.3),
      flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
    prev.dispose();
  } else if (mesh.clearCoatEnabled && mat.isMeshPhysicalMaterial) {
    const ci = Math.max(0, Math.min(1, mesh.clearCoatIntensity ?? 0.5));
    mat.clearcoat = 1.0;
    mat.clearcoatRoughness = Math.max(0.04, 0.35 - ci * 0.3);
  }
  // Explicit metal is bare reflective metal unless Clear coat itself is enabled.
  // The global Shine material otherwise leaves a dielectric coat over it, which
  // makes high metalness read as glossy plastic instead of metal.
  if ((mesh.metalness ?? 0) > 0 && !mesh.clearCoatEnabled && mesh.material?.preset !== 'clearcoat' && mat.isMeshPhysicalMaterial) {
    mat.clearcoat = 0;
  }
  // Common adjustments available on every material type.
  if (mesh.opacity != null && mesh.opacity < 1) {
    mat.transparent = true;
    mat.opacity = Math.max(0.02, mesh.opacity);
    mat.depthWrite = false;
  }
  if (mesh.emissive != null && mesh.emissive > 0 && mat.emissive) {
    mat.emissive = new THREE.Color(mesh.color);
    mat.emissiveIntensity = mesh.emissive * 4;
  }
  if (mesh.mapTexture) {
    mat.map = mesh.mapTexture;
    // Texture and paint never mix unless "Merge with color" is on.
    if (!mesh.textureMergeColor) {
      mat.vertexColors = false;
      if (mat.color) mat.color.set(0xffffff);
    }
    mat.needsUpdate = true;
  }
  // Shading mode always follows the mesh's own normals (never forced smooth).
  if ((mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
    mat.flatShading = !mesh.smoothShading;
  }
  // Tint: blend the material color toward the chosen hue by the tint amount.
  if (mesh.tintAmount > 0 && mat.color && (!mesh.mapTexture || mesh.textureMergeColor)) {
    mat.color.lerp(new THREE.Color().setHSL(((mesh.tintHue ?? 0) % 360) / 360, 1, 0.5), Math.min(1, mesh.tintAmount));
  }
  // Brush / spray strokes live in the object's surface paint layer, blended on
  // top of everything above (fill colors, texture, tint).
  if (mesh.paintLayer) applyPaintLayerShader(mat, mesh.paintLayer.texture);
  if (viewportMode.transparent) {
    mat.transparent = true;
    mat.opacity = 0.28;
    mat.depthWrite = false;
  }
  // Push surfaces slightly back in the depth buffer so the wireframe overlay
  // lines never z-fight with their own faces and stay visible at all angles.
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;
  // Boost keeps open surfaces double-sided, but closed solids only shade their
  // outward-facing triangles. Disabling the toggle restores the original view.
  mat.side = theme.renderBoostEnabled && isClosedSurface(mesh) ? THREE.FrontSide : THREE.DoubleSide;
  // Imported files carry geometry only, NOT their source materials or normals.
  // Still draw Axis's neutral editable surface behind the structural edges;
  // colorWrite=false made complex imports appear hollow/black.
  mat.needsUpdate = true;
  return objectShadowMaterial(mat);
}

function _createMaterialInner(mesh) {
  const mat = mesh.material;
  const painted = mesh.hasPaint?.() || false;
  const paint = { vertexColors: painted };
  if (mat && mat.preset === 'chrome') {
    return new THREE.MeshStandardMaterial({
      color: painted ? 0xffffff : 0xdde3ea, ...paint, metalness: 1.0, roughness: 0.05,
      envMapIntensity: 2.5, flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
  }
  if (mat && mat.preset === 'matte') {
    return new THREE.MeshStandardMaterial({
      color: painted ? 0xffffff : 0x0a0a0a, ...paint, metalness: 0.0, roughness: 0.95,
      envMapIntensity: 0.25, flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
  }
  if (mat && mat.preset === 'silvery') {
    return new THREE.MeshStandardMaterial({
      color: painted ? 0xffffff : 0xc5c8cf, ...paint, metalness: 0.9, roughness: 0.3,
      envMapIntensity: 1.8, flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
  }
  if (mat && mat.preset === 'clearcoat') {
    const intensity = Math.max(0, Math.min(1, mat.intensity ?? 0.5));
    return new THREE.MeshPhysicalMaterial({
      color: solidViewportColor(mesh, painted), ...paint, metalness: 0.0,
      roughness: Math.max(0.12, 0.5 - intensity * 0.35),
      clearcoat: 1.0, clearcoatRoughness: Math.max(0.04, 0.35 - intensity * 0.3),
      envMapIntensity: 2.0 + intensity * 4.0,
      flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
  }
  if (mesh.clearCoatEnabled) {
    const intensity = Math.max(0, Math.min(1, mesh.clearCoatIntensity ?? 0.5));
    return new THREE.MeshPhysicalMaterial({
      color: solidViewportColor(mesh, painted), ...paint, metalness: 0.0,
      roughness: Math.max(0.15, 0.5 - intensity * 0.35),
      clearcoat: 1.0, clearcoatRoughness: Math.max(0.12, 0.4 - intensity * 0.28),
      envMapIntensity: 3.0 + intensity * 5.0,
      flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
  }
  if (theme.shineEnabled) {
    const intensity = Math.max(0, Math.min(1, theme.shineIntensity ?? 0.5));
    const solid = new THREE.MeshStandardMaterial({
      // Neutral Workbench-style clay: broad highlights reveal curvature without
      // making the standard modeling surface look glossy or reflective.
      color: solidViewportColor(mesh, painted), ...paint, metalness: 0,
      roughness: 0.86 - intensity * 0.08,
      envMapIntensity: 0.18 + intensity * 0.12,
      flatShading: !mesh.smoothShading, side: THREE.DoubleSide,
    });
    applySolidCavityShader(solid);
    return solid;
  }
  const solid = new THREE.MeshLambertMaterial({ color: solidViewportColor(mesh, painted), ...paint, flatShading: !mesh.smoothShading, side: THREE.DoubleSide });
  applySolidCavityShader(solid);
  return solid;
}

export function applyShadows(sm) {
  const { on, intensity } = sm._shadowState ? sm._shadowState() : { on: !!theme.shadowsEnabled, intensity: theme.shadowIntensity ?? 0.5 };
  sm.renderer.shadowMap.enabled = on;
  sm.renderer.shadowMap.needsUpdate = true;
  // Default lighting's key light casts the shadows while Default is on.
  if (sm.dirLight) {
    sm.dirLight.castShadow = !!theme.defaultLightingEnabled && on;
    sm.dirLight.shadow.intensity = intensity;
  }
  if (sm.shadowGround) {
    sm.shadowGround.visible = on;
    sm.shadowGround.material.opacity = on ? intensity : 0;
  }
  for (const [id, obj] of sm.threeObjects) {
    const geometryOnly = !!sm.getMesh(id)?.importedWireframeOnly;
    // Imported wireframe meshes neither cast nor receive scene shadows.
    obj.mesh.receiveShadow = on && !geometryOnly;
    obj.mesh.castShadow = on && !geometryOnly;
    if (obj.material) obj.material.needsUpdate = true;
  }
}

export function applyShine(sm) {
  for (const [id, obj] of sm.threeObjects) {
    const mesh = sm.getMesh(id);
    if (!mesh) continue;
    obj.material.dispose();
    obj.material = createMaterial(mesh, sm.viewportDisplayMode);
    obj.mesh.material = obj.material;
    // Imported geometry keeps its neutral visible surface with or without wires.
  }
  if (sm.refreshReflectionEnvMaps) sm.refreshReflectionEnvMaps();
  // Fill levels and environment strength are owned by the lighting controls, so
  // rebuilding materials must not overwrite them with its own fixed values.
  if (sm.applyLighting) sm.applyLighting();
}

// Toggle every object's wireframe overlay visibility from the theme setting.
export function applyWireframe(sm) {
  const on = !!theme.wireframeEnabled && !sm.wireframesHidden;
  for (const obj of sm.threeObjects.values()) {
    if (obj.wireframe) obj.wireframe.visible = on && !obj.focusProxyGeometry;
    // Wireframe visibility must never turn an imported object's faces invisible.
  }
}

export function updateObjectMaterial(sm, meshId) {
  const obj = sm.threeObjects.get(meshId);
  const mesh = sm.getMesh(meshId);
  if (!obj || !mesh) return;
  obj.material.dispose();
  obj.material = createMaterial(mesh);
  obj.mesh.material = obj.material;
  // Changing a material must not hide the imported mesh surface.
  if (sm.refreshReflectionEnvMaps) sm.refreshReflectionEnvMaps();
}