import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';
import { createPrimitive, createPrimitiveSegments } from './primitives';
import { generateProjectId } from './storage';
import { dissolveSelection } from './dissolveTools';
import { toggleSmoothShading, separateMesh as separateMeshTool, createFaceFromVertices, targetMergeVertices, connectVertices, detachFaces, cloneFaces, splitEdge, bevelEdge, selectLoop, selectRing, createFaceFromBorder } from './meshTools';
import { theme } from './theme';
import { createMaterial as buildMaterial, applyShadows as applyShadowsFn, applyShine as applyShineFn, applyWireframe as applyWireframeFn, updateObjectMaterial as updateObjectMaterialFn } from './materials';
import { subdivideMesh as subdivideMeshTool } from './subdivideTool';
import { segmentEditedMesh } from './axisSegments';
import { fillSelection as fillPaintSelection, paintAt as applyPaintAt, endPaintStroke as finishPaintStroke } from './paintTools';
import { applyPaintPatches, samplePaintLayer } from './paintLayer';
import { clonePaintLayer, clearPaintLayer } from './paintLayer';
import { sculptSmooth, sculptDisplace } from './sculptTools';
import { applySceneUndo } from './sceneUndo';
import { applySceneRadialArray } from './sceneRadialArray';
import { applySceneExtrude } from './sceneExtrude';
import { applySceneTexture } from './sceneTexture';
import { applySceneReflections } from './sceneReflections';
import { applySceneConvert } from './sceneConvert';
import { applySceneSelection } from './sceneSelection';
import { applySceneLights } from './sceneLights';
import { applySceneMouse } from './sceneMouse';
import { applySceneGestures } from './sceneGestures';
import { applySceneCut } from './sceneCut';
import { applySceneMeasure } from './sceneMeasure';
import { applySceneAddVertex } from './sceneAddVertex';
import { applySceneReference, loadReferenceImage } from './sceneReference';
import { mergeVerticesWithin, weldCoincidentVertices, edgeKey } from './meshTopology';
import { cleanupCommittedTopology, dissolveSharedBoundary, adjacentFacesForBoundary, removeFaceByIndex, resolveLegacyDeletedBorders } from './meshTopologyInvariants';
import { updateGeometryInPlace } from './meshBufferUpdate';
import { syncObjectHighlightTransforms, refreshTransformHighlights } from './highlightFollow';
import { intersectSelection, subtractSelection, unionSelection } from './booleanTools';
import { snapAngleDelta, uniformScaleSnapFactor, axisScaleSnapFactor } from './snapping';
import { buildViewportGrid, disposeViewportGrid, updateViewportGridFade, updateViewportGridResolution } from './viewportGrid';
import applySceneDrawFace from '@/lib/sceneDrawFace';
import updateDrawFaceGrid from '@/lib/drawFaceGrid';
import { restoreNavigationResolution, updateRenderBoostTriangleLoad, resetRenderBoostAuto } from './renderBoost';
import { queueCameraMotion, releaseCameraMotion, stopCameraMotion, updateCameraMotion, tweenCameraTo } from '@/lib/cameraMotion';
import { bridgeSelection } from '@/lib/bridgeTools';
import { applyFocusRenderBoost } from '@/lib/focusRenderBoost';
import { updateObjectAxisArrows, disposeObjectAxisArrows } from '@/lib/objectAxisArrows';
import updateSceneShadowBounds from '@/lib/sceneShadowBounds';
import cloneObjects from '@/lib/cloneObjects';
import {
  makeFatSegments,
  replaceFatSegmentPositions,
} from './fatLines';

// Above this triangle count a mesh is treated as heavy: while a deforming
// gesture is in flight its wireframe and selection highlight (both rebuilt from
// scratch every frame) are skipped so only the surface updates. Lighter meshes
// are never affected, so ordinary models look exactly the same as before.
const HEAVY_EDIT_TRIANGLES = 20000;

