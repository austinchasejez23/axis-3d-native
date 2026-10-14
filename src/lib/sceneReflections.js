import * as THREE from 'three';

// Real-time surface reflections via per-object CubeCamera + PMREM.
//
// Each reflective object owns a CubeCamera placed at its world origin that
// captures the surrounding scene (other objects, lights, background) into a
// cube render target. That cube is processed through PMREMGenerator so the
// material's roughness selects a blurred mip — giving real, roughness-aware
// reflections of the actual scene (not a faked specular highlight).
//
// The cube only needs re-rendering when the WORLD changes (objects move,
// lighting changes). Moving the view camera reveals different parts of the
// already-captured cube for free, so camera movement updates the visible
// reflection without re-rendering. A cheap scene signature detects dirtiness.

const CUBE_SIZE = 256;

// Environment images, also used for the small previews inside the picker buttons.
// These are true 2:1 equirectangular panoramas — a normal photo wrapped as an
// equirect map is what made reflections look hugely magnified and smeared.
export const ENV_URLS = {
  studio: '/media/fd46f6957_generated_image.png',
  city: '/media/fcdabaffe_generated_image.png',
  shop: '/media/114b0179c_generated_image.png',
  sunset: '/media/c9e3b0241_generated_image.png',
  darkStudio: '/media/678406f73_generated_image.png',
  desert: '/media/54bb9e80f_generated_image.png',
  graffiti: '/media/4262c0d5d_generated_image.png',
};

