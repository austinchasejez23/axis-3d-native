import * as THREE from 'three';

// Measuring tool (general tools, next to the protractor): with measure mode
// on, a tap snaps to the nearest vertex — or, failing that, the nearest point
// along an edge — of the tapped mesh. Two tapped points are kept at a time;
// a third tap starts a fresh measurement. MeasureOverlay renders the readout
// from this.measurePoints.
export function applySceneMeasure(SceneManager) {
  const P = SceneManager.prototype;
  const SNAP_PX = 16;

  P.setMeasureMode = /** @this {import('./SceneManager.js').SceneManager} */ function (active) {
    this.measureMode = !!active;
    this.measurePoints = [];
  };

  P.measureTap = /** @this {import('./SceneManager.js').SceneManager} */ function (clientX, clientY) {
    const ndc = this.screenToNDC(clientX, clientY);
    const hits = this.raycastMeshes(ndc.x, ndc.y);
    // A clean tap that hits nothing clears the current measurement (not the
    // tool itself, which stays active) so a fresh pair of points can be placed.
    if (hits.length === 0) { this.measurePoints = []; return; }
    const mesh = this.getMesh(this.findMeshIdByObject(hits[0].object));
    if (!mesh) return;
    const wm = this.getWorldMatrix(mesh);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const toScreen = (world) => {
      const p = world.clone().project(this.camera);
      return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    };

    // Nearest projected vertex within the snap reach.
    let point = null;
    let bestD = SNAP_PX;
    for (const v of mesh.vertices) {
      const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm);
      const s = toScreen(w);
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      if (d < bestD) { bestD = d; point = w; }
    }
    // Occluded vertices (a back corner behind the object) never snap.
    if (point && this.isWorldPointVisible && !this.isWorldPointVisible(point)) point = null;

    // Otherwise the nearest point along any edge's screen projection.
    if (!point) {
      const edges = (mesh.visibleEdges && mesh.visibleEdges.length) ? mesh.visibleEdges : mesh.getEdges();
      let bestE = SNAP_PX;
      let bestW = null;
      for (const e of edges) {
        const va = mesh.getVertex(e.v1), vb = mesh.getVertex(e.v2);
        if (!va || !vb) continue;
        const wa = new THREE.Vector3(va.x, va.y, va.z).applyMatrix4(wm);
        const wb = new THREE.Vector3(vb.x, vb.y, vb.z).applyMatrix4(wm);
        const sa = toScreen(wa), sb = toScreen(wb);
        const abx = sb.x - sa.x, aby = sb.y - sa.y;
        const len2 = abx * abx + aby * aby;
        const t = len2 > 0
          ? Math.max(0, Math.min(1, ((clientX - sa.x) * abx + (clientY - sa.y) * aby) / len2))
          : 0;
        const d = Math.hypot(sa.x + abx * t - clientX, sa.y + aby * t - clientY);
        if (d < bestE) { bestE = d; bestW = wa.clone().lerp(wb, t); }
      }
      if (bestW && (!this.isWorldPointVisible || this.isWorldPointVisible(bestW))) point = bestW;
    }

    if (!point) return;
    if (!this.measurePoints || this.measurePoints.length >= 2) this.measurePoints = [];
    this.measurePoints.push(point);
  };
}