export class SceneManager {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.backgroundColor);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.cameraTheta = 0;
    this.cameraPhi = Math.PI / 2;
    this.cameraDist = 5;
    // Screenshot-based starting view: 45° azimuth, 22° elevation, wider framing.
    this.setCameraOrbit(11.5, Math.PI / 4, THREE.MathUtils.degToRad(22));

    // Cap mobile resolution to avoid the GPU-memory exhaustion that blanks
    // WebViews. (Thumbnails self-render before reading the canvas, so no
    // preserved drawing buffer is needed.)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    const mobilePixelRatio = navigator.maxTouchPoints > 0 ? 1.5 : 2;
    this._basePixelRatio = Math.min(window.devicePixelRatio, mobilePixelRatio);
    this.renderer.setPixelRatio(this._basePixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Filmic tone mapping: keeps bright highlights from blowing out to flat
    // white and gives surfaces a natural falloff instead of a washed look.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // Procedural sky→ground gradient environment used for glossy reflections.
    // Only MeshStandardMaterial (the shine material) samples it; Lambert ignores
    // it, so the matte baseline look is unchanged when shine is off.
    // Studio environment: dark backdrop with bright "light panel" rectangles.
    // Matte (Lambert) surfaces ignore this and stay flat; glossy PBR surfaces
    // (Clear Coat / shine) reflect the bright panels as clear streaks, so the
    // glossy vs matte difference is unmistakable even on faceted geometry.
    this._buildStudioEnvironment();

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.ambientLight = ambient;
    // Sky/ground hemisphere fill: cool light from above, warm bounce from below,
    // so unlit sides read as shaded form instead of flat grey.
    const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x4a4238, 0.55);
    this.hemiLight = hemi;
    // Soft fill from the opposite side of the key, no shadow — keeps shadowed
    // faces readable without flattening the key light's contrast.
    const fill = new THREE.DirectionalLight(0xdfe8f5, 0.35);
    fill.position.set(-5, 3, -4);
    this.fillLight = fill;
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(4, 6, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.0004;
    dir.shadow.normalBias = 0.03;
    dir.shadow.radius = 6;
    dir.shadow.blurSamples = 16;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 50;
    // Tighter frustum = far more shadow-map pixels per object, so edges are
    // crisp instead of blocky.
    dir.shadow.camera.left = -6;
    dir.shadow.camera.right = 6;
    dir.shadow.camera.top = 6;
    dir.shadow.camera.bottom = -6;
    this.dirLight = dir;
    this.scene.add(ambient, hemi, fill, dir);
    this.lightFollowCamera = false;
    this.lightDir = null;
    this.lightDistance = 8;

    this.grid = null;
    this.updateGrid();

    // Invisible ground plane (ShadowMaterial) at grid level that catches shadows.
    const shadowGroundGeo = new THREE.PlaneGeometry(40, 40);
    const shadowGroundMat = new THREE.ShadowMaterial({ opacity: 0.5 });
    // Never write depth: the invisible ground plane must not occlude wireframe
    // lines or highlights that sit at / below grid level.
    shadowGroundMat.depthWrite = false;
    this.shadowGround = new THREE.Mesh(shadowGroundGeo, shadowGroundMat);
    this.shadowGround.rotation.x = -Math.PI / 2;
    this.shadowGround.position.y = 0;
    this.shadowGround.receiveShadow = true;
    this.scene.add(this.shadowGround);

    this.meshes = [];
    this.threeObjects = new Map();
    this.selection = { meshId: null, type: 'object', indices: [] };
    this.selectedMeshIds = [];
    this.selectionMode = 'object';
    this.activeAction = 'idle';
    this.activeAxis = null;
    this.freeMove = false;
    this.freeScale = false;
    this.freeRotate = false;
    this.multiSelect = false;
    // Surface mode: appearance editing only — object transforms are disabled.
    this.surfaceMode = false;
    // View-only overrides never alter stored material, texture, paint, or opacity.
    this.viewportDisplayMode = { clay: false, transparent: false };

    this.highlightGroup = new THREE.Group();
    this.scene.add(this.highlightGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.pointers = new Map();
    this.gesture = null;
    this.gestureData = null;
    this.pressHoldTimer = null;
    this.dragStartScreen = null;
    this.movedSignificantly = false;
    this.drawMode = null;
    this.cutMode = null;
    this.addVertexMode = null;
    this.drawScreenPts = [];
    this.drawWorldPts = [];
    this.extrudeDrag = null;
    this.paintTool = null;
    this.sculptTool = null;
    this.sculptStroke = null;

    this.undoStack = [];
    this.redoStack = [];
    this.maxUndo = 20;

    this.projectId = generateProjectId();
    this.projectName = 'Untitled';
    this.resetSceneLights();

    this._themeUnsub = theme.subscribe(() => {
      this.scene.background = new THREE.Color(theme.backgroundColor);
      this.updateGrid();
      this.updateHighlights();
      this.applyShadows();
      this.applyShine();
      this.applyWireframe();
      this.refreshStaleWireframes();
      restoreNavigationResolution(this);
      this.setFocusRenderBoost(theme.focusRenderBoostEnabled);
      this.applyLighting();
    });

    this.applyShadows();
    this.applyShine();
    this.setFocusRenderBoost(theme.focusRenderBoostEnabled);
    this.applyLighting();
    this.animate();
    this.setupContextRecovery();
    this.setupEvents();
    this.handleResize();
    this._handleResize = () => this.handleResize();
    this._handleViewportResume = () => {
      if (document.visibilityState === 'hidden') return;
      requestAnimationFrame(() => {
        this.handleResize();
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
      });
    };
    window.addEventListener('resize', this._handleResize);
    window.addEventListener('pageshow', this._handleViewportResume);
    document.addEventListener('visibilitychange', this._handleViewportResume);
    document.addEventListener('fullscreenchange', this._handleViewportResume);
  }

  // === CAMERA ===
  setCameraOrbit(radius, theta, phi) {
    this.stopCameraMotion();
    this.cameraDist = radius;
    this.cameraTheta = theta;
    this.cameraPhi = phi;
    this.applyCamera();
  }

  applyCamera() {
    const e = this.cameraPhi;
    const a = this.cameraTheta;
    const R = this.cameraDist;
    const ce = Math.cos(e), se = Math.sin(e);
    const ca = Math.cos(a), sa = Math.sin(a);
    this.camera.position.set(
      this.cameraTarget.x + R * ce * sa,
      this.cameraTarget.y + R * se,
      this.cameraTarget.z + R * ce * ca
    );
    // The up direction rides the orbit itself, so rotation is unlimited in every
    // direction: it passes straight through the top and bottom continuously with
    // no stop and no flip.
    this.camera.up.set(-se * sa, ce, -se * ca);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();
    // The near plane closes in with the orbit distance, so geometry right in
    // front of the camera is never sliced away while moving through it.
    const near = THREE.MathUtils.clamp(R * 0.02, 0.005, 0.1);
    if (Math.abs(this.camera.near - near) > 1e-9) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    updateViewportGridFade(this.grid, this.camera, this.cameraDist, theme.backgroundColor);
    // Sun follows the camera (offset up and to the side) so the shadow is
    // always cast to the side visible from the viewing angle — natural,
    // always-visible shadows while the shadow toggle is on. Without this the
    // light sits on the camera's side and the shadow is hidden behind the
    // object from the default view.
    if (this.dirLight) {
      if (this.lightFollowCamera) {
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.dirLight.position.set(
          this.cameraTarget.x + right.x * 4 + up.x * 6,
          this.cameraTarget.y + right.y * 4 + up.y * 6,
          this.cameraTarget.z + right.z * 4 + up.z * 6
        );
      } else if (this.lightDir) {
        this.dirLight.position.copy(this.cameraTarget).addScaledVector(this.lightDir, this.lightDistance);
      }
      this.dirLight.target.position.copy(this.cameraTarget);
      this.dirLight.target.updateMatrixWorld();
    }
  }

  applyShadows() { applyShadowsFn(this); }

  createMaterial(mesh) { return buildMaterial(mesh, this.viewportDisplayMode); }

  setViewportDisplayMode(mode) {
    this.viewportDisplayMode = { clay: !!mode?.clay, transparent: !!mode?.transparent };
    this.applyShine();
  }

  applyShine() { applyShineFn(this); }

  updateObjectMaterial(meshId) { updateObjectMaterialFn(this, meshId); }

  applyWireframe() { applyWireframeFn(this); }

  // Touch input applies directly; the render loop handles mouse damping and release inertia.
  stopCameraMotion() { stopCameraMotion(this); }
  releaseCameraMotion() { releaseCameraMotion(this); }
  queueCameraMove(kind, dx, dy) { queueCameraMotion(this, kind, dx, dy); }
  orbit(dx, dy) { queueCameraMotion(this, 'orbit', dx, dy); }
  pan(dx, dy) { queueCameraMotion(this, 'pan', dx, dy); }
  zoom(factor) { queueCameraMotion(this, 'zoom', factor); }

  // Focus: center the camera on the current selection (object, group, faces,
  // edges or vertices), preserving the current zoom and viewing angle.
  // Returns false when nothing is selected.
  focusSelection() {
    const box = new THREE.Box3();
    const add = (mesh, ids) => {
      const wm = this.getWorldMatrix(mesh);
      for (const id of ids) {
        const v = mesh.getVertex(id);
        if (v) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm));
      }
    };
    if (this.isGroupMode()) {
      for (const id of this.selectedMeshIds) {
        const mesh = this.getMesh(id);
        if (mesh) add(mesh, mesh.vertices.map((v) => v.id));
      }
    } else {
      const mesh = this.getMesh(this.selection.meshId);
      if (!mesh) return false;
      add(mesh, this.selection.type === 'object' ? mesh.vertices.map((v) => v.id) : this.getSelectedVertexIds());
    }
    if (box.isEmpty()) return false;
    tweenCameraTo(this, box.getCenter(new THREE.Vector3()), this.cameraDist);
    return true;
  }

  frameScene(padding = 3) {
    this.stopCameraMotion();
    if (this.meshes.length === 0) return;
    const bounds = new THREE.Box3();
    for (const mesh of this.meshes) {
      if (!mesh.visible) continue;
      const worldMatrix = this.getWorldMatrix(mesh);
      for (const vertex of mesh.vertices) {
        bounds.expandByPoint(new THREE.Vector3(vertex.x, vertex.y, vertex.z).applyMatrix4(worldMatrix));
      }
    }
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
    this.cameraTarget.copy(bounds.getCenter(new THREE.Vector3()));
    this.cameraDist = Math.max(6, radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * padding);
    this.applyCamera();
  }

  // Move the orbit pivot to the current selection center without changing the view:
  // both camera and target shift by the same delta, so nothing jumps — only the
  // rotation/pan center moves to follow the selection.
  updateCameraTargetToSelection() {
    if (this.isGroupMode()) {
      const c = this.getGroupCenter();
      if (c) this._retarget(c);
      return;
    }
    if (this.selection.meshId) {
      this._retarget(this.getSelectionCenter());
    }
  }

  _retarget(center) {
    // Put the true selection center under the orbit pivot without making the
    // current view jump: camera and target move by the same delta, preserving
    // their distance and orientation. Clearing selection leaves this last pivot
    // in place, so navigation continues around the last selected geometry.
    if (!center || center.distanceToSquared(this.cameraTarget) < 1e-8) return;
    const delta = center.clone().sub(this.cameraTarget);
    this.cameraTarget.copy(center);
    this.camera.position.add(delta);
    this.applyCamera();
  }

  // === MESH MANAGEMENT ===
  addPrimitive(type, segments = 12) {
    this.pushUndo();
    const mesh = createPrimitive(type, segments);
    const projectedTriangles = this.meshes.reduce((sum, item) => sum + item.getTriangleCount(), 0) + mesh.getTriangleCount();
    if (this.triangleLimit && projectedTriangles > this.triangleLimit) { this.cb.onTriangleLimit?.(); return null; }
    // The first primitive retains its factory geometry, size, and original
    // grid placement. Only subsequently added primitives are camera-centered
    // and uniformly sized relative to the existing model.
    if (this.meshes.length === 0) {
      let minY = Infinity;
      for (const v of mesh.vertices) if (v.y < minY) minY = v.y;
      if (Number.isFinite(minY)) mesh.position.y = -minY * (mesh.scale.y || 1);
    } else {
      const bounds = new THREE.Box3();
      for (const existing of this.meshes) {
        if (!existing.visible) continue;
        const world = this.getWorldMatrix(existing);
        for (const vertex of existing.vertices) {
          bounds.expandByPoint(new THREE.Vector3(vertex.x, vertex.y, vertex.z).applyMatrix4(world));
        }
      }
      const primitiveBounds = new THREE.Box3();
      for (const vertex of mesh.vertices) primitiveBounds.expandByPoint(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
      const size = primitiveBounds.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z, 1e-6);
      const existingSize = bounds.getSize(new THREE.Vector3());
      const modelLongest = Math.max(existingSize.x, existingSize.y, existingSize.z);
      // A new part starts at 25% of the model's longest dimension.
      // Never enlarge the factory primitive, and cap its screen footprint.
      const visibleHeight = 2 * Math.max(0.1, this.cameraDist) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const targetSize = Math.min(modelLongest > 1e-6 ? modelLongest * 0.25 : longest, longest, visibleHeight * 0.25);
      const scale = Math.max(0.0001, targetSize / longest);
      mesh.scale.setScalar(scale);
      const center = primitiveBounds.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      mesh.position.copy(this.cameraTarget).sub(center);
    }
    this.meshes.push(mesh);
    this.buildThreeMesh(mesh);
    // A new object always arrives selected in object mode.
    if (this.selectionMode !== 'object') {
      this.setSelectionMode('object');
      this.cb.onSelectionModeChange?.('object');
    }
    this.setSelection({ meshId: mesh.id, type: 'object', indices: [] });
    this.updateStats();
    return mesh;
  }

  addMesh(editableMesh) {
    // Imported meshes may not commit detached vertices or edges.
    resolveLegacyDeletedBorders(editableMesh);
    cleanupCommittedTopology(editableMesh);
    if (!editableMesh.faces.length) return null;
    const projectedTriangles = this.meshes.reduce((sum, item) => sum + item.getTriangleCount(), 0) + editableMesh.getTriangleCount();
    if (this.triangleLimit && projectedTriangles > this.triangleLimit) { this.cb.onTriangleLimit?.(); return null; }
    this.meshes.push(editableMesh);
    this.buildThreeMesh(editableMesh);
  }

  buildThreeMesh(mesh) {
    const geo = mesh.toBufferGeometry();
    const mat = this.createMaterial(mesh);
    const threeMesh = new THREE.Mesh(geo, mat);
    threeMesh.position.copy(mesh.position);
    threeMesh.rotation.copy(mesh.rotation);
    threeMesh.scale.copy(mesh.scale);
    threeMesh.visible = mesh.visible;
    threeMesh.castShadow = !mesh.importedWireframeOnly;
    threeMesh.receiveShadow = !mesh.importedWireframeOnly;
    loadReferenceImage(this, mesh);

    // Screen-space fat lines: GPU lines are locked at 1px, so the wireframe is
    // drawn as thin quads instead — sub-pixel thin and dark/opaque.
    const wireGeo = mesh.toEdgesGeometry();
    // Thin sub-pixel hairline (requested): finest line the screen can draw.
    const wireframe = makeFatSegments(
      Array.from(wireGeo.getAttribute('position').array),
      mesh.importedWireframeOnly ? 0x161c24 : 0x0a0a0a,
      mesh.importedWireframeOnly ? 0.85 : 0.5, this.renderer,
    );
    wireGeo.dispose();
    wireframe.material.opacity = 1;
    // Occlude back-side edges with the solid object's depth buffer.
    wireframe.material.depthTest = true;
    wireframe.material.depthWrite = false;
    wireframe.renderOrder = 1;
    wireframe.visible = theme.wireframeEnabled !== false && !this.wireframesHidden;
    // Keep imported faces visible behind their editable wireframe, never hollow.
    threeMesh.add(wireframe);

    this.scene.add(threeMesh);
    this.threeObjects.set(mesh.id, { mesh: threeMesh, wireframe, material: mat });
  }

  rebuildThreeMesh(meshId) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return;

    const obj = this.threeObjects.get(meshId);
    if (!obj) return;

    if (obj.focusProxyGeometry) {
      obj.focusDetailGeometry?.dispose();
      obj.focusDetailGeometry = mesh.toBufferGeometry();
      obj.wireframeStale = true;
      obj.mesh.position.copy(mesh.position);
      obj.mesh.rotation.copy(mesh.rotation);
      obj.mesh.scale.copy(mesh.scale);
      obj.mesh.visible = mesh.visible;
      return;
    }

    // While a gesture is deforming this mesh, write the new positions/normals
    // into the existing buffers instead of allocating a whole new geometry every
    // frame. Falls back to the full rebuild whenever topology changed.
    if (this._liveEdit && updateGeometryInPlace(mesh, obj.mesh.geometry)) {
      this._liveEditIds?.add(meshId);
      if (obj.wireframe.visible) this._refreshWireframe(obj, mesh);
      else obj.wireframeStale = true;
      obj.mesh.position.copy(mesh.position);
      obj.mesh.rotation.copy(mesh.rotation);
      obj.mesh.scale.copy(mesh.scale);
      obj.mesh.visible = mesh.visible;
      return;
    }

    // Replace surface geometry.
    const oldGeo = obj.mesh.geometry;
    obj.mesh.geometry = mesh.toBufferGeometry();
    oldGeo.dispose();

    // Rebuilding the wireframe costs as much as the surface itself, so it is
    // only done while the wireframe is actually on screen. A hidden one is
    // marked stale and refreshed the moment it becomes visible again.
    if (obj.wireframe.visible) this._refreshWireframe(obj, mesh);
    else obj.wireframeStale = true;

    obj.mesh.position.copy(mesh.position);
    obj.mesh.rotation.copy(mesh.rotation);
    obj.mesh.scale.copy(mesh.scale);
    obj.mesh.visible = mesh.visible;

    obj.material.flatShading = !mesh.smoothShading;
    obj.material.needsUpdate = true;
  }

  // Light-weight transform sync for object-only position/rotation/scale changes
  // (no geometry rebuild needed).
  updateObjectTransform(meshId) {
    const obj = this.threeObjects.get(meshId);
    const mesh = this.getMesh(meshId);
    if (!obj || !mesh) return;
    obj.mesh.position.copy(mesh.position);
    obj.mesh.rotation.copy(mesh.rotation);
    obj.mesh.scale.copy(mesh.scale);
    syncObjectHighlightTransforms(this);
  }

  // HUD rotation while vertices/edges/faces are selected rotates ONLY that
  // selection, around its own center. The typed angles are tracked per
  // selection (subRotation) instead of being compared to the object's own
  // rotation — comparing against the object made the whole object spin.
  rotateSubSelectionTo(rxDeg, ryDeg, rzDeg) {
    const cur = this.subRotation || (this.subRotation = { x: 0, y: 0, z: 0 });
    const target = { x: rxDeg * Math.PI / 180, y: ryDeg * Math.PI / 180, z: rzDeg * Math.PI / 180 };
    this.rotatePivot = this.rotatePivot || this.getSelectionCenter();
    for (const axis of ['x', 'y', 'z']) {
      const delta = target[axis] - cur[axis];
      if (Math.abs(delta) > 1e-6) {
        this.rotateSelection(delta, axis);
        cur[axis] = target[axis];
      }
    }
    this.rotatePivot = null;
  }

  // Manual transform entry from the HUD (object mode only).
  setObjectPosition(x, y, z) {
    const mesh = this.getMesh(this.selection.meshId);
    if (!mesh || mesh.locked) return;
    this.pushUndo();
    this.setObjectPositionLive(x, y, z);
  }
  setObjectRotation(rxDeg, ryDeg, rzDeg) {
    const mesh = this.getMesh(this.selection.meshId);
    if (!mesh || mesh.locked) return;
    this.pushUndo();
    this.setObjectRotationLive(rxDeg, ryDeg, rzDeg);
  }
  setObjectScale(sx, sy, sz) {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked || sel.type !== 'object') return;
    this.pushUndo();
    this.recenterOrigin(mesh);
    mesh.scale.set(Math.max(0.01, sx), Math.max(0.01, sy), Math.max(0.01, sz));
    this.updateObjectTransform(mesh.id);
    refreshTransformHighlights(this);
    this.updateHud();
  }

  // Live-preview transforms for the HUD: apply on each keystroke without
  // pushing undo; the HUD captures a pre-edit snapshot and pushes a single
  // undo step on commit (blur).
  setObjectPositionLive(x, y, z) {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    if (sel.type === 'object') {
      // Move the actual geometry center to the entered coordinates. Setting
      // mesh.position directly moves its origin, which can be far off-center.
      const center = this.getSelectionTransform(mesh.id)?.position;
      if (!center) return;
      mesh.position.add(new THREE.Vector3(x - center[0], y - center[1], z - center[2]));
      this.updateObjectTransform(mesh.id);
    } else {
      const center = this.getSelectionCenter();
      const delta = new THREE.Vector3(x, y, z).sub(center);
      this.translateSelection(delta);
    }
    refreshTransformHighlights(this);
    this.updateHud();
  }
  setObjectRotationLive(rxDeg, ryDeg, rzDeg) {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    if (sel.type === 'object') {
      this.recenterOrigin(mesh);
      mesh.rotation.set(rxDeg * Math.PI / 180, ryDeg * Math.PI / 180, rzDeg * Math.PI / 180);
      this.updateObjectTransform(mesh.id);
    } else {
      this.rotateSubSelectionTo(rxDeg, ryDeg, rzDeg);
    }
    refreshTransformHighlights(this);
    this.updateHud();
  }

  // Per-object Clear Coat toggle. Toggling on may need the glossy lighting boost,
  // so we run the full applyShine (lights + all materials); the single-object
  // rebuild path is reserved for the live intensity slider.
  setObjectClearCoat(enabled) {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || sel.type !== 'object') return;
    this.pushUndo();
    mesh.clearCoatEnabled = !!enabled;
    this.applyShine();
    this.updateHud();
  }

  // Live Clear Coat shine (0–1). No undo per tick (would flood the stack); only
  // rebuilds the selected object's material so the slider stays smooth.
  setObjectClearCoatIntensity(intensity) {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || sel.type !== 'object') return;
    mesh.clearCoatIntensity = Math.max(0, Math.min(1, intensity));
    if (mesh.clearCoatEnabled) this.updateObjectMaterial(mesh.id);
    this.updateHud();
  }

  // Materials mode presets (chrome / matte black / silvery metal / clear coat).
  // Every surface-finish tool (material, texture, paint, reflections) applies to
  // ALL objects in a multi-select group, or to the single selected object.
  targetMeshIds() {
    if (this.isGroupMode()) return [...this.selectedMeshIds];
    return this.selection.meshId ? [this.selection.meshId] : [];
  }

  setMaterialPreset(preset) {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      mesh.material = { preset, intensity: preset === 'clearcoat' ? 0.5 : 1 };
      // Clear manual overrides so the chosen preset's PBR values take effect.
      mesh.roughness = null;
      mesh.metalness = null;
    }
    this.applyShine();
    this.updateHud();
  }

  _setMaterialProp(apply) {
    // One undo step per slider adjustment (batched): material edits are
    // undoable without flooding the stack on every slider tick.
    const now = Date.now();
    if (!this._matUndoAt || now - this._matUndoAt > 1200) this.pushUndo();
    this._matUndoAt = now;
    for (const id of this.targetMeshIds()) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      apply(mesh);
      this.updateObjectMaterial(id);
    }
    this.updateHud();
  }

  setMaterialIntensity(intensity) {
    const v = Math.max(0, Math.min(1, intensity));
    this._setMaterialProp((mesh) => { if (mesh.material) mesh.material.intensity = v; });
  }

  setMaterialRoughness(v) {
    const r = Math.max(0, Math.min(1, v));
    this._setMaterialProp((mesh) => { mesh.roughness = r; });
  }

  setMaterialMetalness(v) {
    const m = Math.max(0, Math.min(1, v));
    this._setMaterialProp((mesh) => { mesh.metalness = m; });
  }

  setMaterialOpacity(v) {
    const o = Math.max(0, Math.min(1, v));
    this._setMaterialProp((mesh) => { mesh.opacity = o; });
  }

  // Clear coat as a standalone slider (0 = off) on every targeted object.
  setMaterialClearCoat(v) {
    const c = Math.max(0, Math.min(1, v));
    this._setMaterialProp((mesh) => { mesh.clearCoatEnabled = c > 0; mesh.clearCoatIntensity = c; });
  }

  // Color tint: hue (0-360) blended into the material color by amount (0-1).
  setMaterialTint(hue, amount) {
    const a = Math.max(0, Math.min(1, amount));
    this._setMaterialProp((mesh) => { mesh.tintHue = hue; mesh.tintAmount = a; });
  }

  setMaterialEmissive(v) {
    const e = Math.max(0, Math.min(1, v));
    this._setMaterialProp((mesh) => { mesh.emissive = e; });
  }

  // "Default" on the Material tab: every material slider back to what a new
  // object starts with (metal, rough, opacity, glow, reflect, blur, clear coat
  // and tint). Color, paint, texture and soft normals are left as they are.
  resetMaterialDefaults() {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return false;
    this._setMaterialProp((mesh) => {
      mesh.roughness = null;
      mesh.metalness = null;
      mesh.opacity = 1;
      mesh.emissive = 0;
      mesh.clearCoatEnabled = false;
      mesh.clearCoatIntensity = 0.5;
      mesh.tintHue = 0;
      mesh.tintAmount = 0;
      mesh.reflectionEnabled = false;
      mesh.reflectionIntensity = 0.6;
      mesh.reflectionRoughness = 0.1;
    });
    for (const id of ids) {
      this._disposeReflectionRig?.(id);
      this.updateObjectMaterial(id);
    }
    this._reflectionDirty = true;
    return true;
  }

  // Texture + paint blending toggle ("Merge with color" in the texture tools).
  setTextureMergeColor(on) {
    this._setMaterialProp((mesh) => { mesh.textureMergeColor = !!on; });
  }

  // "Remove paint": strips all paint from the targeted object(s) — object
  // fill color, face and vertex colors, and brush/spray strokes — back to the
  // default surface. Material and Texture are left untouched.
  clearPaint() {
    this._restorePaintPreview(true);
    const ids = this.targetMeshIds();
    if (ids.length === 0) return false;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      mesh.color = 0xaeb4bc;
      mesh.faceColors = {};
      mesh.vertexColors = {};
      if (mesh.paintLayer) clearPaintLayer(mesh.paintLayer);
      this.rebuildThreeMesh(id);
      this.updateObjectMaterial(id);
    }
    this.updateHud();
    return true;
  }

  setPaintTool(config) { this.paintTool = { ...config }; }

  // Eyedropper: while armed, a tap on the canvas samples the surface color
  // under it and hands it to `onPick` instead of painting or selecting.
  setEyedropper(onPick) { this.eyedropper = onPick || null; this._eyedropDown = null; }

  // The surface's own color at a screen point (not the lit, shaded pixel):
  // brush/spray paint over the face, vertex or object color. '#rrggbb' or null.
  sampleColorAt(clientX, clientY) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    const hit = this.raycastMeshes(x, y)[0];
    if (!hit) return null;
    const mesh = this.getMesh(this.findMeshIdByObject(hit.object));
    if (!mesh) return null;
    const fi = mesh.getFaceIndexFromTriangle(hit.faceIndex);
    const face = mesh.faces[fi];
    if (!face) return null;
    const local = hit.point.clone().applyMatrix4(this.getWorldMatrix(mesh).clone().invert());
    let base = mesh.faceColors[fi];
    if (base == null) {
      // Nearest corner's own color, when this face has vertex colors.
      let best = Infinity;
      for (const vid of face) {
        const c = mesh.vertexColors[vid];
        if (c == null) continue;
        const v = mesh.getVertex(vid);
        const d = (v.x - local.x) ** 2 + (v.y - local.y) ** 2 + (v.z - local.z) ** 2;
        if (d < best) { best = d; base = c; }
      }
    }
    // getHex() gives the color back in sRGB, the same space as the paint layer.
    const baseHex = new THREE.Color(base ?? mesh.color).getHex();
    let r = (baseHex >> 16) & 255, g = (baseHex >> 8) & 255, bl = baseHex & 255;
    const paint = samplePaintLayer(mesh.paintLayer, mesh, fi, local);
    if (paint) {
      r = paint.r * paint.a + r * (1 - paint.a);
      g = paint.g * paint.a + g * (1 - paint.a);
      bl = paint.b * paint.a + bl * (1 - paint.a);
    }
    const hex = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(bl)}`;
  }
  exitPaintMode() { this.endPaintStroke(); this.paintTool = null; }
  endPaintStroke() { finishPaintStroke(this); }
  setSculptTool(config) { this.sculptTool = config ? { ...config } : null; }
  exitSculptMode() { this.sculptTool = null; this.sculptStroke = null; }
  // Dispatch the active sculpt brush (smooth / push / pull) at the stroke's
  // current center. 'move' is handled separately (grab-drag). Push/pull displace
  // vertices along the hit face's local-space normal (pull = outward, push = inward).
  applySculptBrush(mesh, stroke, hit) {
    if (stroke.tool === 'smooth') {
      sculptSmooth(this, mesh, stroke.localCenter, stroke.size, stroke.intensity, stroke.axes);
    } else if (stroke.tool === 'push' || stroke.tool === 'pull') {
      const n = (hit && hit.face && hit.face.normal) ? hit.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      sculptDisplace(this, mesh, stroke.localCenter, n, stroke.size, stroke.intensity, stroke.tool === 'pull' ? 1 : -1, stroke.axes);
    }
  }
  // World-space brush radius → screen pixels at the current orbit distance,
  // used by the on-screen size-preview ring in the Sculpt panel.
  brushSizeToScreenPixels(size) {
    const dist = this.cameraDist;
    const fov = this.camera.fov * Math.PI / 180;
    const vh = this.renderer.domElement.clientHeight || window.innerHeight;
    const worldHeight = 2 * dist * Math.tan(fov / 2);
    return size * (vh / Math.max(1e-6, worldHeight));
  }
  // Brush/spray size (a percentage of the object's apparent size) → screen
  // pixels, so the paint size preview ring matches the real stroke radius.
  paintSizeToScreenPixels(sizePct) {
    const mesh = this.getMesh(this.selection.meshId) || this.meshes[0];
    if (!mesh) return 24;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const wm = this.getWorldMatrix(mesh);
    const pts = [];
    let cx = 0, cy = 0;
    for (const v of mesh.vertices) {
      const sp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm).project(this.camera);
      const sx = (sp.x + 1) * rect.width / 2;
      const sy = (1 - sp.y) * rect.height / 2;
      pts.push([sx, sy]);
      cx += sx; cy += sy;
    }
    const n = pts.length || 1;
    cx /= n; cy /= n;
    let maxDist = 0;
    for (const [sx, sy] of pts) maxDist = Math.max(maxDist, Math.hypot(sx - cx, sy - cy));
    return ((sizePct || 32) / 100) * Math.max(maxDist, 16);
  }
  _restorePaintPreview(clear = false) {
    if (!this._paintPreviewSnapshot) return false;
    const snapshot = this._paintPreviewSnapshot;
    if (clear) this._paintPreviewSnapshot = null;
    this.restoreSnapshot(snapshot);
    for (const mesh of this.meshes) this.updateObjectMaterial(mesh.id);
    return true;
  }
  previewPaintFill(color, opacity) {
    if (!this._paintPreviewSnapshot) this._paintPreviewSnapshot = this.captureSnapshot();
    else this._restorePaintPreview();
    return fillPaintSelection(this, color, opacity, false);
  }
  applyPaintFill(color, opacity) {
    if (this._paintPreviewSnapshot) {
      this.pushUndoSnapshot(this._paintPreviewSnapshot);
      this._paintPreviewSnapshot = null;
      return true;
    }
    return fillPaintSelection(this, color, opacity);
  }
  // Roll the scene back to a snapshot AND re-apply every object's material.
  // Surface tools change material properties live, and rebuilding geometry on
  // its own leaves the old shader values on screen.
  revertToSnapshot(snapshot) {
    if (!snapshot) return false;
    this.restoreSnapshot(snapshot);
    for (const mesh of this.meshes) this.updateObjectMaterial(mesh.id);
    return true;
  }
  cancelPaintPreview() { this._restorePaintPreview(true); }
  hasPaintPreview() { return !!this._paintPreviewSnapshot; }

  // ── Pending paint ──
  // Brush and spray strokes land on the paint layer as you draw, so you can
  // see them, but nothing is committed until Apply. Each finished stroke keeps
  // the pixels it overwrote, in order: Undo can take the last stroke back, X
  // can roll every stroke back, and Apply folds them into one undo step.
  beginPendingPaint() {
    if (this._paintPending) return;
    this._paintPending = { snapshot: this.captureSnapshot(), strokes: [] };
    // New paint invalidates redo, as any other edit does.
    this.redoStack = [];
  }
  hasPendingPaint() { return !!this._paintPending?.strokes.length; }
  _notifyPaintPending() {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('axis-paint-pending'));
  }
  undoPendingStroke() {
    this.endPaintStroke();
    const pending = this._paintPending;
    if (!pending?.strokes.length) return false;
    applyPaintPatches(this, pending.strokes.pop());
    if (!pending.strokes.length) this._dropPendingPaint(pending);
    this._notifyPaintPending();
    return true;
  }
  cancelPendingPaint() {
    this.endPaintStroke();
    const pending = this._paintPending;
    if (!pending) return false;
    for (let i = pending.strokes.length - 1; i >= 0; i--) applyPaintPatches(this, pending.strokes[i]);
    this._dropPendingPaint(pending);
    this._notifyPaintPending();
    return true;
  }
  // A paint layer the pending strokes created from nothing goes too, so the
  // object is left exactly as it was rather than carrying an empty layer.
  _dropPendingPaint(pending) {
    for (const before of pending.snapshot.meshes) {
      const live = this.getMesh(before.id);
      if (!live || before.paintLayer || !live.paintLayer) continue;
      live.paintLayer.texture?.dispose?.();
      live.paintLayer = null;
      this.updateObjectMaterial(live.id);
    }
    this._paintPending = null;
  }
  commitPendingPaint() {
    this.endPaintStroke();
    const pending = this._paintPending;
    if (!pending) return false;
    this._paintPending = null;
    if (!pending.strokes.length) { this._notifyPaintPending(); return false; }
    // The earliest saved pixels of each block are what the batch started from.
    const seen = new Set();
    const before = [];
    for (const stroke of pending.strokes) {
      for (const patch of stroke) {
        const key = `${patch.meshId}:${patch.x}:${patch.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        before.push(patch);
      }
    }
    this.pushUndoSnapshot({ ...pending.snapshot, paintPatches: before });
    this._notifyPaintPending();
    return true;
  }
  paintAt(x, y) { applyPaintAt(this, x, y); }
  applyBevel(options) { bevelEdge(this, options); }

  getMesh(id) { return this.meshes.find(m => m.id === id); }

  removeMesh(id) {
    const idx = this.meshes.findIndex(m => m.id === id);
    if (idx >= 0) this.meshes.splice(idx, 1);
    // Reflection rigs own cube render targets and PMREM resources; release
    // them immediately when their mesh leaves the scene.
    this._disposeReflectionRig?.(id);
    const obj = this.threeObjects.get(id);
    if (obj) {
      this.scene.remove(obj.mesh);
      obj.mesh.geometry.dispose();
      obj.focusDetailGeometry?.dispose();
      obj.material.dispose();
      obj.wireframe.geometry.dispose();
      obj.wireframe.material.dispose();
      this.threeObjects.delete(id);
    }
    this.selectedMeshIds = this.selectedMeshIds.filter((mid) => mid !== id);
  }

  clearScene() {
    for (const mesh of [...this.meshes]) this.removeMesh(mesh.id);
    this.resetSceneLights?.();
    this.selection = { meshId: null, type: 'object', indices: [] };
    this.selectedMeshIds = [];
    this.undoStack = [];
    this.redoStack = [];
    this.updateHighlights();
    this.updateStats();
  }

  getWorldMatrix(mesh) {
    const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
    return new THREE.Matrix4().compose(mesh.position, q, mesh.scale);
  }

  // Vertices that actually contribute to the visible object. Editing tools can
  // leave orphan vertices behind; those must never influence an object's pivot.
  objectPivotVertices(mesh) {
    if (!mesh) return [];
    const ids = new Set();
    for (const face of mesh.faces) for (const id of face) ids.add(id);
    if (ids.size === 0) {
      for (const edge of mesh.explicitEdges || []) { ids.add(edge.v1); ids.add(edge.v2); }
    }
    const used = [];
    for (const id of ids) {
      const v = mesh.getVertex(id);
      if (v) used.push(v);
    }
    return used.length > 0 ? used : mesh.vertices;
  }

  // The point an object spins around: the average of its face centers, the same
  // point used when every one of its faces is selected. (The bounds center can
  // sit in empty space beside bent or lopsided shapes, which made them look like
  // they were orbiting an invisible point.) Local coordinates.
  objectRotationPivot(mesh) {
    const sum = new THREE.Vector3();
    let count = 0;
    for (const face of mesh.faces) {
      let x = 0, y = 0, z = 0, n = 0;
      for (const id of face) {
        const v = mesh.getVertex(id);
        if (!v) continue;
        x += v.x; y += v.y; z += v.z; n++;
      }
      if (n === 0) continue;
      sum.x += x / n; sum.y += y / n; sum.z += z / n; count++;
    }
    if (count > 0) return sum.divideScalar(count);
    const pivotVertices = this.objectPivotVertices(mesh);
    if (pivotVertices.length === 0) return null;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const v of pivotVertices) {
      min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z);
      max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z);
    }
    return min.add(max).multiplyScalar(0.5);
  }

  // Move a mesh's local origin onto its rotation pivot WITHOUT moving the
  // geometry in world space.
  recenterOrigin(mesh) {
    const c = this.objectRotationPivot(mesh);
    if (!c || c.lengthSq() < 1e-12) return;
    for (const v of mesh.vertices) { v.x -= c.x; v.y -= c.y; v.z -= c.z; }
    const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
    mesh.position.add(c.clone().multiply(mesh.scale).applyQuaternion(q));
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    // Re-centering alters local vertex positions, not just the transform.
    // Rebuild the selected local outline once so subsequent transforms can
    // reuse it without ever trailing or drawing from the old origin.
    if (this.selection?.meshId === mesh.id && this.selection.type === 'object') this.updateHighlights(true);
  }

  worldToLocalDelta(mesh, delta) {
    const invQ = new THREE.Quaternion().setFromEuler(mesh.rotation).invert();
    const d = delta.clone().applyQuaternion(invQ);
    d.x /= mesh.scale.x || 1;
    d.y /= mesh.scale.y || 1;
    d.z /= mesh.scale.z || 1;
    return d;
  }

  // === SELECTION ===
  // Selection methods (setSelectionMode, setSelection, clearSelection, raycasting,
  // findClosest*, selectAt*, toggle*, isPointOverSelection, selectInMarquee, …)
  // live in ./sceneSelection and are applied to this class's prototype below.

  // === HIGHLIGHTS ===
  // Appearance modes (materials / texture / paint) hide selection highlights so
  // nothing obstructs the surface while editing its look.
  setHighlightsHidden(hidden) {
    const was = this.highlightsSuppressed;
    this.highlightsSuppressed = !!hidden;
    // Opening an appearance mode leaves nothing on screen saying WHICH object
    // is selected, which makes swapping between objects guesswork. Show the
    // highlight for a moment first, then fade it out of the way.
    if (this.highlightsSuppressed && !was) this.revealSuppressedSelection();
    else if (!this.highlightsSuppressed) this._revealing = false;
    this.updateHighlights();
  }

  // Show a highlight that an appearance mode would otherwise hide, hold it,
  // then fade it away. Called when the mode opens and on every new selection.
  revealSuppressedSelection(hold = 3000, fade = 600) {
    if (!this.highlightsSuppressed) return;
    this._revealHold = hold;
    this._revealFade = fade;
    this._revealStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._revealing = true;
    this.updateHighlights();
  }

  // Per-frame step of that fade. Each highlight keeps its own base opacity, so
  // a face overlay and a wireframe fade from their own starting strengths.
  _updateSelectionReveal() {
    if (!this._revealing) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const hold = this._revealHold ?? 3000;
    const fade = this._revealFade ?? 600;
    const elapsed = now - this._revealStart;
    if (elapsed >= hold + fade) {
      this._revealing = false;
      this.updateHighlights();
      return;
    }
    const k = elapsed <= hold ? 1 : 1 - (elapsed - hold) / fade;
    for (const child of this.highlightGroup.children) {
      const mat = child.material;
      if (!mat) continue;
      if (child.userData.revealBaseOpacity == null) {
        child.userData.revealBaseOpacity = mat.opacity ?? 1;
      }
      mat.transparent = true;
      mat.opacity = child.userData.revealBaseOpacity * k;
    }
  }

  // Appearance modes (materials / texture / paint) hide only the mesh
  // wireframe so color changes are clearly visible; selections stay active
  // and highlighted so tools like paint-fill keep working.
  setWireframesHidden(hidden) {
    this.wireframesHidden = !!hidden;
    for (const obj of this.threeObjects.values()) {
      obj.wireframe.visible = theme.wireframeEnabled !== false && !this.wireframesHidden && !obj.focusProxyGeometry;
      // Imported surfaces remain visible regardless of wireframe visibility.
    }
    this.refreshStaleWireframes();
  }

  _refreshWireframe(obj, mesh) {
    const wireGeo = mesh.toEdgesGeometry();
    replaceFatSegmentPositions(obj.wireframe, Array.from(wireGeo.getAttribute('position').array));
    wireGeo.dispose();
    obj.wireframeStale = false;
  }

  // Bring any wireframe that was skipped while hidden back in sync.
  refreshStaleWireframes() {
    for (const [id, obj] of this.threeObjects) {
      if (!obj.wireframe.visible || !obj.wireframeStale) continue;
      const mesh = this.getMesh(id);
      if (mesh) this._refreshWireframe(obj, mesh);
    }
  }

  // Called when a deforming gesture starts on a heavy mesh: the wireframe and
  // selection highlight stop being regenerated every frame so the drag stays
  // smooth. Controlled by the "Hide detail while editing" setting.
  beginHeavyEdit(meshId) {
    // Live-edit mode is independent of the detail-hiding setting and of mesh
    // size: it only swaps the per-frame geometry rebuild for an in-place buffer
    // write, which looks identical.
    this._liveEdit = true;
    if (!this._liveEditIds) this._liveEditIds = new Set();
    if (this._heavyEdit || !theme.hideDetailWhileEditing) return;
    const mesh = this.getMesh(meshId ?? this.selection.meshId);
    if (!mesh || mesh.getTriangleCount() < HEAVY_EDIT_TRIANGLES) return;
    this._heavyEdit = true;
    for (const obj of this.threeObjects.values()) obj.wireframe.visible = false;
    // Transform-only outlines follow the moving object; do not hide them.
    if (this.selection.type !== 'object' && !this.isGroupMode()) this.highlightGroup.visible = false;
  }

  // Gesture over: put the detail back and rebuild whatever was skipped.
  endHeavyEdit() {
    // Gesture over: leave live-edit mode and do one authoritative full rebuild
    // of every mesh that was updated in place, so nothing can drift.
    if (this._liveEdit) {
      this._liveEdit = false;
      const ids = this._liveEditIds ? [...this._liveEditIds] : [];
      this._liveEditIds?.clear();
      for (const id of ids) this.rebuildThreeMesh(id);
    }
    if (!this._heavyEdit) return;
    this._heavyEdit = false;
    this.highlightGroup.visible = true;
    this.setWireframesHidden(this.wireframesHidden);
    if (this._highlightsStale) {
      this._highlightsStale = false;
      this.updateHighlights();
    }
  }

  updateHighlights(force = false) {
    // Only topology changes (like origin re-centering) force a rebuild during
    // a heavy gesture; object transforms reuse the existing local outline.
    if (this._heavyEdit && !force) { this._highlightsStale = true; return; }
    while (this.highlightGroup.children.length > 0) {
      const child = this.highlightGroup.children[0];
      this.highlightGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    // Surface mode hides object/face highlights so nothing obstructs the
    // surface, but vertex and edge highlights stay visible so a paint target
    // that has no visible fill of its own can still be seen.
    if (this.highlightsSuppressed && !this._revealing) {
      const t = this.selection.type;
      const keep = !this.isGroupMode() && !!this.selection.meshId && (t === 'vertex' || t === 'edge');
      if (!keep) {
        this.cb.onSelectionChange?.(!!this.selection.meshId || this.isGroupMode());
        return;
      }
    }

    const hl = theme.highlightInt;
    // Group (multi-object) highlight: outline every selected object.
    if (this.isGroupMode()) {
      for (const id of this.selectedMeshIds) {
        const mesh = this.getMesh(id);
        if (!mesh) continue;
        const wireGeo = mesh.toEdgesGeometry();
        const wirePositions = Array.from(wireGeo.getAttribute('position').array);
        const wire = makeFatSegments(wirePositions, hl, 2, this.renderer);
        wireGeo.dispose();
        wire.position.copy(mesh.position);
        wire.rotation.copy(mesh.rotation);
        wire.scale.copy(mesh.scale);
        wire.renderOrder = 999;
        wire.userData.axisFollowMeshId = id;
        this.highlightGroup.add(wire);
      }
      this.cb.onSelectionChange?.(true);
      return;
    }

    const sel = this.selection;
    if (!sel.meshId) {
      this.cb.onSelectionChange?.(false);
      return;
    }
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    const wm = this.getWorldMatrix(mesh);

    if (sel.type === 'object') {
      const wireGeo = mesh.toEdgesGeometry();
      const wirePositions = Array.from(wireGeo.getAttribute('position').array);
      const wire = makeFatSegments(wirePositions, hl, 2, this.renderer);
      wireGeo.dispose();
      wire.position.copy(mesh.position);
      wire.rotation.copy(mesh.rotation);
      wire.scale.copy(mesh.scale);
      wire.renderOrder = 999;
      wire.userData.axisFollowMeshId = mesh.id;
      this.highlightGroup.add(wire);
    } else if (sel.type === 'vertex') {
      for (const idx of sel.indices) {
        const v = mesh.vertices[idx];
        if (!v) continue;
        const wp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        // Unit sphere scaled per frame by its distance to the camera, so a
        // selected vertex is always the SAME small dot on screen — a fixed
        // world radius looked tiny when zoomed out and huge when zoomed in.
        const geo = new THREE.SphereGeometry(1, 10, 10);
        const mat = new THREE.MeshBasicMaterial({ color: hl, depthTest: false, toneMapped: false });
        const sph = new THREE.Mesh(geo, mat);
        sph.position.copy(wp);
        sph.renderOrder = 999;
        sph.onBeforeRender = (renderer, scene, camera) => {
          const d = camera.position.distanceTo(sph.position);
          const s = Math.max(1e-4, d * 0.0055);
          sph.scale.set(s, s, s);
          sph.updateMatrixWorld();
        };
        this.highlightGroup.add(sph);
      }
    } else if (sel.type === 'edge') {
      const edges = mesh.getEdges();
      const positions = [];
      for (const idx of sel.indices) {
        const e = edges[idx];
        if (!e) continue;
        const va = mesh.getVertex(e.v1);
        const vb = mesh.getVertex(e.v2);
        const wa = new THREE.Vector3(va.x, va.y, va.z).applyMatrix4(wm);
        const wb = new THREE.Vector3(vb.x, vb.y, vb.z).applyMatrix4(wm);
        positions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
      }
      if (positions.length > 0) {
        const line = makeFatSegments(positions, hl, 2, this.renderer);
        line.renderOrder = 999;
        this.highlightGroup.add(line);
      }
    } else if (sel.type === 'face') {
      // Imported meshes frequently store one visible surface as two or more
      // triangles. Highlight the logical surface, not its hidden tessellation.
      // Only traverse edges the mesh itself classifies as hidden; user-created
      // or visible dividing edges must remain independent and selectable.
      mesh.getEdges(); // ensure the lazy hidden-diagonal classification is current
      const edgeMap = mesh._ensureEdgeFaceMap();
      const hidden = mesh._hiddenEdgeMap();
      const selected = new Set(sel.indices.filter(i => mesh.faces[i]));
      const pending = [...selected];
      while (pending.length) {
        const current = pending.pop();
        const face = mesh.faces[current];
        if (!face) continue;
        for (let j = 0; j < face.length; j++) {
          const a = face[j], b = face[(j + 1) % face.length];
          const key = Math.min(a, b) + ',' + Math.max(a, b);
          const edge = edgeMap.get(key);
          if (!edge || edge.faces.length !== 2) continue;
          const isHidden = hidden.has(key) && mesh._hiddenApplies(hidden.get(key), edge.faces);
          const isImportedDiagonal = mesh.importedWireframeOnly &&
            !mesh.explicitEdges.some(e => Math.min(e.v1, e.v2) === Math.min(a, b) && Math.max(e.v1, e.v2) === Math.max(a, b)) &&
            !mesh._visibleEdgeSet().has(key) &&
            mesh._isConfidentImportedDiagonal(a, b, edge.faces[0], edge.faces[1]);
          if (!isHidden && !isImportedDiagonal) continue;
          const neighbor = edge.faces[0] === current ? edge.faces[1] : edge.faces[0];
          if (!selected.has(neighbor)) { selected.add(neighbor); pending.push(neighbor); }
        }
      }
      const positions = [];
      const borderPositions = [];
      for (const idx of selected) {
        const face = mesh.faces[idx];
        if (!face) continue;
        for (const triangle of mesh.getFaceTriangleIndices(idx)) {
          for (const vi of triangle) {
            const v = mesh.getVertex(face[vi]);
            if (!v) continue;
            const wp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
            positions.push(wp.x, wp.y, wp.z);
          }
        }
        for (let i = 0; i < face.length; i++) {
          const ai = face[i], bi = face[(i + 1) % face.length];
          const key = Math.min(ai, bi) + ',' + Math.max(ai, bi);
          const edge = edgeMap.get(key);
          // An edge between two highlighted triangles is not a border.
          if (edge?.faces.length === 2 && edge.faces.every(fi => selected.has(fi))) continue;
          const a = mesh.getVertex(ai), b = mesh.getVertex(bi);
          if (!a || !b) continue;
          const wa = new THREE.Vector3(a.x, a.y, a.z).applyMatrix4(wm);
          const wb = new THREE.Vector3(b.x, b.y, b.z).applyMatrix4(wm);
          borderPositions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
        }
      }
      if (positions.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        const faceColor = new THREE.Color(hl).lerp(new THREE.Color(0xffffff), 0.55);
        const mat = new THREE.MeshBasicMaterial({ color: faceColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false });
        const fill = new THREE.Mesh(geo, mat);
        fill.renderOrder = 998;
        this.highlightGroup.add(fill);
      }
      if (borderPositions.length) {
        const border = makeFatSegments(borderPositions, hl, 2.25, this.renderer);
        border.material.depthTest = false;
        border.renderOrder = 999;
        this.highlightGroup.add(border);
      }
    }

    this.cb.onSelectionChange?.(true);
  }

  // === MANIPULATION ===
  refreshInteractionFeedback() {
    // Selected object/group outlines reuse local edges and follow the actual
    // mesh transform. Rebuilding dense line geometry per touch caused trails.
    if (this.selection.type === 'object' || this.isGroupMode()) {
      syncObjectHighlightTransforms(this);
    } else if (!this._liveEdit || this.selection.type === 'face') {
      // Face highlights follow their edited vertices in the same event.
      this._interactionHighlightsDirty = false;
      this.updateHighlights();
      this.updateHud();
      return;
    } else {
      // Edge/vertex highlights refresh BEFORE the next render, rather than in
      // a competing RAF that can occur after the render loop.
      this._interactionHighlightsDirty = true;
    }
    if (!this._liveEdit) { this.updateHud(); return; }
    if (this._interactionFeedbackRaf) return;
    this._interactionFeedbackRaf = requestAnimationFrame(() => {
      this._interactionFeedbackRaf = null;
      this.updateHud();
    });
  }

  getSelectionCenter() {
    if (this.isGroupMode()) return this.getGroupCenter() || this.cameraTarget.clone();
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return this.cameraTarget.clone();
    const wm = this.getWorldMatrix(mesh);
    if (sel.type === 'object') {
      const pivotVertices = this.objectPivotVertices(mesh);
      if (pivotVertices.length === 0) return mesh.position.clone();
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const v of pivotVertices) {
        min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z);
        max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z);
      }
      return min.add(max).multiplyScalar(0.5).applyMatrix4(wm);
    }
    const center = new THREE.Vector3();
    let count = 0;
    if (sel.type === 'vertex') {
      for (const idx of sel.indices) {
        const v = mesh.vertices[idx];
        if (v) { center.add(new THREE.Vector3(v.x, v.y, v.z)); count++; }
      }
    } else if (sel.type === 'edge') {
      for (const idx of sel.indices) {
        center.add(mesh.getEdgeCenter(idx)); count++;
      }
    } else if (sel.type === 'face') {
      for (const idx of sel.indices) {
        center.add(mesh.getFaceCenter(idx)); count++;
      }
    }
    if (count === 0) return mesh.position.clone();
    return center.divideScalar(count).applyMatrix4(wm);
  }

  getSelectedVertexIds() {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return [];
    const ids = new Set();
    if (sel.type === 'vertex') {
      for (const idx of sel.indices) {
        const v = mesh.vertices[idx];
        if (v) ids.add(v.id);
      }
    } else if (sel.type === 'edge') {
      for (const idx of sel.indices) {
        const [a, b] = mesh.getEdgeVertexIds(idx);
        ids.add(a); ids.add(b);
      }
    } else if (sel.type === 'face') {
      for (const idx of sel.indices) {
        for (const vid of mesh.getFaceVertexIds(idx)) ids.add(vid);
      }
    }
    return Array.from(ids);
  }

  snapCorrection(center) {
    // Snapping is independent of whether the visual grid is shown.
    if (!theme.snapToGrid) return new THREE.Vector3();
    // Snap distance is the movement increment, not a tolerance around grid lines.
    const spacing = Number(theme.snapDistance);
    if (!(spacing > 0)) return new THREE.Vector3();
    const correction = new THREE.Vector3();
    for (const axis of ['x', 'y', 'z']) {
      const nearest = Math.round(center[axis] / spacing) * spacing;
      correction[axis] = nearest - center[axis];
    }
    return correction;
  }

  translateSelection(worldDelta) {
    if (this.isGroupMode()) { this.translateGroup(worldDelta); return; }
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    if (sel.type === 'object') {
      mesh.position.add(worldDelta);
      if (theme.snapToGrid) mesh.position.add(this.snapCorrection(this.getSelectionCenter()));
      this.updateObjectTransform(mesh.id);
    } else {
      mesh.lockTriangulationDiagonals();
      const vids = this.getSelectedVertexIds();
      mesh.translateVertexIds(vids, this.worldToLocalDelta(mesh, worldDelta));
      const correction = this.snapCorrection(this.getSelectionCenter());
      if (correction.lengthSq() > 0) mesh.translateVertexIds(vids, this.worldToLocalDelta(mesh, correction));
      mesh.invalidateCache();
      this.rebuildThreeMesh(mesh.id);
    }
    this.refreshInteractionFeedback();
  }

  translateGroup(worldDelta) {
    const movable = this.selectedMeshIds.map((id) => this.getMesh(id)).filter((m) => m && !m.locked);
    for (const m of movable) m.position.add(worldDelta);
    const correction = this.snapCorrection(this.getGroupCenter());
    for (const m of movable) {
      m.position.add(correction);
      this.updateObjectTransform(m.id);
    }
    this.refreshInteractionFeedback();
  }

  // After a scale, nudge the selection so its size lands on a whole grid step
  // (only when already within the snap distance). The guard keeps the corrective
  // pass from snapping itself.
  applyScaleSnap(axis) {
    if (this._snappingScale) return;
    const f = axis ? axisScaleSnapFactor(this, axis) : uniformScaleSnapFactor(this);
    if (!f || Math.abs(f - 1) < 1e-6) return;
    this._snappingScale = true;
    if (axis) this.scaleSelectionAxis(axis, f);
    else this.scaleSelection(f);
    this._snappingScale = false;
  }

  scaleSelection(factor) {
    if (this.isGroupMode()) { this.scaleGroup(factor); return; }
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    if (sel.type === 'object') {
      // Scale around the object's own center, not its local origin.
      this.recenterOrigin(mesh);
      // Unlimited: no floor or ceiling on the scale.
      mesh.scale.multiplyScalar(factor);
      this.updateObjectTransform(mesh.id);
    } else {
      const center = this.getSelectionCenter();
      mesh.lockTriangulationDiagonals();
      const wm = this.getWorldMatrix(mesh);
      const vids = this.getSelectedVertexIds();
      for (const vid of vids) {
        const v = mesh.getVertex(vid);
        const vWorld = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        const fromCenter = vWorld.clone().sub(center);
        const newWorld = center.clone().add(fromCenter.multiplyScalar(factor));
        const localOffset = this.worldToLocalDelta(mesh, newWorld.clone().sub(vWorld));
        v.x += localOffset.x; v.y += localOffset.y; v.z += localOffset.z;
      }
      mesh.invalidateCache();
      this.rebuildThreeMesh(mesh.id);
    }
    this.applyScaleSnap(null);
    refreshTransformHighlights(this);
    this.updateHud();
  }

  scaleGroup(factor) {
    const center = this.getGroupCenter();
    if (!center) return;
    for (const id of this.selectedMeshIds) {
      const m = this.getMesh(id);
      if (!m || m.locked) continue;
      const offset = m.position.clone().sub(center).multiplyScalar(factor);
      m.position.copy(center).add(offset);
      m.scale.multiplyScalar(factor);
      this.updateObjectTransform(id);
    }
    this.applyScaleSnap(null);
    refreshTransformHighlights(this);
    this.updateHud();
  }

  // Stretch every multi-selected object along one WORLD axis about the group
  // center: positions spread along it, and each object scales along whichever
  // of its own axes points closest to it (so a rotated object still stretches
  // the way the drag goes instead of along an unrelated side).
  scaleGroupAxis(axis, factor) {
    const center = this.getGroupCenter();
    if (!center) return;
    const worldAxis = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    for (const id of this.selectedMeshIds) {
      const m = this.getMesh(id);
      if (!m || m.locked) continue;
      const offset = m.position.clone().sub(center);
      offset[axis] *= factor;
      m.position.copy(center).add(offset);
      const q = new THREE.Quaternion().setFromEuler(m.rotation);
      let localAxis = axis, best = -1;
      for (const [k, dir] of [['x', new THREE.Vector3(1, 0, 0)], ['y', new THREE.Vector3(0, 1, 0)], ['z', new THREE.Vector3(0, 0, 1)]]) {
        const align = Math.abs(dir.applyQuaternion(q).dot(worldAxis));
        if (align > best) { best = align; localAxis = k; }
      }
      m.scale[localAxis] = Math.max(0.01, m.scale[localAxis] * factor);
      this.updateObjectTransform(id);
    }
    refreshTransformHighlights(this);
    this.updateHud();
  }

  rotateGroupAxis(angle, axis) {
    const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0)
      : axis === 'y' ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    this.rotateGroupAroundAxis(angle, axisVec);
  }

  rotateSelection(angle, axis) {
    angle = snapAngleDelta(this, angle);
    if (angle === 0) return;
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    if (sel.type === 'object') {
      // Pivot around the object's own center, not its local origin.
      this.recenterOrigin(mesh);
      mesh.rotation[axis] += angle;
      this.updateObjectTransform(mesh.id);
    } else {
      const center = this.rotatePivot || this.getSelectionCenter();
      mesh.lockFaceRenderTriangles(); mesh.lockTriangulationDiagonals();
      const wm = this.getWorldMatrix(mesh);
      const vids = this.getSelectedVertexIds();
      const rotAxis = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      const q = new THREE.Quaternion().setFromAxisAngle(rotAxis, angle);
      for (const vid of vids) {
        const v = mesh.getVertex(vid);
        const vWorld = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        const offset = vWorld.clone().sub(center);
        offset.applyQuaternion(q);
        const newWorld = center.clone().add(offset);
        const delta = this.worldToLocalDelta(mesh, newWorld.clone().sub(vWorld));
        v.x += delta.x; v.y += delta.y; v.z += delta.z;
      }
      mesh.invalidateCache();
      this.rebuildThreeMesh(mesh.id);
    }
    refreshTransformHighlights(this);
    this.updateHud();
  }

  scaleSelectionAxis(axis, factor) {
    if (this.isGroupMode()) { this.scaleGroupAxis(axis, factor); return; }
    const sel = this.selection;
    if (!sel) return;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    if (sel.type === 'object') {
      // Scale around the object's own center, not its local origin.
      this.recenterOrigin(mesh);
      // Unlimited: no floor or ceiling on the scale.
      mesh.scale[axis] = mesh.scale[axis] * factor;
      this.updateObjectTransform(mesh.id);
    } else {
      const center = this.getSelectionCenter();
      mesh.lockTriangulationDiagonals();
      const wm = this.getWorldMatrix(mesh);
      const vids = this.getSelectedVertexIds();
      for (const vid of vids) {
        const v = mesh.getVertex(vid);
        const vWorld = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        const fromCenter = vWorld.clone().sub(center);
        fromCenter[axis] *= factor;
        const newWorld = center.clone().add(fromCenter);
        const delta = this.worldToLocalDelta(mesh, newWorld.clone().sub(vWorld));
        v.x += delta.x; v.y += delta.y; v.z += delta.z;
      }
      mesh.invalidateCache();
      this.rebuildThreeMesh(mesh.id);
    }
    this.applyScaleSnap(axis);
    refreshTransformHighlights(this);
    this.updateHud();
  }

  rotateSelectionAroundAxis(angle, axisVec) {
    angle = snapAngleDelta(this, angle);
    if (angle === 0) return;
    if (this.isGroupMode()) { this.rotateGroupAroundAxis(angle, axisVec); return; }
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh || mesh.locked) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axisVec.clone().normalize(), angle);
    if (sel.type === 'object') {
      // Pivot around the object's own center, not its local origin.
      this.recenterOrigin(mesh);
      const curQ = new THREE.Quaternion().setFromEuler(mesh.rotation);
      curQ.premultiply(q);
      mesh.rotation.setFromQuaternion(curQ);
      this.updateObjectTransform(mesh.id);
    } else {
      // Pivot stays pinned to where the selection was when the gesture started,
      // so a sub-object rotation can never drift off its own center.
      const center = this.rotatePivot || this.getSelectionCenter();
      mesh.lockFaceRenderTriangles(); mesh.lockTriangulationDiagonals();
      const wm = this.getWorldMatrix(mesh);
      // A face can share positions with separately indexed wall vertices.
      // Rotate those coincident seam vertices together to prevent visible gaps.
      const selectedIds = this.getSelectedVertexIds();
      const positions = selectedIds.map(id => mesh.getVertex(id)).filter(Boolean)
        .map(v => ({ x: v.x, y: v.y, z: v.z }));
      const vids = new Set(selectedIds);
      if (sel.type === 'face' && positions.length) {
        const epsilon = 1e-7;
        for (const v of mesh.vertices) {
          if (positions.some(p => Math.abs(v.x - p.x) <= epsilon &&
            Math.abs(v.y - p.y) <= epsilon &&
            Math.abs(v.z - p.z) <= epsilon)) vids.add(v.id);
        }
      }
      for (const vid of vids) {
        const v = mesh.getVertex(vid);
        const vWorld = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
        const offset = vWorld.clone().sub(center);
        offset.applyQuaternion(q);
        const newWorld = center.clone().add(offset);
        const delta = this.worldToLocalDelta(mesh, newWorld.clone().sub(vWorld));
        v.x += delta.x; v.y += delta.y; v.z += delta.z;
      }
      mesh.invalidateCache();
      this.rebuildThreeMesh(mesh.id);
    }
    refreshTransformHighlights(this);
    this.updateHud();
  }

  rotateGroupAroundAxis(angle, axisVec) {
    const center = this.getGroupCenter();
    if (!center) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axisVec.clone().normalize(), angle);
    for (const id of this.selectedMeshIds) {
      const m = this.getMesh(id);
      if (!m || m.locked) continue;
      const offset = m.position.clone().sub(center);
      offset.applyQuaternion(q);
      m.position.copy(center).add(offset);
      const curQ = new THREE.Quaternion().setFromEuler(m.rotation);
      curQ.premultiply(q);
      m.rotation.setFromQuaternion(curQ);
      this.updateObjectTransform(id);
    }
    refreshTransformHighlights(this);
    this.updateHud();
  }

  screenToWorldDrag(startX, startY, curX, curY, worldPoint) {
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.negate(), worldPoint);
    const startWorld = this.rayToPlane(startX, startY, plane);
    const curWorld = this.rayToPlane(curX, curY, plane);
    if (!startWorld || !curWorld) return new THREE.Vector3();
    return curWorld.sub(startWorld);
  }

  rayToPlane(clientX, clientY, plane) {
    const { x, y } = this.screenToNDC(clientX, clientY);
    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(plane, point);
    return hit ? point : null;
  }

  // Undo/lock/transform helpers live in ./sceneUndo (applied below).

  // === TOOLS ===
  executeTool(toolId, options = {}) {
    // These interactive tools acquire their targets from the canvas AFTER
    // activation. An edge selected for an earlier operation must not remain
    // highlighted when one of them starts. Preserve selections for tools
    // that actually consume preselected edges (bevel, bridge, extrude, etc.).
    const canvasTargetTools = new Set(['cut_loop', 'draw_cut', 'draw_face', 'add_vertex']);
    if (canvasTargetTools.has(toolId) && this.selection?.type === 'edge' && this.selection.indices?.length) {
      this.clearSelection();
    }
    this._runTool(toolId, options);
    // Multi-select is a staging mode: once a tool acts on the group it closes.
    // Selection tools (select loop/ring/shell) only change what's selected, so
    // they leave the mode open.
    if (this.multiSelect && !toolId.startsWith('select_')) this.exitMultiSelect();
  }

  _runTool(toolId, options = {}) {
    const sel = this.selection;
    if (this.extrudeDrag && toolId !== 'extrude') this.commitExtrudeDrag();
    if (toolId !== 'draw_face' && toolId !== 'draw_cut' && this.drawMode) this.exitDrawMode();
    if (toolId !== 'cut_loop' && toolId !== 'draw_cut' && this.cutMode) this.exitCutMode();
    switch (toolId) {
      case 'delete': this.deleteSelection(); break;
      case 'clone':
        if (sel.type === 'face') cloneFaces(this);
        else this.cloneSelection();
        break;
      case 'extrude':
        if (sel.type === 'edge') this.beginEdgeExtrudeDrag();
        else this.beginExtrudeDrag();
        break;
      case 'merge': if (sel.type === 'vertex') this.mergeVertices(); else this.mergeCloseVertices(); break;
      case 'mirror': this.mirrorSelection(); break;
      case 'smooth': this.smoothMesh(); break;
      case 'lock': this.lockSelection(); break;
      case 'combine': this.combineMeshes(); break;
      case 'subtract': subtractSelection(this); break;
      case 'union': unionSelection(this); break;
      case 'intersect': intersectSelection(this); break;
      case 'separate': separateMeshTool(this); break;
      case 'soft_normals': toggleSmoothShading(this); break;
      case 'create_face': createFaceFromVertices(this); break;
      case 'target_merge': targetMergeVertices(this); break;
      case 'connect': connectVertices(this); break;
      case 'divide': this.subdivideMesh(); break;
      case 'detach': detachFaces(this); break;
      case 'split': splitEdge(this); break;
      case 'add_vertex': this.clearSelection(); this.enterAddVertexMode(); break;
      case 'bevel': bevelEdge(this); break;
      case 'dissolve': dissolveSelection(this); break;
      case 'select_loop': selectLoop(this, options); break;
      case 'select_ring': selectRing(this, options); break;
      case 'create_face_border': createFaceFromBorder(this); break;
      case 'bridge': bridgeSelection(this); break;
      case 'cut_loop': this.enterCutMode('loop'); break;
      case 'draw_cut': this.enterCutMode('draw'); break;
      case 'draw_face': this.enterDrawMode('face'); break;
      default: break;
    }
  }

  // Draw face sessions, previews and confirmation live in ./sceneDrawFace.

  deleteSelection() {
    const sel = this.selection;
    if (!sel.meshId) return;
    // Group delete: remove every selected object.
    if (this.isGroupMode()) {
      this.pushUndo();
      for (const id of [...this.selectedMeshIds]) this.removeMesh(id);
      this.selectedMeshIds = [];
      this.selection = { meshId: null, type: 'object', indices: [] };
      this.updateHighlights();
      this.updateStats();
      return;
    }
    this.pushUndo();
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    if (sel.type === 'object') {
      this.removeMesh(sel.meshId);
      this.clearSelection();
    } else if (sel.type === 'face') {
      for (const fi of [...sel.indices].sort((a, b) => b - a)) removeFaceByIndex(mesh, fi);
      cleanupCommittedTopology(mesh);
      if (!mesh.faces.length) this.removeMesh(mesh.id);
      else this.rebuildThreeMesh(mesh.id);
      this.clearSelection();
    } else if (sel.type === 'vertex') {
      const toDelete = new Set(sel.indices.map(i => mesh.vertices[i]?.id).filter(id => id != null));
      // Removing a vertex invalidates its incident faces. Sweep the remaining
      // topology so no loose verts or edges survive.
      for (let fi = mesh.faces.length - 1; fi >= 0; fi--) {
        if (mesh.faces[fi].some(id => toDelete.has(id))) removeFaceByIndex(mesh, fi);
      }
      cleanupCommittedTopology(mesh);
      if (!mesh.faces.length) this.removeMesh(mesh.id);
      else this.rebuildThreeMesh(mesh.id);
      this.clearSelection();
    } else if (sel.type === 'edge') {
      // Edges are FACE BORDERS, not independent drawable lines.
      const edges = mesh.getEdges();
      const selected = sel.indices.map(i => edges[i]).filter(Boolean);
      // Only DIVIDING edges are deleted, and their two faces merge into one.
      // Face borders (open edges, edges where faces meet at an angle) stay.
      const selectedKeys = [...new Set(selected.map(e =>
        `${Math.min(e.v1, e.v2)},${Math.max(e.v1, e.v2)}`))];
      // A merge changes face indices and can make another selected edge
      // mergeable. Retry pending edges until a complete pass makes no progress.
      const pending = new Set(selectedKeys);
      let changed = false;
      let progress;
      do {
        progress = false;
        for (const key of [...pending]) {
          const [a, b] = key.split(',').map(Number);
          const adjacent = adjacentFacesForBoundary(mesh, a, b).length;
          // Already removed as part of a longer dividing line merged earlier.
          if (adjacent === 0) { pending.delete(key); continue; }
          if (adjacent !== 2) continue;
          if (!dissolveSharedBoundary(mesh, a, b, { requireDivider: true })) continue;
          pending.delete(key);
          progress = true;
          changed = true;
        }
      } while (progress && pending.size);
      if (changed) {
        resolveLegacyDeletedBorders(mesh);
        cleanupCommittedTopology(mesh);
        this.rebuildThreeMesh(mesh.id);
      }
      // A rejected dissolve must not pretend that deletion succeeded.
      // Keep the selected edges available for a different operation.
      if (pending.size) {
        const remaining = mesh.getEdges();
        const indices = remaining.map((edge, i) =>
          pending.has(`${Math.min(edge.v1, edge.v2)},${Math.max(edge.v1, edge.v2)}`) ? i : -1
        ).filter(i => i >= 0);
        if (indices.length) {
          this.selection = { meshId: mesh.id, type: 'edge', indices };
          this.updateHighlights?.();
        } else this.clearSelection();
      } else this.clearSelection();
    }
    this.updateStats();
  }

  cloneSelection() { cloneObjects(this); }

  changeSegments(segX, segY, segZ, primitiveParams = null) {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'object') return;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    if (!mesh.primitiveType) {
      segmentEditedMesh(mesh, { x: segX, y: segY, z: segZ });
      this.rebuildThreeMesh(mesh.id);
      this.updateHighlights();
      this.updateStats();
      return;
    }
    const newMesh = createPrimitiveSegments(mesh.primitiveType, segX, segY, segZ, primitiveParams || mesh.primitiveParams || {});
    newMesh.id = mesh.id;
    newMesh.name = mesh.name;
    newMesh.position.copy(mesh.position);
    newMesh.rotation.copy(mesh.rotation);
    newMesh.scale.copy(mesh.scale);
    newMesh.visible = mesh.visible;
    newMesh.locked = mesh.locked;
    newMesh.color = mesh.color;

    // Segment changes replace topology, but they must not silently reset
    // topology-independent surface appearance.
    newMesh.smoothShading = mesh.smoothShading;
    newMesh.clearCoatEnabled = mesh.clearCoatEnabled;
    newMesh.clearCoatIntensity = mesh.clearCoatIntensity;
    newMesh.material = mesh.material ? { ...mesh.material } : null;
    newMesh.mapTexture = mesh.mapTexture || null;
    newMesh.textureUrl = mesh.textureUrl || null;
    newMesh.textureTransform = { ...mesh.textureTransform };
    newMesh.uvMode = mesh.uvMode;
    newMesh.reflectionEnabled = mesh.reflectionEnabled;
    newMesh.reflectionIntensity = mesh.reflectionIntensity;
    newMesh.reflectionRoughness = mesh.reflectionRoughness;
    newMesh.roughness = mesh.roughness;
    newMesh.metalness = mesh.metalness;
    newMesh.opacity = mesh.opacity;
    newMesh.emissive = mesh.emissive;
    newMesh.tintHue = mesh.tintHue;
    newMesh.tintAmount = mesh.tintAmount;
    newMesh.textureMergeColor = mesh.textureMergeColor;
    // Paint atlas UVs are projection-based and remain valid for the rebuilt
    // primitive. Vertex/face colors and paintWireEdges are intentionally not
    // copied because their IDs/indices belong to the old topology.
    newMesh.paintLayer = mesh.paintLayer;

    const idx = this.meshes.findIndex(m => m.id === sel.meshId);
    if (idx >= 0) this.meshes[idx] = newMesh;
    // Full rebuild: dispose the old three object entirely and build a fresh one
    // from the new segment geometry, so nothing from the previous segmentation
    // (buffers, wireframe, material) carries over.
    const old = this.threeObjects.get(newMesh.id);
    if (old) {
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.material.dispose();
      old.wireframe.geometry.dispose();
      old.wireframe.material.dispose();
      this.threeObjects.delete(newMesh.id);
    }
    newMesh.invalidateCache();
    this.buildThreeMesh(newMesh);
    if (newMesh.reflectionEnabled) this._reflectionDirty = true;
    this.updateHighlights();
    this.updateStats();
  }

  extrudeSelection() {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'face' || sel.indices.length === 0) return;
    this.pushUndo();
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    const offset = 0.5;
    const ek = edgeKey;
    const selSet = new Set(sel.indices);
    // Edges among the selected faces only.
    const edgeFaces = new Map();
    for (const fi of sel.indices) {
      const f = mesh.faces[fi];
      for (let j = 0; j < f.length; j++) {
        const k = ek(f[j], f[(j + 1) % f.length]);
        if (!edgeFaces.has(k)) edgeFaces.set(k, []);
        edgeFaces.get(k).push(fi);
      }
    }
    // Group selected faces into coplanar connected components so a quad (two
    // coplanar tris) extrudes as one flat cap with clean side walls — no ridge
    // down the diagonal.
    const visited = new Set();
    const groups = [];
    for (const fi of sel.indices) {
      if (visited.has(fi)) continue;
      const stack = [fi];
      const group = [];
      while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        group.push(cur);
        const f = mesh.faces[cur];
        for (let j = 0; j < f.length; j++) {
          const k = ek(f[j], f[(j + 1) % f.length]);
          for (const n of edgeFaces.get(k) || []) {
            if (!visited.has(n) && Math.abs(mesh.getFaceNormal(cur).dot(mesh.getFaceNormal(n))) > 0.9995) stack.push(n);
          }
        }
      }
      groups.push(group);
    }

    const newCapFaces = [];
    const newSideFaces = [];
    const newVid = () => Date.now() + Math.floor(Math.random() * 1e6);
    for (const group of groups) {
      const groupSet = new Set(group);
      let n = new THREE.Vector3();
      const referenceNormal = mesh.getFaceNormal(group[0]).clone();
      for (const fi of group) {
        const faceNormal = mesh.getFaceNormal(fi).clone();
        if (faceNormal.dot(referenceNormal) < 0) faceNormal.negate();
        n.add(faceNormal);
      }
      n.normalize();
      // Boundary edges (exactly one selected face in the group), winding a→b.
      const boundary = [];
      for (const fi of group) {
        const f = mesh.faces[fi];
        for (let j = 0; j < f.length; j++) {
          const a = f[j], b = f[(j + 1) % f.length];
          const adj = (edgeFaces.get(ek(a, b)) || []).filter(x => groupSet.has(x));
          if (adj.length === 1) boundary.push({ a, b });
        }
      }
      // Duplicate the group's vertices, offset along the normal.
      const usedVids = new Set();
      for (const fi of group) for (const vid of mesh.faces[fi]) usedVids.add(vid);
      const oldToNew = new Map();
      for (const vid of usedVids) {
        const v = mesh.getVertex(vid);
        const nv = { id: newVid(), x: v.x + n.x * offset, y: v.y + n.y * offset, z: v.z + n.z * offset };
        mesh.vertices.push(nv);
        oldToNew.set(vid, nv.id);
      }
      // New cap (same winding, new vertices).
      for (const fi of group) {
        newCapFaces.push(mesh.faces[fi].map(vid => oldToNew.get(vid)));
      }
      // Outward side walls along the boundary.
      for (const { a, b } of boundary) {
        const na = oldToNew.get(a), nb = oldToNew.get(b);
        newSideFaces.push([a, b, nb]);
        newSideFaces.push([a, nb, na]);
      }
    }

    mesh.faces = mesh.faces.filter((_, i) => !selSet.has(i));
    const base = mesh.faces.length;
    for (const f of newCapFaces) mesh.faces.push(f);
    const capCount = newCapFaces.length;
    for (const f of newSideFaces) mesh.faces.push(f);
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    const capIndices = [];
    for (let i = 0; i < capCount; i++) capIndices.push(base + i);
    this.setSelection({ meshId: sel.meshId, type: 'face', indices: capIndices });
    this.updateStats();
  }

  // Interactive extrude helpers live in ./sceneExtrude (applied below).

  mergeVertices() {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'vertex' || sel.indices.length < 2) return;
    this.pushUndo();
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    const vids = sel.indices.map(i => mesh.vertices[i]?.id).filter(Boolean);
    const target = vids[0];
    const toMerge = new Set(vids.slice(1));
    const center = new THREE.Vector3();
    for (const vid of vids) {
      const v = mesh.getVertex(vid);
      center.add(new THREE.Vector3(v.x, v.y, v.z));
    }
    center.divideScalar(vids.length);
    const tv = mesh.getVertex(target);
    tv.x = center.x; tv.y = center.y; tv.z = center.z;
    for (const face of mesh.faces) {
      for (let i = 0; i < face.length; i++) {
        if (toMerge.has(face[i])) face[i] = target;
      }
    }
    for (const ex of mesh.explicitEdges) {
      if (toMerge.has(ex.v1)) ex.v1 = target;
      if (toMerge.has(ex.v2)) ex.v2 = target;
    }
    mesh.explicitEdges = mesh.explicitEdges.filter(e => e.v1 !== e.v2);
    mesh.faces = mesh.faces
      .map((face) => face.filter((id, i) => id !== face[(i + face.length - 1) % face.length]))
      .filter((face) => face.length >= 3 && new Set(face).size === face.length);
    mesh.vertices = mesh.vertices.filter(v => !toMerge.has(v.id));
    resolveLegacyDeletedBorders(mesh);
    cleanupCommittedTopology(mesh);
    if (!mesh.faces.length) this.removeMesh(mesh.id);
    else this.rebuildThreeMesh(mesh.id);
    this.clearSelection();
  }

  // Object-mode Merge vertices: any vertices within 2 screen pixels of each
  // other (at the object's current distance from the camera) are merged.
  mergeCloseVertices(pixels = 2) {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'object') return;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    const wm = this.getWorldMatrix(mesh);
    const center = new THREE.Vector3().applyMatrix4(wm);
    const dist = this.camera.position.distanceTo(center);
    const fov = this.camera.fov * Math.PI / 180;
    const vh = this.renderer.domElement.clientHeight || window.innerHeight;
    const worldPerPixel = (2 * dist * Math.tan(fov / 2)) / Math.max(1, vh);
    const scale = new THREE.Vector3().setFromMatrixScale(wm);
    const localPerWorld = 1 / Math.max(1e-6, Math.max(scale.x, scale.y, scale.z));
    const threshold = pixels * worldPerPixel * localPerWorld;
    const snapshot = this.captureSnapshot();
    if (!mergeVerticesWithin(mesh, threshold)) return;
    resolveLegacyDeletedBorders(mesh);
    cleanupCommittedTopology(mesh);
    this.pushUndoSnapshot(snapshot);
    if (!mesh.faces.length) { this.removeMesh(mesh.id); this.clearSelection(); return; }
    this.rebuildThreeMesh(mesh.id);
    this.setSelection({ meshId: mesh.id, type: 'object', indices: [] });
    this.updateStats();
  }

  // Mirror on a true world axis. Of X/Y/Z, use whichever axis currently
  // projects closest to screen-horizontal, then negate that world coordinate
  // across the scene origin (X→-X, Y→-Y, or Z→-Z). Camera orientation chooses
  // the axis only; it never becomes an arbitrary mirror plane or pivot.
  mirrorSelection() {
    const sel = this.selection;
    if (!sel.meshId || sel.type !== 'object') return;
    const group = this.isGroupMode();
    const sources = (group ? [...this.selectedMeshIds] : [sel.meshId])
      .map((id) => this.getMesh(id)).filter(Boolean);
    if (!sources.length) return;
    this.pushUndo();

    const worldAxes = {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
    };
    const worldToCamera = this.camera.quaternion.clone().invert();
    let mirrorAxis = 'x';
    let horizontalScore = -1;
    for (const [axis, direction] of Object.entries(worldAxes)) {
      const screenDirection = direction.clone().applyQuaternion(worldToCamera);
      const visibleLength = Math.hypot(screenDirection.x, screenDirection.y);
      const score = visibleLength > 1e-8 ? Math.abs(screenDirection.x) / visibleLength : -1;
      if (score > horizontalScore) {
        horizontalScore = score;
        mirrorAxis = axis;
      }
    }

    const cloneIds = [];
    let nextId = Date.now();
    const usedIds = new Set(this.meshes.map((mesh) => mesh.id));
    for (const mesh of sources) {
      const clone = mesh.clone();
      while (usedIds.has(nextId)) nextId++;
      clone.id = nextId++;
      usedIds.add(clone.id);
      clone.paintLayer = clonePaintLayer(mesh.paintLayer);
      clone.name = mesh.name + ' mirror';
      const sourceWorld = this.getWorldMatrix(mesh);
      for (const v of clone.vertices) {
        const world = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(sourceWorld);
        world[mirrorAxis] = -world[mirrorAxis];
        v.x = world.x; v.y = world.y; v.z = world.z;
      }
      clone.faces = clone.faces.map((face) => [...face].reverse());
      // Saved render triangles (bent / deformed faces) carry their own winding.
      // Reflecting flips it, so they must be reversed together with the faces
      // or those faces render inside-out.
      clone.faceRenderTriangles = Object.fromEntries(
        Object.entries(clone.faceRenderTriangles || {})
          .map(([fi, tris]) => [fi, tris.map((tri) => [...tri].reverse())]));
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.invalidateCache();
      this.meshes.push(clone);
      this.buildThreeMesh(clone);
      cloneIds.push(clone.id);
    }
    if (group) {
      this.selectedMeshIds = cloneIds;
      this.selection = { meshId: cloneIds[0], type: 'object', indices: [] };
      this.updateHighlights();
      this.updateStats();
    } else {
      this.setSelection({ meshId: cloneIds[0], type: 'object', indices: [] });
    }
  }

  smoothMesh() {
    const sel = this.selection;
    if (!sel.meshId) return;
    this.pushUndo();
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    // Primitives carry split (duplicated) corner vertices for flat shading, so
    // without welding each corner only "sees" its own face and smoothing tears
    // the mesh apart at every edge. Weld first so neighbours are real.
    weldCoincidentVertices(mesh);
    mesh.lockTriangulationDiagonals();
    const adj = new Map();
    for (const v of mesh.vertices) adj.set(v.id, []);
    for (const face of mesh.faces) {
      const n = face.length;
      for (let i = 0; i < n; i++) {
        adj.get(face[i])?.push(face[(i + 1) % n], face[(i + n - 1) % n]);
      }
    }
    const newPos = new Map();
    for (const v of mesh.vertices) {
      const neighbors = [...new Set(adj.get(v.id) || [])];
      if (neighbors.length === 0) { newPos.set(v.id, { x: v.x, y: v.y, z: v.z }); continue; }
      const c = new THREE.Vector3();
      for (const nid of neighbors) {
        const n = mesh.getVertex(nid);
        c.add(new THREE.Vector3(n.x, n.y, n.z));
      }
      c.divideScalar(neighbors.length);
      newPos.set(v.id, { x: v.x * 0.5 + c.x * 0.5, y: v.y * 0.5 + c.y * 0.5, z: v.z * 0.5 + c.z * 0.5 });
    }
    for (const v of mesh.vertices) {
      const p = newPos.get(v.id);
      v.x = p.x; v.y = p.y; v.z = p.z;
    }
    mesh.invalidateCache();
    this.rebuildThreeMesh(mesh.id);
    this.updateHighlights();
    this.updateStats();
  }

  // lock/unlock helpers live in ./sceneUndo

  updateGrid() {
    const size = Math.max(0.001, theme.gridSize);
    const square = Math.max(0.001, theme.gridSquareSize);
    const config = `${size}:${square}:${theme.gridColor}:${theme.backgroundColor}`;
    if (this._gridConfig === config && this.grid) return;
    const wasVisible = this.grid?.visible ?? true;
    if (this.grid) {
      this.scene.remove(this.grid);
      disposeViewportGrid(this.grid);
    }
    this.grid = buildViewportGrid(size, square, theme.gridColor, this.renderer, theme.backgroundColor);
    this.grid.position.y = 0;
    this.grid.visible = wasVisible;
    this._gridConfig = config;
    this.scene.add(this.grid);
    updateViewportGridFade(this.grid, this.camera, this.cameraDist, theme.backgroundColor);
  }

  toggleGrid() {
    this.grid.visible = !this.grid.visible;
    // The shadow-catching ground plane is part of the grid: hide it too.
    if (this.shadowGround) this.shadowGround.visible = this.grid.visible;
  }

  combineMeshes() {
    // Combine the selected objects (or every object when fewer than two are
    // selected). Faces reference VERTEX IDS, not indices — the old version wrote
    // array offsets into the faces, which produced invalid faces and made the
    // combined geometry disappear.
    const ids = this.selectedMeshIds.length >= 2 ? [...this.selectedMeshIds] : this.meshes.map((m) => m.id);
    if (ids.length < 2) return;
    this.pushUndo();
    const base = this.getMesh(ids[0]);
    if (!base) return;
    const baseWm = this.getWorldMatrix(base);
    const baseInv = new THREE.Matrix4().copy(baseWm).invert();
    let nextId = Date.now();
    for (const id of ids.slice(1)) {
      const m = this.getMesh(id);
      if (!m) continue;
      const wm = this.getWorldMatrix(m);
      const idMap = new Map();
      for (const v of m.vertices) {
        // Bring each vertex into the base object's local space so the combined
        // mesh keeps every part exactly where it was in the scene.
        const p = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm).applyMatrix4(baseInv);
        const nv = { id: nextId++, x: p.x, y: p.y, z: p.z };
        base.vertices.push(nv);
        idMap.set(v.id, nv.id);
      }
      for (const face of m.faces) base.faces.push(face.map((vid) => idMap.get(vid)));
      for (const e of m.explicitEdges) {
        if (idMap.has(e.v1) && idMap.has(e.v2)) base.explicitEdges.push({ ...e, v1: idMap.get(e.v1), v2: idMap.get(e.v2) });
      }
      this.removeMesh(id);
    }
    this.selectedMeshIds = [];
    base.invalidateCache();
    this.rebuildThreeMesh(base.id);
    this.setSelection({ meshId: base.id, type: 'object', indices: [] });
  }

  subdivideMesh() { subdivideMeshTool(this); }

  // === STATS & HUD ===
  updateStats() {
    this.refreshFocusRenderBoost?.();
    const sel = this.selection;
    const selectedMesh = this.getMesh(sel.meshId);
    const targetMeshes = selectedMesh ? [selectedMesh] : this.meshes;
    let metric;

    if (this.selectionMode === 'object') {
      const ids = this.selectedMeshIds.length > 0
        ? this.selectedMeshIds
        : selectedMesh ? [selectedMesh.id] : this.meshes.map((mesh) => mesh.id);
      const count = ids.reduce((sum, id) => sum + (this.getMesh(id)?.getTriangleCount() || 0), 0);
      metric = { type: 'object', count, label: `${count} selected triangles` };
    } else if (this.multiSelect) {
      const count = sel.indices.length;
      metric = { type: this.selectionMode, count, label: `${count} selections` };
    } else if (this.selectionMode === 'vertex') {
      const count = targetMeshes.reduce((sum, mesh) => sum + mesh.vertices.length, 0);
      metric = { type: 'vertex', count, label: `${count} total vertices` };
    } else if (this.selectionMode === 'edge') {
      const count = targetMeshes.reduce((sum, mesh) => sum + mesh.getEdges().length, 0);
      metric = { type: 'edge', count, label: `${count} total edges` };
    } else {
      const count = targetMeshes.reduce((sum, mesh) => sum + mesh.faces.length, 0);
      metric = { type: 'face', count, label: `${count} total faces` };
    }

    const totalTriangles = this.meshes.reduce((sum, mesh) => sum + mesh.getTriangleCount(), 0);
    updateRenderBoostTriangleLoad(this, totalTriangles);
    this.cb.onStatsChange?.(metric.label);
    this.cb.onTriangleCountChange?.(metric);
    this.updateHud();
  }

  getSelectionBounds() {
    const sel = this.selection;
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return { sx: 0, sy: 0, sz: 0 };
    const wm = this.getWorldMatrix(mesh);
    const vids = sel.type === 'object' ? mesh.vertices.map((v) => v.id) : this.getSelectedVertexIds();
    if (vids.length === 0) return { sx: 0, sy: 0, sz: 0 };
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const vid of vids) {
      const v = mesh.getVertex(vid);
      if (!v) continue;
      const wp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
      min.min(wp); max.max(wp);
    }
    return { sx: max.x - min.x, sy: max.y - min.y, sz: max.z - min.z };
  }

  updateHud() {
    const sel = this.selection;
    const q3 = (value) => Math.round(Number(value) * 1000) / 1000;
    const toDeg = (r) => q3(r * 180 / Math.PI);
    const action = this.activeAction;
    if (!sel.meshId) {
      this.cb.onHudChange?.({ action, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, label: 'Pos. (in)', activeAxis: null });
      return;
    }
    const mesh = this.getMesh(sel.meshId);
    if (!mesh) return;
    let rot;
    if (action === 'rotate' && sel.type !== 'object' && this.activeRotationAxis) {
      const deg = toDeg(this.activeRotation || 0);
      rot = {
        rx: this.activeRotationAxis === 'x' ? deg : 0,
        ry: this.activeRotationAxis === 'y' ? deg : 0,
        rz: this.activeRotationAxis === 'z' ? deg : 0,
      };
    } else if (sel.type !== 'object') {
      const s = this.subRotation || { x: 0, y: 0, z: 0 };
      rot = { rx: toDeg(s.x), ry: toDeg(s.y), rz: toDeg(s.z) };
    } else {
      rot = { rx: toDeg(mesh.rotation.x), ry: toDeg(mesh.rotation.y), rz: toDeg(mesh.rotation.z) };
    }
    // Dimensions HUD reports the whole object's extents, even while a face,
    // edge or vertex is selected. Otherwise an extending face reports its own
    // near-zero thickness instead of the growing overall length.
    const wm = this.getWorldMatrix(mesh);
    const minBounds = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maxBounds = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const vertex of mesh.vertices) {
      const world = new THREE.Vector3(vertex.x, vertex.y, vertex.z).applyMatrix4(wm);
      minBounds.min(world);
      maxBounds.max(world);
    }
    const rawSize = mesh.vertices.length
      ? { sx: maxBounds.x - minBounds.x, sy: maxBounds.y - minBounds.y, sz: maxBounds.z - minBounds.z }
      : { sx: 0, sy: 0, sz: 0 };
    const size = { sx: q3(rawSize.sx), sy: q3(rawSize.sy), sz: q3(rawSize.sz) };
    if (this.isGroupMode()) {
      const center = this.getGroupCenter();
      this.cb.onHudChange?.({
        action,
        x: q3(center.x), y: q3(center.y), z: q3(center.z),
        ...rot, ...size,
        label: 'Pos. (in)', activeAxis: this.activeAxis
      });
    } else if (sel.type === 'object') {
      this.cb.onHudChange?.({
        action,
        x: q3(mesh.position.x), y: q3(mesh.position.y), z: q3(mesh.position.z),
        ...rot, ...size,
        label: 'Pos. (in)', activeAxis: this.activeAxis
      });
    } else {
      const center = this.getSelectionCenter();
      this.cb.onHudChange?.({
        action,
        x: q3(center.x), y: q3(center.y), z: q3(center.z),
        ...rot, ...size,
        label: 'Pos. (in)', activeAxis: this.activeAxis
      });
    }
  }

  // === GESTURES ===
  // Touch gesture handling (setupEvents, onPointerDown/Move/Up, marquee) lives
  // in ./sceneGestures and is applied to this class's prototype below.

  // === ANIMATION & RESIZE ===
  // A single bad draw call on a low-end mobile GPU used to throw here every
  // frame, leaving a permanently black viewport with no explanation. Now the
  // error is reported once (so it can actually be diagnosed) and the loop keeps
  // running instead of silently dying.
  animate() {
    this._rafId = requestAnimationFrame(() => this.animate());
    // Many mobile WebViews drop the GPU context WITHOUT ever firing
    // 'webglcontextlost', so event-based recovery never runs and the canvas
    // stays black forever. Check the context directly every frame instead.
    if (this._checkContextHealth()) return;
    try {
      updateCameraMotion(this);
      updateSceneShadowBounds(this);
      this.updateReflections?.();
      this.updateSceneLightGizmos?.();
      updateObjectAxisArrows(this);
      updateDrawFaceGrid(this);
      this._updateSelectionReveal();
      if (this._interactionHighlightsDirty && !this._heavyEdit) {
        this._interactionHighlightsDirty = false;
        this.updateHighlights();
      }
      syncObjectHighlightTransforms(this);
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      this._reportGraphicsError(err?.message || String(err));
    }
  }

  // Returns true when rendering must be skipped this frame (context dead, or
  // the canvas has no pixels yet — both look identical to a blank screen).
  _checkContextHealth() {
    const gl = this.renderer.getContext?.();
    if (gl && gl.isContextLost && gl.isContextLost()) {
      if (!this._contextDead) {
        this._contextDead = true;
        this.cb.onContextLost?.();
      }
      return true;
    }
    const canvas = this.renderer.domElement;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    // A zero-sized canvas (first layout pass in a mobile WebView, or a
    // rotation/fullscreen change) renders nothing; re-sync as soon as the
    // container reports real dimensions.
    if (w > 0 && h > 0 && (canvas.clientWidth !== w || canvas.clientHeight !== h)) {
      this.handleResize();
    }
    return false;
  }

  _reportGraphicsError(message) {
    if (this._graphicsError === message) return;
    this._graphicsError = message;
    this.cb.onGraphicsError?.(message);
  }

  // Mobile WebViews drop the GPU context when the page is backgrounded or
  // enters/exits full screen. Without this the canvas stays blank forever.
  setupContextRecovery() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this._contextDead) return;
      this._contextDead = true;
      this.cb.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this._graphicsError = null;
      this.cb.onGraphicsError?.(null);
      for (const mesh of this.meshes) this.rebuildThreeMesh(mesh.id);
      this.updateHighlights();
    });
  }

  handleResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    // Fat lines carry a pixel resolution; refresh the grid axes, wireframes and highlights.
    updateViewportGridResolution(this.grid, w, h);
    for (const obj of this.threeObjects.values()) obj.wireframe.material.resolution?.set(w, h);
    this.updateHighlights();
  }

  // === SERIALIZATION ===
  serialize() {
    return {
      id: this.projectId,
      name: this.projectName,
      meshes: this.meshes.map(m => m.serialize()),
      lights: this.serializeSceneLights?.() || [],
      settings: theme.getSceneSettings(),
    };
  }

  // Small JPEG snapshot of the current view (highlights hidden) used as the
  // saved-project preview in the library.
  captureThumbnail(size = 256) {
    const hlVisible = this.highlightGroup.visible;
    this.highlightGroup.visible = false;
    const arrows = [...(this.objectAxisArrows?.values() || [])].map((group) => [group, group.visible]);
    for (const [group] of arrows) group.visible = false;
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const canvas = document.createElement('canvas');
    const scale = size / Math.max(src.width, src.height, 1);
    canvas.width = Math.max(1, Math.round(src.width * scale));
    canvas.height = Math.max(1, Math.round(src.height * scale));
    canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
    this.highlightGroup.visible = hlVisible;
    for (const [group, visible] of arrows) group.visible = visible;
    this.renderer.render(this.scene, this.camera);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  // Add another saved model's objects to THIS scene instead of replacing it,
  // so several models can be assembled together. Geometry only: the scene
  // keeps its own lights and display settings, and the saved model is left
  // untouched. Returns what actually landed, since the triangle limit can
  // turn a large import away part of the way through.
  importProjectMeshes(data) {
    const source = data?.meshes || [];
    if (!source.length) return { added: 0, skipped: 0, ids: [] };
    this.pushUndo();
    // A saved model's object ids can collide with objects already in the
    // scene, which would make the copy edit the original.
    const used = new Set(this.meshes.map((m) => m.id));
    const freshId = () => {
      let id;
      do { id = Date.now() + Math.floor(Math.random() * 1000000); } while (used.has(id));
      used.add(id);
      return id;
    };
    const ids = [];
    let skipped = 0;
    for (const meshData of source) {
      const mesh = meshData instanceof EditableMesh ? meshData : EditableMesh.deserialize(meshData);
      mesh.id = freshId();
      if (this.addMesh(mesh) === null) { skipped++; continue; }
      ids.push(mesh.id);
    }
    if (ids.length) {
      // Everything that just arrived is selected and highlighted in Object
      // mode, not only the first object.
      if (this.selectionMode !== 'object') {
        this.setSelectionMode('object');
        this.cb.onSelectionModeChange?.('object');
      }
      this.setSelection({ meshId: ids[0], type: 'object', indices: [] });
      this.selectedMeshIds = [...ids];
      this.updateHighlights(true);
    }
    this.updateStats();
    return { added: ids.length, skipped, ids };
  }

  loadProject(data) {
    this.clearScene();
    this.projectId = data.id;
    this.projectName = data.name;
    // Display settings travel with the model. Models saved before this existed
    // have none and simply keep the current display.
    if (data.settings) theme.applySceneSettings(data.settings);
    resetRenderBoostAuto();
    if (this.grid) this.grid.visible = theme.gridVisible;
    for (const meshData of data.meshes) {
      // storage.loadProject() already returns EditableMesh instances. Cloud/import
      // callers may still pass serialized mesh data, so accept both without
      // deserializing a runtime paint layer a second time.
      const mesh = meshData instanceof EditableMesh ? meshData : EditableMesh.deserialize(meshData);
      this.addMesh(mesh);
    }
    this.restoreSceneLights?.(data.lights);
    this.updateStats();
  }

  dispose() {
    this._disposed = true;
    if (this._themeUnsub) this._themeUnsub();
    cancelAnimationFrame(this._rafId);
    this.stopCameraMotion();
    if (this._camRaf) cancelAnimationFrame(this._camRaf);
    if (this._interactionFeedbackRaf) cancelAnimationFrame(this._interactionFeedbackRaf);
    clearTimeout(this._renderBoostTimer);
    clearTimeout(this.cutMode?.rejectionTimer);
    this.cutMode = null;
    this.clearCutPreview();
    window.removeEventListener('resize', this._handleResize);
    window.removeEventListener('blur', this._cancelCameraOnBlur);
    window.removeEventListener('pageshow', this._handleViewportResume);
    document.removeEventListener('visibilitychange', this._handleViewportResume);
    document.removeEventListener('fullscreenchange', this._handleViewportResume);
    this.disposeSceneLights?.();
    this.exitDrawMode();
    disposeObjectAxisArrows(this);

    // Release scene-owned GPU resources before disposing the renderer. Do not
    // dispose mesh textures here: undo/clone paths may legitimately share them.
    for (const mesh of [...this.meshes]) this.removeMesh(mesh.id);
    this.disposeSceneReflections?.();

    if (this.grid) {
      this.scene.remove(this.grid);
      disposeViewportGrid(this.grid);
      this.grid = null;
    }
    while (this.highlightGroup.children.length) {
      const child = this.highlightGroup.children[0];
      this.highlightGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
    this.scene.remove(this.highlightGroup);
    if (this.shadowGround) {
      this.scene.remove(this.shadowGround);
      this.shadowGround.geometry?.dispose();
      this.shadowGround.material?.dispose();
      this.shadowGround = null;
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) this.container.removeChild(this.renderer.domElement);
  }
}

applySceneUndo(SceneManager);
applyFocusRenderBoost(SceneManager);
applySceneRadialArray(SceneManager);
applySceneExtrude(SceneManager);
applySceneTexture(SceneManager);
applySceneReflections(SceneManager);
applySceneConvert(SceneManager);
applySceneSelection(SceneManager);
applySceneLights(SceneManager);
applySceneMouse(SceneManager);
applySceneGestures(SceneManager);
applySceneCut(SceneManager);
applySceneMeasure(SceneManager);
applySceneAddVertex(SceneManager);
applySceneReference(SceneManager);
applySceneDrawFace(SceneManager);