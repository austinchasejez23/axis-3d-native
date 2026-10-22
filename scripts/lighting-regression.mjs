// Regression for editable light color, brightness and studio-fill handoff.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

// The utility module checks iframe status at module load; this is a non-DOM
// lighting test, so a minimal window sentinel is enough for Vite SSR.
globalThis.window = {};
window.self = window;
window.top = window;

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { applySceneLights } = await server.ssrLoadModule('/src/lib/sceneLights.js');
  const { theme } = await server.ssrLoadModule('/src/lib/theme.js');
  class LightingFixture {}
  applySceneLights(LightingFixture);
  const manager = new LightingFixture();
  manager.scene = new THREE.Scene();
  manager.renderer = { shadowMap: { enabled: false, needsUpdate: false } };
  manager.dirLight = new THREE.DirectionalLight(0xffffff, 1);
  manager.ambientLight = new THREE.AmbientLight(0xffffff, 1);
  manager.hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  manager.fillLight = new THREE.DirectionalLight(0xffffff, 1);
  manager.sceneLights = [];
  manager.cb = {};
  manager.lightingEdit = false;

  const originalDefault = theme.defaultLightingEnabled;
  try {
    theme.set({ defaultLightingEnabled: true });
    manager.applyLighting();
    assert.equal(manager.scene.environmentIntensity, 0.7);
    const studioAmbient = manager.ambientLight.intensity;
    const studioHemi = manager.hemiLight.intensity;
    const studioFill = manager.fillLight.intensity;

    const light = manager._createSceneLight({
      id: 'test-light', type: 'directional', position: [1.2, 2, 0.8],
      rotation: [-0.65, 0.55, 0], range: 15, radius: 35,
      intensity: 2, color: '#ff0000', colorIntensity: 1,
      shadows: false, shadowIntensity: 0.65,
    });
    manager.sceneLights.push(light);
    manager.selectedLightId = light.id;
    assert.equal(light.object.visible, false, 'Default studio should hide custom light');

    theme.set({ defaultLightingEnabled: false });
    manager.applyLighting();
    assert.equal(light.object.visible, true, 'Custom edit should activate the light');
    assert.ok(manager.ambientLight.intensity > 0 && manager.ambientLight.intensity < studioAmbient);
    assert.ok(manager.hemiLight.intensity > 0 && manager.hemiLight.intensity < studioHemi);
    assert.ok(manager.fillLight.intensity >= 0 && manager.fillLight.intensity < studioFill);
    assert.ok(manager.scene.environmentIntensity > 0, 'Metallic surfaces need reflective environment in custom mode');
    console.log('PASS: custom lighting retains neutral fill and metal environment');

    light.colorIntensity = 0;
    manager._syncSceneLight(light);
    const white = light.object.color.clone();
    const power = light.object.intensity;
    assert.ok(Math.abs(white.r - white.g) < 1e-6 && Math.abs(white.g - white.b) < 1e-6);
    assert.ok(power > 0, 'Zero color strength must not turn off the light');

    light.colorIntensity = 0.5;
    manager._syncSceneLight(light);
    const half = light.object.color.clone();
    assert.ok(half.r > half.g && half.g > 0, 'Half color strength should be tinted but not fully saturated');
    assert.equal(light.object.intensity, power, 'Color strength must not adjust power');

    light.colorIntensity = 1;
    manager._syncSceneLight(light);
    const full = light.object.color.clone();
    assert.ok(full.r > full.g && full.g < 1e-5, 'Full strength should use the selected hue');
    assert.equal(light.object.intensity, power);
    const mean = c => (c.r + c.g + c.b) / 3;
    assert.ok(Math.abs(mean(white) - mean(half)) < 1e-4, 'Color slider changes channel balance not average energy');
    assert.ok(Math.abs(mean(white) - mean(full)) < 1e-4);
    console.log('PASS: color strength changes hue saturation without dimming light');

    light.intensity = 0.5;
    manager._syncSceneLight(light);
    assert.equal(light.object.intensity, power / 4, 'Only intensity slider controls brightness');
    manager._disposeSceneLight(light);

    theme.set({ defaultLightingEnabled: true });
    manager.sceneLights = [];
    manager.applyLighting();
    assert.equal(manager.ambientLight.intensity, studioAmbient);
    assert.equal(manager.hemiLight.intensity, studioHemi);
    assert.equal(manager.fillLight.intensity, studioFill);
    console.log('PASS: default studio lighting can be restored exactly');
  } finally {
    theme.set({ defaultLightingEnabled: originalDefault });
  }
} finally {
  await server.close();
}