export function applySceneReflections(SceneManagerClass) {
  SceneManagerClass.prototype.setReflection = function (meshId, cfg) {
    // Applies to the whole multi-select group when one is active.
    const ids = this.isGroupMode() ? this.targetMeshIds() : (meshId ? [meshId] : []);
    if (ids.length === 0) return;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      if ('enabled' in cfg) mesh.reflectionEnabled = !!cfg.enabled;
      if ('intensity' in cfg) mesh.reflectionIntensity = Math.max(0, Math.min(2, cfg.intensity));
      if ('roughness' in cfg) mesh.reflectionRoughness = Math.max(0, Math.min(1, cfg.roughness));
      if (mesh.reflectionEnabled) this._ensureReflectionRig(id);
      else this._disposeReflectionRig(id);
      this.updateObjectMaterial(id);
    }
    this._reflectionDirty = true;
    this.updateHud();
  };

  SceneManagerClass.prototype._ensureReflectionRig = function (meshId) {
    if (!this._reflectionRigs) this._reflectionRigs = new Map();
    let rig = this._reflectionRigs.get(meshId);
    if (rig) return rig;
    const rt = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const cam = new THREE.CubeCamera(0.1, 1000, rt);
    this.scene.add(cam);
    rig = { cam, rt, envTarget: null, envTexture: null, pmrem: new THREE.PMREMGenerator(this.renderer) };
    this._reflectionRigs.set(meshId, rig);
    this._reflectionDirty = true;
    return rig;
  };

  SceneManagerClass.prototype._disposeReflectionRig = function (meshId) {
    if (!this._reflectionRigs) return;
    const rig = this._reflectionRigs.get(meshId);
    if (!rig) return;
    this.scene.remove(rig.cam);
    rig.rt.dispose();
    if (rig.envTarget) {
      rig.envTarget.dispose();
      rig.envTarget = null;
      rig.envTexture = null;
    } else if (rig.envTexture) {
      // Backward-compatible cleanup for a rig created before envTarget existed.
      rig.envTexture.dispose();
      rig.envTexture = null;
    }
    rig.pmrem.dispose();
    // Clear the envMap on the material so it falls back to the scene environment.
    const obj = this.threeObjects.get(meshId);
    if (obj && obj.material) { obj.material.envMap = null; obj.material.needsUpdate = true; }
    this._reflectionRigs.delete(meshId);
  };

  // Re-attach existing reflection env textures to freshly rebuilt materials
  // (applyShine / updateObjectMaterial dispose + recreate materials).
  SceneManagerClass.prototype.refreshReflectionEnvMaps = function () {
    if (!this._reflectionRigs) return;
    for (const [meshId, rig] of this._reflectionRigs) {
      if (!rig.envTexture) continue;
      const obj = this.threeObjects.get(meshId);
      if (obj && obj.material) { obj.material.envMap = rig.envTexture; obj.material.needsUpdate = true; }
    }
  };

  SceneManagerClass.prototype._reflectionSceneSignature = function () {
    let s = '';
    for (const m of this.meshes) {
      s += m.id + ':' +
        m.position.x.toFixed(4) + ',' + m.position.y.toFixed(4) + ',' + m.position.z.toFixed(4) + ',' +
        m.rotation.x.toFixed(4) + ',' + m.rotation.y.toFixed(4) + ',' + m.rotation.z.toFixed(4) + ',' +
        m.scale.x.toFixed(4) + ',' + m.scale.y.toFixed(4) + ',' + m.scale.z.toFixed(4) + ';';
    }
    // Track light direction rather than its absolute position. Panning shifts
    // the target and light together without changing illumination, so it must
    // not trigger six cube renders plus PMREM generation every frame.
    const lightDirection = this.dirLight.position.clone().sub(this.cameraTarget).normalize();
    s += 'a' + this.ambientLight.intensity + ',d' + this.dirLight.intensity +
      ',dd' + lightDirection.x.toFixed(4) + ',' + lightDirection.y.toFixed(4) + ',' + lightDirection.z.toFixed(4) + ';';
    s += 'bg' + (this.scene.background && this.scene.background.getHexString ? this.scene.background.getHexString() : '') + ';';
    return s;
  };

  SceneManagerClass.prototype.updateReflections = function () {
    // Keep rigs in sync with which meshes currently have reflections enabled
    // (covers load/clone/delete and toggling without touching those code paths).
    for (const mesh of this.meshes) {
      if (mesh.reflectionEnabled && (!this._reflectionRigs || !this._reflectionRigs.has(mesh.id))) {
        this._ensureReflectionRig(mesh.id);
      }
    }
    if (this._reflectionRigs) {
      for (const id of [...this._reflectionRigs.keys()]) {
        const mesh = this.getMesh(id);
        if (!mesh || !mesh.reflectionEnabled) this._disposeReflectionRig(id);
      }
    }
    if (!this._reflectionRigs || this._reflectionRigs.size === 0) return;

    // Camera navigation keeps using the last valid cube and refreshes once the
    // gesture ends. Rebuilding reflection cubes during orbit/pan is the largest
    // avoidable source of camera-frame stalls on mobile.
    const navigating = this.cameraGesture || this.gesture === 'camera_two'
      || this.gesture === 'orbit' || this.mouse?.mode === 'orbit' || this.mouse?.mode === 'pan';
    if (navigating) return;

    const sig = this._reflectionSceneSignature();
    if (sig !== this._lastReflectionSig) this._reflectionDirty = true;
    if (!this._reflectionDirty) return;
    this._lastReflectionSig = sig;
    this._reflectionDirty = false;

    const hlVisible = this.highlightGroup.visible;
    const gridVisible = this.grid.visible;
    const prevBg = this.scene.background;
    this.highlightGroup.visible = false;
    this.grid.visible = false;
    // Reflect the chosen environment image as the cube's background so the
    // captured reflection includes the environment (not the flat viewport bg).
    // Always give the cube something lit to capture — the chosen environment
    // image, or the procedural studio env — so a reflection is never black.
    const captureBg = this._envTexture || this._studioEnvTex;
    this.scene.background = captureBg || new THREE.Color(0x777b82);

    for (const [meshId, rig] of this._reflectionRigs) {
      const mesh = this.getMesh(meshId);
      const obj = this.threeObjects.get(meshId);
      if (!mesh || !obj) continue;
      rig.cam.position.copy(mesh.position);
      // Hide the reflective object so it does not reflect itself.
      obj.mesh.visible = false;
      rig.cam.update(this.renderer, this.scene);
      obj.mesh.visible = true;
      // PMREM-process the cube so roughness selects a blurred mip.
      // Keep the render target itself so its framebuffer/texture resources can
      // be disposed on the next refresh instead of leaking GPU memory.
      if (rig.envTarget) rig.envTarget.dispose();
      else if (rig.envTexture) rig.envTexture.dispose();
      rig.envTarget = rig.pmrem.fromCubemap(rig.rt.texture);
      rig.envTexture = rig.envTarget.texture;
      if (obj.material) { obj.material.envMap = rig.envTexture; obj.material.needsUpdate = true; }
    }

    this.highlightGroup.visible = hlVisible;
    this.grid.visible = gridVisible;
    this.scene.background = prevBg;
  };

  // Neutral studio lighting is the default when Environment is Off. It gives
  // metallic materials readable light from every side without showing or
  // selecting a photographic environment.
  SceneManagerClass.prototype._buildStudioEnvironment = function () {
    if (this._studioPmrem) this._studioPmrem.dispose();
    if (!this._studioPmremGen) this._studioPmremGen = new THREE.PMREMGenerator(this.renderer);
    const room = new THREE.Scene();
    room.background = new THREE.Color(0x777b82);
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x777b82, side: THREE.BackSide })
    );
    room.add(shell);
    const addPanel = (color, position, rotation) => {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 2.5),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      panel.position.set(...position);
      panel.rotation.set(...rotation);
      room.add(panel);
    };
    addPanel(0xffffff, [-3.5, 2.5, 0], [0, Math.PI / 2, 0]);
    addPanel(0xdce8ff, [3.5, 1, 0], [0, -Math.PI / 2, 0]);
    addPanel(0xffead6, [0, 3.5, 0], [Math.PI / 2, 0, 0]);
    this._studioPmrem = this._studioPmremGen.fromScene(room, 0.04);
    room.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    if (!this._envTexture) this.scene.environment = this._studioPmrem.texture;

    // Keep the studio panorama only as scenery for real-time reflection cubes.
    if (!this._envLoader) this._envLoader = new THREE.TextureLoader();
    this._envLoader.setCrossOrigin('anonymous');
    this._envLoader.load(ENV_URLS.studio, (envTex) => {
      if (this._disposed) { envTex.dispose(); return; }
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      envTex.colorSpace = THREE.SRGBColorSpace;
      if (this._studioEnvTex) this._studioEnvTex.dispose();
      this._studioEnvTex = envTex;
      this._reflectionDirty = true;
    });
  };

  SceneManagerClass.prototype.disposeSceneReflections = function () {
    if (this._reflectionRigs) {
      for (const id of [...this._reflectionRigs.keys()]) this._disposeReflectionRig(id);
      this._reflectionRigs.clear();
    }
    if (this._envTexture) { this._envTexture.dispose(); this._envTexture = null; }
    if (this._envPmrem) { this._envPmrem.dispose(); this._envPmrem = null; }
    if (this._envPmremGen) { this._envPmremGen.dispose(); this._envPmremGen = null; }
    if (this._studioEnvTex) { this._studioEnvTex.dispose(); this._studioEnvTex = null; }
    if (this._studioPmrem) { this._studioPmrem.dispose(); this._studioPmrem = null; }
    if (this._studioPmremGen) { this._studioPmremGen.dispose(); this._studioPmremGen = null; }
    this.scene.environment = null;
  };

  // Global reflection environment. Sets scene.environment (PBR reflections for
  // all materials) and, for reflection-enabled objects, is captured as the cube
  // background so the reflected imagery is the chosen environment.
  SceneManagerClass.prototype.setReflectionEnvironment = function (envId) {
    this.reflectionEnvironment = envId || null;
    if (this._envTexture) { this._envTexture.dispose(); this._envTexture = null; }
    if (this._envPmrem) { this._envPmrem.dispose(); this._envPmrem = null; }
    if (!envId || !ENV_URLS[envId]) {
      this._buildStudioEnvironment();
      this._reflectionDirty = true;
      return;
    }
    if (!this._envLoader) this._envLoader = new THREE.TextureLoader();
    this._envLoader.setCrossOrigin('anonymous');
    this._envLoader.load(ENV_URLS[envId], (tex) => {
      if (this._disposed) { tex.dispose(); return; }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this._envTexture = tex;
      if (this._envPmrem) this._envPmrem.dispose();
      if (!this._envPmremGen) this._envPmremGen = new THREE.PMREMGenerator(this.renderer);
      this._envPmrem = this._envPmremGen.fromEquirectangular(tex);
      this.scene.environment = this._envPmrem.texture;
      this._reflectionDirty = true;
    });
  };
}