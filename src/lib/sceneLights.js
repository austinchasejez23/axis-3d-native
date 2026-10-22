import * as THREE from 'three';
import { clamp } from './utils';
import { theme } from './theme';
import makeLightGizmo from '@/lib/makeLightGizmo';
import { makeLightRangeGuide, updateLightRangeGuide } from './lightRangeGuide';

const TYPES = new Set(['spot', 'point', 'directional']);
const freshId = () => `light-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const plain = (light) => ({
  id: light.id, type: light.type,
  position: [...light.position], rotation: [...light.rotation],
  intensity: light.intensity, radius: light.radius, range: light.range,
  shadows: light.shadows, shadowIntensity: light.shadowIntensity,
  color: light.color, colorIntensity: light.colorIntensity,
});

function defaults(type = 'spot') {
  return {
    id: freshId(), type, position: [1.2, 2, 0.8], rotation: [-0.65, 0.55, 0],
    intensity: 1.5, radius: type === 'spot' ? 35 : 1,
    range: 15, shadows: false, shadowIntensity: 0.65,
    color: '#ffffff', colorIntensity: 1,
  };
}

function makeGizmo(data) {
  const group = makeLightGizmo(data);
  if (data.type !== 'point') {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2.2)]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: data.color, depthTest: false, toneMapped: false }));
    line.userData.lightId = data.id;
    line.renderOrder = 1000;
    group.add(line);
  }
  group.userData.lightId = data.id;
  return group;
}

export function applySceneLights(SceneManager) {
  const P = SceneManager.prototype;

  P._createSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (source) {
    const data = { ...defaults(source?.type), ...source };
    data.type = TYPES.has(data.type) ? data.type : 'spot';
    data.position = [...(data.position || [3, 5, 4])];
    data.rotation = [...(data.rotation || [-0.65, 0.55, 0])];
    let object;
    if (data.type === 'point') object = new THREE.PointLight(data.color, 1, data.range, 2);
    else if (data.type === 'directional') object = new THREE.DirectionalLight(data.color, 1);
    else object = new THREE.SpotLight(data.color, 1, data.range, THREE.MathUtils.degToRad(data.radius), 0.18, 2);
    const shadowResolution = data.type === 'directional' ? 2048 : 1024;
    object.shadow.mapSize.set(shadowResolution, shadowResolution);
    object.shadow.bias = -0.00035;
    object.shadow.normalBias = 0.025;
    object.shadow.camera.near = 0.1;
    const target = data.type === 'point' ? null : new THREE.Object3D();
    if (target) { object.target = target; this.scene.add(target); }
    const record = { ...data, object, target, gizmo: makeGizmo(data), guide: makeLightRangeGuide() };
    this.scene.add(object, record.gizmo, record.guide);
    this._syncSceneLight(record);
    return record;
  };

  P._disposeSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (record) {
    this.scene.remove(record.object, record.gizmo, record.guide);
    record.guide.geometry.dispose();
    record.guide.material.dispose();
    if (record.target) this.scene.remove(record.target);
    record.gizmo.traverse((child) => { child.geometry?.dispose(); child.material?.dispose(); });
    record.object.dispose?.();
  };

  P._syncSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (record) {
    const { object, gizmo } = record;
    object.position.fromArray(record.position);
    gizmo.position.fromArray(record.position);
    gizmo.rotation.fromArray(record.rotation);
    const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(...record.rotation)).normalize();
    if (record.target) {
      record.target.position.copy(object.position).addScaledVector(direction, Math.max(1, record.range));
      record.target.updateMatrixWorld();
    }
    // Default lighting on means the fixed studio wash ONLY. The user's lights
    // stay in the scene exactly as they were made, just switched off and out
    // of sight, so turning default off brings them back untouched.
    const custom = !theme.defaultLightingEnabled;
    object.visible = custom;
    // Color intensity means color SATURATION, not brightness. Mix a neutral
    // white light toward the selected hue, keeping its average channel energy
    // constant so increasing saturation does not dim the entire scene.
    const saturation = clamp(record.colorIntensity ?? 1, 0, 1);
    const color = new THREE.Color(0xffffff).lerp(new THREE.Color(record.color || '#ffffff'), saturation);
    const channelMean = (color.r + color.g + color.b) / 3;
    if (channelMean > 1e-6) color.multiplyScalar(1 / channelMean);
    object.color.copy(color);
    // Only the Intensity slider changes light power.
    object.intensity = clamp(record.intensity ?? 1.5, 0, 5) * (record.type === 'directional' ? 3 : 75);
    object.castShadow = custom && !!record.shadows;
    object.shadow.intensity = clamp(record.shadowIntensity, 0, 1);
    object.shadow.radius = record.type === 'point' ? clamp(record.radius * 2, 0, 10) : 3;
    if (record.type === 'spot') {
      object.distance = record.range;
      object.angle = THREE.MathUtils.degToRad(clamp(record.radius, 5, 85));
      object.penumbra = 0.18;
      object.shadow.camera.far = record.range;
    } else if (record.type === 'point') {
      object.distance = record.range;
      object.shadow.camera.far = record.range;
    } else {
      const half = Math.max(2, record.range / 2);
      Object.assign(object.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: Math.max(20, record.range * 2) });
      object.shadow.camera.updateProjectionMatrix();
    }
    const selected = record.id === this.selectedLightId;
    const showHandles = !!this.lightingEdit && custom;
    updateLightRangeGuide(record.guide, record, selected, showHandles, theme.highlightColor);
    record.gizmo.visible = showHandles;
    record.gizmo.traverse((child) => {
      if (child.userData.selectionOutline) {
        child.visible = selected;
        child.material.color.set(theme.highlightColor);
        return;
      }
      if (!child.material?.color || child.userData.fixedTint) return;
      child.material.color.set(record.color);
      child.material.opacity = selected ? 1 : 0.72;
      child.material.transparent = !selected;
    });
    // One rule for shadows everywhere (see _shadowState), so this and
    // applyShadows can never switch shadow rendering in opposite directions.
    this.renderer.shadowMap.enabled = this._shadowState().on || (custom && !!record.shadows);
    this.renderer.shadowMap.needsUpdate = true;
    this._reflectionDirty = true;
  };

  P._emitSceneLights = /** @this {import('./SceneManager.js').SceneManager} */ function () { this.cb.onLightsChange?.(this.getLightingState()); };
  P.getLightingState = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const lights = (this.sceneLights || []).map(plain);
    const selectedIndex = Math.max(0, lights.findIndex((light) => light.id === this.selectedLightId));
    return { lights, selectedIndex, selected: lights[selectedIndex] || null };
  };
  P.serializeSceneLights = /** @this {import('./SceneManager.js').SceneManager} */ function () { return (this.sceneLights || []).map(plain); };

  P.resetSceneLights = /** @this {import('./SceneManager.js').SceneManager} */ function (saved) {
    for (const light of this.sceneLights || []) this._disposeSceneLight(light);
    const source = saved?.length ? saved : [defaults('directional')];
    this.sceneLights = source.map((light) => this._createSceneLight(light));
    this.selectedLightId = this.sceneLights[0]?.id || null;
    this.applyLighting();
    this.applyShadows();
    this._emitSceneLights();
  };
  P.restoreSceneLights = /** @this {import('./SceneManager.js').SceneManager} */ function (saved, selectedId) {
    this.resetSceneLights(saved);
    if (saved?.some((light) => light.id === selectedId)) this.selectedLightId = selectedId;
    for (const light of this.sceneLights) this._syncSceneLight(light);
    this._emitSceneLights();
  };
  P.disposeSceneLights = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    for (const light of this.sceneLights || []) this._disposeSceneLight(light);
    this.sceneLights = [];
  };

  // Shadows on/off and strength. Default lighting has its own setting (the
  // Shadows button while Default is on); custom lighting follows the lights
  // that have Shadows turned on, at the strongest of their Shadow sliders.
  P._shadowState = function () {
    if (theme.defaultLightingEnabled) {
      return { on: !!theme.shadowsEnabled, intensity: clamp(theme.shadowIntensity ?? 0.6, 0, 1) };
    }
    const casting = (this.sceneLights || []).filter((light) => light.shadows);
    return { on: casting.length > 0, intensity: casting.length ? Math.max(...casting.map((light) => clamp(light.shadowIntensity ?? 0.65, 0, 1))) : 0 };
  };

  P.applyLighting = function () {
    // Default lighting: a studio setup with a real key light from above and to
    // the side (so objects show a lit and a shaded side, and can cast shadows),
    // plus softer fill. Custom lighting: the user's lights do the work. Only a
    // faint fill and a little environment remain, enough that metal is not
    // pitch black, so every light setting has a clearly visible effect and the
    // scene goes dark when the lights are turned down.
    const base = theme.defaultLightingEnabled;
    if (this.dirLight) {
      this.dirLight.intensity = base ? 2 : 0;
      if (!this.dirLight.target.parent) this.scene.add(this.dirLight.target);
      if (base && !theme.shadowsEnabled) {
        this.dirLight.position.set(-5, 8, 1.5);
        this.dirLight.target.position.set(0, 0, 0);
        this.dirLight.target.updateMatrixWorld();
      }
    }
    if (this.ambientLight) this.ambientLight.intensity = base ? 0.3 : 0.03;
    if (this.hemiLight) {
      this.hemiLight.intensity = base ? 0.5 : 0.06;
      this.hemiLight.color.set(0xffffff);
      this.hemiLight.groundColor.set(0x888888);
    }
    if (this.fillLight) {
      this.fillLight.intensity = base ? 0.35 : 0;
      this.fillLight.color.set(0xffffff);
    }
    this.scene.environmentIntensity = base ? 0.7 : 0.22;
    for (const light of this.sceneLights || []) this._syncSceneLight(light);
  };
  P.setLightingEdit = /** @this {import('./SceneManager.js').SceneManager} */ function (active) {
    this.lightingEdit = !!active;
    this.setHighlightsHidden?.(!!active);
    if (active && !this.selectedLightId) this.selectedLightId = this.sceneLights[0]?.id || null;
    for (const light of this.sceneLights || []) this._syncSceneLight(light);
    this._emitSceneLights();
  };
  P.updateSceneLightGizmos = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (!this.lightingEdit) return;
    for (const light of this.sceneLights) {
      const distance = this.camera.position.distanceTo(light.gizmo.position);
      const scale = Math.max(0.08, distance * (light.id === this.selectedLightId ? 0.05 : 0.043));
      light.gizmo.scale.setScalar(scale);
    }
  };
  P.getSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function () { return this.sceneLights?.find((light) => light.id === this.selectedLightId) || null; };
  P.selectSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (id) {
    if (!this.sceneLights?.some((light) => light.id === id)) return false;
    this.selectedLightId = id;
    for (const light of this.sceneLights) this._syncSceneLight(light);
    this._emitSceneLights();
    return true;
  };
  // Touching a light means you want your own lighting, so default lighting
  // steps aside rather than silently swallowing the edit. Selecting a light
  // is not an edit and leaves the toggle alone.
  P._leaveDefaultLighting = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (theme.defaultLightingEnabled) theme.set({ defaultLightingEnabled: false });
  };
  P.beginSceneLightControl = /** @this {import('./SceneManager.js').SceneManager} */ function () { this.pushUndo(); };
  P.updateSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (patch, recordUndo = false) {
    const light = this.getSelectedSceneLight();
    if (!light) return;
    this._leaveDefaultLighting();
    if (recordUndo) this.pushUndo();
    if (patch.type && patch.type !== light.type) {
      const index = this.sceneLights.indexOf(light);
      const data = { ...plain(light), ...patch, radius: patch.type === 'spot' ? 35 : patch.type === 'point' ? 1 : light.radius };
      this._disposeSceneLight(light);
      this.sceneLights[index] = this._createSceneLight(data);
    } else {
      Object.assign(light, patch);
      light.intensity = clamp(light.intensity, 0, 5);
      light.colorIntensity = clamp(light.colorIntensity, 0, 1);
      light.shadowIntensity = clamp(light.shadowIntensity, 0, 1);
      light.range = clamp(light.range, 1, 50);
      light.radius = clamp(light.radius, light.type === 'spot' ? 5 : 0.1, light.type === 'spot' ? 85 : 5);
      this._syncSceneLight(light);
    }
    // Shadow toggles and intensity changes also control the receiver plane;
    // syncing only the light left that plane hidden from an earlier Off state.
    this.applyShadows();
    this.editVersion = (this.editVersion || 0) + 1;
    this._emitSceneLights();
  };
  P.duplicateSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const light = this.getSelectedSceneLight();
    if (!light) return;
    this._leaveDefaultLighting();
    this.pushUndo();
    const data = plain(light);
    data.id = freshId();
    data.position = [data.position[0] + 0.7, data.position[1], data.position[2] + 0.4];
    const duplicate = this._createSceneLight(data);
    this.sceneLights.push(duplicate);
    this.selectSceneLight(duplicate.id);
    this.applyShadows();
  };
  P.deleteSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.sceneLights.length <= 1) return false;
    const light = this.getSelectedSceneLight();
    if (!light) return false;
    this._leaveDefaultLighting();
    this.pushUndo();
    const index = this.sceneLights.indexOf(light);
    this._disposeSceneLight(light);
    this.sceneLights.splice(index, 1);
    this.selectedLightId = this.sceneLights[Math.min(index, this.sceneLights.length - 1)].id;
    for (const item of this.sceneLights) this._syncSceneLight(item);
    this.applyShadows();
    this._emitSceneLights();
    return true;
  };

  P.pickSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    if (!this.lightingEdit) return null;
    const ndc = this.screenToNDC(x, y);
    this.pointer.set(ndc.x, ndc.y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.sceneLights.map((light) => light.gizmo), true)[0];
    if (hit?.object?.userData?.lightId) return hit.object.userData.lightId;
    for (const light of this.sceneLights) {
      const p = light.gizmo.position.clone().project(this.camera);
      const rect = this.renderer.domElement.getBoundingClientRect();
      const sx = rect.left + (p.x + 1) * rect.width / 2;
      const sy = rect.top + (1 - p.y) * rect.height / 2;
      if (Math.hypot(x - sx, y - sy) <= 28) return light.id;
    }
    return null;
  };
  P.isPointOverSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) { return this.pickSceneLight(x, y) === this.selectedLightId; };
  P.translateSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (delta) {
    const light = this.getSelectedSceneLight();
    if (!light) return;
    this._leaveDefaultLighting();
    const p = new THREE.Vector3().fromArray(light.position).add(delta);
    light.position = p.toArray();
    this._syncSceneLight(light);
    this._emitSceneLights();
  };
  P.rotateSelectedSceneLight = /** @this {import('./SceneManager.js').SceneManager} */ function (angle) {
    const light = this.getSelectedSceneLight();
    if (!light || light.type === 'point') return;
    this._leaveDefaultLighting();
    const axis = new THREE.Vector3();
    this.camera.getWorldDirection(axis);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...light.rotation));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    light.rotation = new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3);
    this._syncSceneLight(light);
    this._emitSceneLights();
  };

  P.beginSceneLightGesture = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    if (!this.lightingEdit) return false;
    if (this.pointers.size === 1) {
      const id = this.pickSceneLight(e.clientX, e.clientY);
      if (id) { this.selectSceneLight(id); this.gesture = 'light_translate_pending'; }
      else {
        this.gesture = 'light_orbit_pending';
        this.gestureData = { lastX: e.clientX, lastY: e.clientY };
      }
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return true;
    }
    if (this.pointers.size !== 2) return true;
    const pts = [...this.pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    if (!pts.some((p) => this.isPointOverSelectedSceneLight(p.x, p.y))) {
      this.gesture = 'camera_two';
      this.cameraGesture = true;
      this.gestureData = {
        startDist: dist, startAngle: angle,
        startMidX: (pts[0].x + pts[1].x) / 2, startMidY: (pts[0].y + pts[1].y) / 2,
        lastMidX: (pts[0].x + pts[1].x) / 2, lastMidY: (pts[0].y + pts[1].y) / 2,
        lastDist: dist, lastAngle: angle,
      };
      return true;
    }
    const light = this.getSelectedSceneLight();
    this.gesture = 'light_manipulate';
    this.gestureData = { mode: null, startDist: dist, lastAngle: angle, startAngle: angle,
      startMidX: (pts[0].x + pts[1].x) / 2, startMidY: (pts[0].y + pts[1].y) / 2,
      radius: light.radius, range: light.range, intensity: light.intensity };
    return true;
  };

  P.updateSceneLightGesture = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    if (!this.gesture?.startsWith('light_')) return false;
    const pointer = this.pointers.get(e.pointerId);
    if (this.gesture === 'light_orbit_pending' && this.movedSignificantly) this.gesture = 'light_orbit';
    if (this.gesture === 'light_orbit') {
      this.queueCameraMove('orbit', e.clientX - this.gestureData.lastX, e.clientY - this.gestureData.lastY);
      this.gestureData.lastX = e.clientX;
      this.gestureData.lastY = e.clientY;
      return true;
    }
    if (this.gesture === 'light_translate_pending' && this.movedSignificantly) {
      this.gesture = 'light_translate';
      this.gestureData = { lastX: pointer.startX, lastY: pointer.startY };
      this.pushUndo();
    }
    if (this.gesture === 'light_translate') {
      const light = this.getSelectedSceneLight();
      const delta = this.screenToWorldDrag(this.gestureData.lastX, this.gestureData.lastY, e.clientX, e.clientY, new THREE.Vector3().fromArray(light.position));
      this.translateSelectedSceneLight(delta);
      this.gestureData.lastX = e.clientX; this.gestureData.lastY = e.clientY;
      return true;
    }
    if (this.gesture !== 'light_manipulate' || this.pointers.size !== 2) return true;
    const pts = [...this.pointers.values()];
    const g = this.gestureData;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
    const dx = midX - g.startMidX, dy = midY - g.startMidY;
    let angleDelta = Math.atan2(Math.sin(angle - g.startAngle), Math.cos(angle - g.startAngle));
    if (!g.mode) {
      const p0 = pts[0], p1 = pts[1];
      const a0 = [p0.x - p0.startX, p0.y - p0.startY], a1 = [p1.x - p1.startX, p1.y - p1.startY];
      const l0 = Math.hypot(...a0), l1 = Math.hypot(...a1);
      const parallel = l0 > 4 && l1 > 4 && (a0[0] * a1[0] + a0[1] * a1[1]) / (l0 * l1) > 0.8;
      if (parallel && Math.hypot(dx, dy) > 6) g.mode = Math.abs(dx) >= Math.abs(dy) ? 'range' : 'intensity';
      else if (Math.abs(angleDelta) * dist > 7 && this.getSelectedSceneLight()?.type !== 'point') g.mode = 'rotate';
      else if (Math.abs(dist - g.startDist) > 7 && this.getSelectedSceneLight()?.type !== 'directional') g.mode = 'radius';
      if (g.mode) this.pushUndo(); else return true;
    }
    if (g.mode === 'rotate') { this.rotateSelectedSceneLight(angle - g.lastAngle); g.lastAngle = angle; g.startAngle = angle; }
    else if (g.mode === 'radius') this.updateSelectedSceneLight({ radius: g.radius * Math.max(0.1, dist / g.startDist) });
    else if (g.mode === 'range') this.updateSelectedSceneLight({ range: g.range * Math.exp(dx / 120) });
    else if (g.mode === 'intensity') this.updateSelectedSceneLight({ intensity: g.intensity * Math.exp(-dy / 120) });
    return true;
  };
  P.finishSceneLightGesture = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (!this.gesture?.startsWith('light_')) return false;
    if (this.pointers.size === 0) { this.gesture = null; this.gestureData = null; }
    else { this.gesture = 'light_paused'; this.gestureData = null; }
    return true;
  };

  P.beginSceneLightMouse = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    if (!this.lightingEdit) return false;
    const id = e.button === 0 ? this.pickSceneLight(e.clientX, e.clientY) : null;
    if (id) {
      this.selectSceneLight(id);
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'light_move_pending' };
    } else {
      this.mouse = { button: e.button, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: e.button === 0 ? 'light_orbit' : 'light_pan' };
    }
    return true;
  };
  P.updateSceneLightMouse = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    const m = this.mouse;
    if (!m?.mode?.startsWith('light_')) return false;
    if (Math.hypot(e.clientX - m.startX, e.clientY - m.startY) > 4) m.moved = true;
    if (m.mode === 'light_move_pending' && m.moved) { m.mode = 'light_move'; this.pushUndo(); }
    if (m.mode === 'light_orbit') {
      if (m.moved) this.queueCameraMove('orbit', e.clientX - m.lastX, e.clientY - m.lastY);
    } else if (m.mode === 'light_pan') {
      this.queueCameraMove('pan', e.clientX - m.lastX, e.clientY - m.lastY);
    }
    if (m.mode === 'light_move') {
      const light = this.getSelectedSceneLight();
      const delta = this.screenToWorldDrag(m.lastX, m.lastY, e.clientX, e.clientY, new THREE.Vector3().fromArray(light.position));
      this.translateSelectedSceneLight(delta);
    }
    m.lastX = e.clientX; m.lastY = e.clientY;
    return true;
  };
  P.finishSceneLightMouse = /** @this {import('./SceneManager.js').SceneManager} */ function () { return !!this.mouse?.mode?.startsWith('light_'); };
}