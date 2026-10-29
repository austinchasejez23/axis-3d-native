import { insertVertexOnEdge } from './cutTools';
import { cleanupCommittedTopology } from './meshTopologyInvariants';

const splitTrackedEdge = (items, edge, vertexId) => items.flatMap((item) => {
  const same = (item.v1 === edge.v1 && item.v2 === edge.v2) || (item.v1 === edge.v2 && item.v2 === edge.v1);
  return same ? [{ ...item, v1: edge.v1, v2: vertexId }, { ...item, v1: vertexId, v2: edge.v2 }] : [item];
});

export function applySceneAddVertex(SceneManager) {
  const P = SceneManager.prototype;

  P.enterAddVertexMode = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.addVertexMode) return;
    this.addVertexMode = { snapshot: this.captureSnapshot(), meshId: null, vertexIds: [], pointSnapshots: [], snapCenter: false };
    this.cb.onAddVertexChange?.({ count: 0, snapCenter: false });
  };

  P.setAddVertexCenterSnap = /** @this {import('./SceneManager.js').SceneManager} */ function (enabled) {
    const mode = this.addVertexMode;
    if (!mode) return;
    mode.snapCenter = !!enabled;
    this.cb.onAddVertexChange?.({ count: mode.vertexIds.length, snapCenter: mode.snapCenter });
  };

  P.addVertexAt = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const mode = this.addVertexMode;
    if (!mode) return false;
    const { x, y } = this.screenToNDC(clientX, clientY);
    const hit = this.findClosestEdge(x, y, 0.12);
    if (!hit || (mode.meshId && mode.meshId !== hit.meshId)) return false;
    const mesh = this.getMesh(hit.meshId);
    const edge = mesh?.getEdges()[hit.index];
    if (!mesh || !edge || mesh.locked) return false;
    const beforePoint = this.captureSnapshot();
    mode.meshId = hit.meshId;
    mesh.lockTriangulationDiagonals();
    // Center mode targets the exact midpoint of the tapped edge, irrespective
    // of where along that edge the finger lands.
    const edgePosition = mode.snapCenter ? 0.5 : this.edgeParamAtScreen(mesh, edge, x, y);
    const vertexId = insertVertexOnEdge(mesh, edge.v1, edge.v2, edgePosition);
    if (vertexId == null) return false;
    mesh.visibleEdges = splitTrackedEdge(mesh.visibleEdges, edge, vertexId);
    mesh.hiddenEdges = splitTrackedEdge(mesh.hiddenEdges, edge, vertexId);
    mesh.invalidateCache();
    mode.vertexIds.push(vertexId);
    mode.pointSnapshots.push(beforePoint);
    this.rebuildThreeMesh(mesh.id);
    this.setSelection({ meshId: mesh.id, type: 'vertex', indices: mode.vertexIds.map((id) => mesh.vertices.findIndex((v) => v.id === id)).filter((i) => i >= 0) });
    this.cb.onAddVertexChange?.({ count: mode.vertexIds.length, snapCenter: mode.snapCenter });
    return true;
  };

  // Treat an empty-canvas tap exactly like pressing Cancel: exit the tool
  // and restore the pre-tool mesh. Only the checkmark commits changes.
  // A tap on a face away from an edge does NOT cancel; it just adds nothing.
  P.handleAddVertexTap = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    if (!this.addVertexMode) return false;
    if (this.addVertexAt(clientX, clientY)) return true;
    const { x, y } = this.screenToNDC(clientX, clientY);
    if (this.raycastMeshes(x, y).length === 0) {
      return this.cancelAddVertex();
    }
    return false;
  };

  P.deleteLastAddVertex = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const mode = this.addVertexMode;
    if (!mode?.pointSnapshots.length) return false;
    const snapshot = mode.pointSnapshots.pop();
    mode.vertexIds.pop();
    this.restoreSnapshot(snapshot);
    if (!mode.vertexIds.length) mode.meshId = null;
    this.cb.onAddVertexChange?.({ count: mode.vertexIds.length, snapCenter: mode.snapCenter });
    return true;
  };

  P.confirmAddVertex = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const mode = this.addVertexMode;
    if (!mode) return false;
    this.addVertexMode = null;
    this.cb.onAddVertexChange?.(null);
    if (mode.vertexIds.length) {
      const mesh = this.getMesh(mode.meshId);
      if (mesh) {
        cleanupCommittedTopology(mesh);
        // The added vertices stay selected (found again by id, since cleanup
        // can renumber vertex positions).
        const indices = mode.vertexIds.map((id) => mesh.vertices.findIndex((v) => v.id === id)).filter((i) => i >= 0);
        if (indices.length) this.selectCreated('vertex', mesh.id, indices);
      }
      this.pushUndoSnapshot(mode.snapshot);
    }
    return mode.vertexIds.length > 0;
  };

  P.cancelAddVertex = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const mode = this.addVertexMode;
    if (!mode) return false;
    this.addVertexMode = null;
    this.cb.onAddVertexChange?.(null);
    this.restoreSnapshot(mode.snapshot);
    return true;
  };
}