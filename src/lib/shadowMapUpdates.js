// Shadow maps only change when something that casts a shadow, or a light
// that casts one, changes: never when only the view moves. three.js redraws
// every shadow map on every frame by default; this redraws them only on
// frames where one of those actually changed.
import { FrameChanges } from './frameChanges';

function pushMatrix(changes, m) { for (let i = 0; i < 16; i++) changes.push(m.elements[i]); }

function pushMaterial(changes, material) {
  if (!material) { changes.push(null); return; }
  changes.push(material); changes.push(material.version); changes.push(material.visible);
  changes.push(material.side); changes.push(material.shadowSide); changes.push(material.alphaTest);
  changes.push(material.map); changes.push(material.alphaMap); changes.push(material.displacementMap);
  changes.push(material.displacementScale); changes.push(material.displacementBias);
  changes.push(material.clippingPlanes); changes.push(material.clipShadows);
}

export function updateShadowMapNeeds(manager) {
  const renderer = manager.renderer;
  const shadowMap = renderer.shadowMap;
  if (!shadowMap.enabled) { manager._shadowMapChanges?.reset(); return; }
  const changes = manager._shadowMapChanges || (manager._shadowMapChanges = new FrameChanges());
  // A restored GPU context comes with a new, empty shadow map.
  if (manager._shadowMapRef !== shadowMap) { manager._shadowMapRef = shadowMap; changes.reset(); }
  shadowMap.autoUpdate = false;
  // The renderer would do this inside render(); it's needed first here so
  // this frame's movement is compared, not last frame's.
  manager.scene.updateMatrixWorld();
  changes.begin();
  changes.push(shadowMap.type);
  manager.scene.traverseVisible((o) => {
    if (o.isLight) {
      if (!o.castShadow || !o.shadow) return;
      const shadow = o.shadow, cam = shadow.camera;
      changes.push(o); pushMatrix(changes, o.matrixWorld);
      if (o.target) pushMatrix(changes, o.target.matrixWorld);
      changes.push(o.angle); changes.push(o.distance); changes.push(o.penumbra); changes.push(o.decay);
      changes.push(shadow.mapSize.x); changes.push(shadow.mapSize.y); changes.push(shadow.radius);
      changes.push(shadow.blurSamples); changes.push(shadow.map);
      changes.push(cam.left); changes.push(cam.right); changes.push(cam.top); changes.push(cam.bottom);
      changes.push(cam.near); changes.push(cam.far); changes.push(cam.fov); changes.push(cam.zoom);
      pushMatrix(changes, cam.projectionMatrix);
      return;
    }
    if (!o.castShadow || !(o.isMesh || o.isLine || o.isPoints)) return;
    const geometry = o.geometry;
    changes.push(o); changes.push(geometry);
    const position = geometry?.attributes?.position;
    changes.push(position); changes.push(position?.version);
    changes.push(geometry?.index); changes.push(geometry?.index?.version);
    changes.push(geometry?.drawRange.start); changes.push(geometry?.drawRange.count);
    changes.push(o.layers.mask); changes.push(o.frustumCulled);
    pushMatrix(changes, o.matrixWorld);
    if (o.isInstancedMesh) { changes.push(o.count); changes.push(o.instanceMatrix.version); }
    changes.push(o.customDepthMaterial); changes.push(o.customDistanceMaterial);
    if (Array.isArray(o.material)) {
      changes.push(o.material.length);
      for (const m of o.material) pushMaterial(changes, m);
      changes.push(geometry?.groups.length);
      for (const g of geometry?.groups || []) { changes.push(g.start); changes.push(g.count); changes.push(g.materialIndex); }
    } else {
      pushMaterial(changes, o.material);
    }
  });
  if (changes.changed()) shadowMap.needsUpdate = true;
}
