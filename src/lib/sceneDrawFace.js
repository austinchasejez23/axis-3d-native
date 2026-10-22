import * as THREE from 'three';
import { EditableMesh } from '@/lib/EditableMesh';
import { simplifyDrawFacePath } from '@/lib/drawFacePath';
import { buildDrawFaceTopology } from '@/lib/drawFaceTopology';
import { cleanupCommittedTopology } from '@/lib/meshTopologyInvariants';
import straightenDrawFace from '@/lib/straightenDrawFace';
import alignDrawFace from '@/lib/alignDrawFace';
import updateDrawFaceGrid, { disposeDrawFaceGrid } from '@/lib/drawFaceGrid';

function disposePreview(manager, record) {
  if (!record.object) return;
  manager.scene.remove(record.object);
  record.object.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
  record.object = null;
}

function buildPreview(manager, record) {
  disposePreview(manager, record);
  const points = manager.drawStraighten
    ? manager.drawAlign
      ? alignDrawFace(record.screen, record.world, record.axis, manager.camera, manager.renderer.domElement.getBoundingClientRect())
      : straightenDrawFace(record.screen, record.world, record.axis)
    : simplifyDrawFacePath(record.screen, record.world);
  if (points.length < 3) return;
  const mesh = new EditableMesh('Drawn face');
  mesh.vertices = points.map((p, id) => ({ id, x: p.x, y: p.y, z: p.z }));
  const topology = buildDrawFaceTopology(points, mesh.vertices.map((v) => v.id));
  mesh.faces = topology.faces;
  mesh.visibleEdges = topology.visibleEdges;
  const object = new THREE.Mesh(mesh.toBufferGeometry(), manager.createMaterial(mesh));
  object.name = 'Draw face preview';
  object.add(new THREE.LineSegments(mesh.toEdgesGeometry(), new THREE.LineBasicMaterial({ color: 0x0a0a0a })));
  record.mesh = mesh;
  record.object = object;
  manager.scene.add(object);
}

export default function applySceneDrawFace(SceneManager) {
  const P = SceneManager.prototype;
  P.emitDrawState = /** @this {import('./SceneManager.js').SceneManager} */ function (nearStart = false) {
    this.cb.onDrawChange?.({ points: [...this.drawScreenPts], active: true, kind: this.drawMode, axis: this.drawAxis, nearStart });
  };
  P.enterDrawMode = /** @this {import('./SceneManager.js').SceneManager} */ function (kind) {
    this.exitDrawMode();
    this.drawMode = kind;
    this.drawPreviews = [];
    this.drawGridEnabled = false;
    this.drawStraighten = false;
    this.drawAlign = false;
    this.clearSelection();
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const ax = Math.abs(direction.x), ay = Math.abs(direction.y), az = Math.abs(direction.z);
    this.gesture = null;
    this.gestureData = null;
    this.setDrawPlaneAxis(ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z');
  };
  P.alignDrawCameraToPlane = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const normal = this.drawPlaneNormal;
    if (!normal) return;
    const theta = Math.abs(normal.y) > 0 ? this.cameraTheta : Math.atan2(normal.x, normal.z);
    this.setCameraOrbit(this.cameraDist, theta, Math.asin(normal.y));
  };
  P.setDrawPlaneAxis = /** @this {import('./SceneManager.js').SceneManager} */ function (axis) {
    if (!this.drawMode || !['x', 'y', 'z'].includes(axis)) return;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const sign = Math.sign(direction[axis]) || 1;
    this.drawAxis = axis;
    this.drawPlaneNormal = new THREE.Vector3(axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, axis === 'z' ? sign : 0);
    this.drawScreenPts = [];
    this.drawWorldPts = [];
    if (this.drawGridEnabled) this.alignDrawCameraToPlane();
    updateDrawFaceGrid(this);
    this.emitDrawState();
  };
  P.setDrawGridEnabled = /** @this {import('./SceneManager.js').SceneManager} */ function (enabled) {
    this.drawGridEnabled = !!enabled && this.drawMode === 'face';
    updateDrawFaceGrid(this);
  };
  P.setDrawStraighten = /** @this {import('./SceneManager.js').SceneManager} */ function (enabled) {
    this.drawStraighten = !!enabled;
    if (!this.drawStraighten) this.drawAlign = false;
    for (const record of this.drawPreviews || []) buildPreview(this, record);
  };
  P.setDrawAlign = /** @this {import('./SceneManager.js').SceneManager} */ function (enabled) {
    this.drawAlign = this.drawStraighten && !!enabled;
    for (const record of this.drawPreviews || []) buildPreview(this, record);
  };
  P.getDrawPlane = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    return new THREE.Plane().setFromNormalAndCoplanarPoint(this.drawPlaneNormal || new THREE.Vector3(0, 1, 0), this.cameraTarget);
  };
  P.beginDrawFaceStroke = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    this.drawScreenPts = [];
    this.drawWorldPts = [];
    this.appendDrawFacePoint(x, y);
  };
  P.appendDrawFacePoint = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    const last = this.drawScreenPts[this.drawScreenPts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) <= 6) return;
    const world = this.rayToPlane(x, y, this.getDrawPlane());
    if (!world) return;
    this.drawScreenPts.push({ x, y });
    this.drawWorldPts.push(world);
    const first = this.drawScreenPts[0];
    this.emitDrawState(this.drawScreenPts.length > 4 && Math.hypot(x - first.x, y - first.y) < 24);
  };
  P.finishDrawFaceStroke = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    const first = this.drawScreenPts[0];
    if (first && this.drawScreenPts.length > 4 && Math.hypot(x - first.x, y - first.y) < 24) this.completeDrawFace();
    // An incomplete stroke is discarded, but the tool stays open for another try.
    this.drawScreenPts = [];
    this.drawWorldPts = [];
    this.emitDrawState();
  };
  P.completeDrawFace = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.drawWorldPts.length < 3) return;
    const record = { screen: [...this.drawScreenPts], world: this.drawWorldPts.map((p) => p.clone()), axis: this.drawAxis };
    buildPreview(this, record);
    if (record.mesh) this.drawPreviews.push(record);
  };
  P.confirmDrawFaces = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const meshes = (this.drawPreviews || []).map((record) => record.mesh).filter(Boolean);
    // Incomplete previews must never become stored isolated points or lines.
    for (const mesh of meshes) cleanupCommittedTopology(mesh);
    const committed = meshes.filter(mesh => mesh.faces.length > 0);
    const total = [...this.meshes, ...committed].reduce((sum, mesh) => sum + mesh.getTriangleCount(), 0);
    if (this.triangleLimit && total > this.triangleLimit) { this.cb.onTriangleLimit?.(); return; }
    if (committed.length) {
      this.pushUndo();
      for (const mesh of committed) { this.meshes.push(mesh); this.buildThreeMesh(mesh); }
      this.selectionMode = 'object';
      this.cb.onSelectionModeChange?.('object');
      this.setSelection({ meshId: committed[committed.length - 1].id, type: 'object', indices: [] });
    }
    this.exitDrawMode();
    this.updateStats();
  };
  P.exitDrawMode = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const closingLabel = this.drawMode === 'face' ? 'Draw face' : null;
    for (const record of this.drawPreviews || []) disposePreview(this, record);
    this.drawPreviews = [];
    this.drawMode = null;
    this.drawGridEnabled = false;
    this.drawStraighten = false;
    this.drawAlign = false;
    disposeDrawFaceGrid(this);
    this.drawScreenPts = [];
    this.drawWorldPts = [];
    this.drawPlaneNormal = null;
    this.cb.onDrawChange?.(null);
    if (closingLabel) window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: closingLabel } }));
  };
}