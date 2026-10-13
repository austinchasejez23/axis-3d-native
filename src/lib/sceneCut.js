import * as THREE from 'three';
import { theme } from './theme';
import { makeFatSegments } from './fatLines';
import { drawCutIntersects } from '@/lib/cutIntersections';
import {
  buildCutLoopPlan, cutLoopPreviewPoints, applyCutLoopPlan, applyDrawCut, pointOnEdge,
} from './cutTools';

// Interactive Cut loop / Draw cut modes: the user taps a position on an edge,
// a highlighted preview of the cut is drawn, and a small panel commits or
// cancels it.
export function applySceneCut(SceneManager) {
  const P = SceneManager.prototype;

  P.enterCutMode = function (kind) {
    this.exitCutMode();
    this.clearSelection();
    this.cutMode = { kind, meshId: null, points: [], plan: null, snapCenter: false, snapPoint: false, pathMode: 'follow' };
    this.notifyCut();
  };

  P.exitCutMode = function () {
    const closingLabel = this.cutMode?.kind === 'loop' ? 'Cut loop' : this.cutMode?.kind === 'draw' ? 'Draw cut' : null;
    clearTimeout(this.cutMode?.rejectionTimer);
    this.cutMode = null;
    this.clearCutPreview();
    this.cb.onCutChange?.(null);
    if (closingLabel) window.dispatchEvent(new CustomEvent('axis-tool-closed', { detail: { label: closingLabel } }));
  };

  P.notifyCut = function () {
    const c = this.cutMode;
    if (!c) { this.cb.onCutChange?.(null); return; }
    this.cb.onCutChange?.({
      kind: c.kind,
      ready: !c.invalidLast && (c.kind === 'loop' ? !!c.plan : c.points.length >= 2),
      pointCount: c.points.length,
      snapCenter: !!c.snapCenter,
      snapPoint: !!c.snapPoint,
      pathMode: c.pathMode || 'follow',
    });
  };

  P.setDrawCutSnap = function (enabled) {
    const c = this.cutMode;
    if (!c || c.kind !== 'draw') return;
    c.snapPoint = !!enabled;
    this.notifyCut();
  };

  P.setCutCenterSnap = function (enabled) {
    const c = this.cutMode;
    if (!c || c.kind !== 'loop') return;
    c.snapCenter = !!enabled;
    if (enabled && c.points.length) {
      c.points[0].t = 0.5;
      const mesh = this.getMesh(c.meshId);
      if (mesh) c.plan = buildCutLoopPlan(mesh, c.points[0].v1, c.points[0].v2, 0.5, c.pathMode);
      this.updateCutPreview();
    }
    this.notifyCut();
  };

  P.setCutPathMode = function (mode) {
    const c = this.cutMode;
    if (!c || c.kind !== 'loop') return;
    c.pathMode = mode;
    if (c.points.length) {
      const mesh = this.getMesh(c.meshId);
      if (mesh) c.plan = buildCutLoopPlan(mesh, c.points[0].v1, c.points[0].v2, c.points[0].t, mode);
      this.updateCutPreview();
    }
    this.notifyCut();
  };

  P.clearCutPreview = function () {
    if (!this.cutPreviewGroup) return;
    while (this.cutPreviewGroup.children.length) {
      const child = this.cutPreviewGroup.children[0];
      this.cutPreviewGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  };

  // Position along the tapped edge, in screen space (0 = v1, 1 = v2).
  P.edgeParamAtScreen = function (mesh, edge, ndcX, ndcY) {
    const wm = this.getWorldMatrix(mesh);
    const a = mesh.getVertex(edge.v1), b = mesh.getVertex(edge.v2);
    const sa = new THREE.Vector3(a.x, a.y, a.z).applyMatrix4(wm).project(this.camera);
    const sb = new THREE.Vector3(b.x, b.y, b.z).applyMatrix4(wm).project(this.camera);
    const dx = sb.x - sa.x, dy = sb.y - sa.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0) return 0.5;
    const t = ((ndcX - sa.x) * dx + (ndcY - sa.y) * dy) / len2;
    return Math.max(0.05, Math.min(0.95, t));
  };

  P.handleCutTap = function (clientX, clientY) {
    const c = this.cutMode;
    if (!c || c.invalidLast) return;
    // Tapping the first marker closes a Draw cut instead of placing a second
    // point on the same edge. Compare in screen pixels so zoom cannot change reach.
    if (c.kind === 'draw' && c.points.length >= 3 && c.meshId) {
      const mesh = this.getMesh(c.meshId);
      const first = c.points[0];
      const world = mesh && pointOnEdge(mesh, first.v1, first.v2, first.t)?.applyMatrix4(this.getWorldMatrix(mesh));
      if (world) {
        const projected = world.project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        const px = rect.left + (projected.x + 1) * rect.width / 2;
        const py = rect.top + (1 - projected.y) * rect.height / 2;
        if (Math.hypot(clientX - px, clientY - py) <= 5) {
          if (drawCutIntersects(mesh, [...c.points, first])) {
            c.invalidLast = true;
            c.closingPreview = true;
            c.rejectionTimer = setTimeout(() => {
              if (this.cutMode !== c) return;
              c.invalidLast = false;
              c.closingPreview = false;
              this.updateCutPreview();
              this.notifyCut();
            }, 500);
            this.updateCutPreview();
            this.notifyCut();
            return;
          }
          c.closed = true;
          this.commitCut();
          return;
        }
      }
    }
    const { x, y } = this.screenToNDC(clientX, clientY);
    const hit = this.findClosestEdge(x, y, 0.12);
    if (!hit) { this.exitCutMode(); return; }
    const mesh = this.getMesh(hit.meshId);
    let edge = mesh?.getEdges()[hit.index];
    if (!mesh || !edge) return;
    if (c.meshId && c.meshId !== hit.meshId) return; // one object per cut
    c.meshId = hit.meshId;
    let t = c.kind === 'loop' && c.snapCenter ? 0.5 : this.edgeParamAtScreen(mesh, edge, x, y);
    if (c.kind === 'draw' && c.snapPoint) {
      const wm = this.getWorldMatrix(mesh);
      const proposed = pointOnEdge(mesh, edge.v1, edge.v2, t)?.applyMatrix4(wm);
      const limit = Math.max(0, Number(theme.snapDistance) || 0);
      let nearest = null;
      let distance = limit;
      if (proposed && limit > 0) {
        for (const vertex of mesh.vertices) {
          const world = new THREE.Vector3(vertex.x, vertex.y, vertex.z).applyMatrix4(wm);
          const d = world.distanceTo(proposed);
          if (d <= distance && this.isWorldPointVisible(world)) {
            distance = d;
            nearest = vertex.id;
          }
        }
      }
      if (nearest != null) {
        const adjacent = mesh.getEdges().filter(e => e.v1 === nearest || e.v2 === nearest);
        const snapEdge = adjacent.find(e => (e.v1 === edge.v1 && e.v2 === edge.v2) || (e.v1 === edge.v2 && e.v2 === edge.v1)) || adjacent[0];
        if (snapEdge) {
          edge = snapEdge;
          t = edge.v1 === nearest ? 0.001 : 0.999;
        }
      }
    }
    if (c.kind === 'loop') {
      c.points = [{ v1: edge.v1, v2: edge.v2, t }];
      c.plan = buildCutLoopPlan(mesh, edge.v1, edge.v2, t, c.pathMode);
    } else {
      c.points.push({ v1: edge.v1, v2: edge.v2, t });
      if (drawCutIntersects(mesh, c.points)) {
        c.invalidLast = true;
        c.rejectionTimer = setTimeout(() => {
          if (this.cutMode !== c) return;
          this.removeLastCutPoint();
        }, 500);
      }
    }
    this.updateCutPreview();
    this.notifyCut();
  };

  // Finger down on an edge in Cut loop mode: show the preview immediately and
  // keep it following the finger as it slides along the edge.
  P.beginCutDrag = function (clientX, clientY) {
    const c = this.cutMode;
    if (!c || c.kind !== 'loop') return false;
    const { x, y } = this.screenToNDC(clientX, clientY);
    const hit = this.findClosestEdge(x, y, 0.12);
    if (!hit) return false;
    const mesh = this.getMesh(hit.meshId);
    const edge = mesh?.getEdges()[hit.index];
    if (!mesh || !edge) return false;
    c.meshId = hit.meshId;
    c.dragEdge = { v1: edge.v1, v2: edge.v2 };
    this.dragCutTo(clientX, clientY);
    return true;
  };

  P.dragCutTo = function (clientX, clientY) {
    const c = this.cutMode;
    if (!c || !c.dragEdge) return;
    const mesh = this.getMesh(c.meshId);
    if (!mesh) return;
    const { x, y } = this.screenToNDC(clientX, clientY);
    const t = c.snapCenter ? 0.5 : this.edgeParamAtScreen(mesh, c.dragEdge, x, y);
    c.points = [{ v1: c.dragEdge.v1, v2: c.dragEdge.v2, t }];
    c.plan = buildCutLoopPlan(mesh, c.dragEdge.v1, c.dragEdge.v2, t, c.pathMode);
    this.updateCutPreview();
    this.notifyCut();
  };

  P.endCutDrag = function () {
    if (this.cutMode) this.cutMode.dragEdge = null;
  };

  P.removeLastCutPoint = function () {
    const c = this.cutMode;
    if (!c || c.points.length === 0) return;
    clearTimeout(c.rejectionTimer);
    c.invalidLast = false;
    c.points.pop();
    if (c.points.length === 0) c.meshId = null;
    this.updateCutPreview();
    this.notifyCut();
  };

  P.updateCutPreview = function () {
    this.clearCutPreview();
    const c = this.cutMode;
    if (!c || !c.meshId) return;
    const mesh = this.getMesh(c.meshId);
    if (!mesh) return;
    if (!this.cutPreviewGroup) {
      this.cutPreviewGroup = new THREE.Group();
      this.scene.add(this.cutPreviewGroup);
    }
    const wm = this.getWorldMatrix(mesh);
    const hl = theme.highlightInt;
    const positions = [];
    const rejectedPositions = [];
    const dots = [];
    if (c.kind === 'loop' && c.plan) {
      for (const [p1, p2] of cutLoopPreviewPoints(mesh, c.plan)) {
        const w1 = p1.applyMatrix4(wm), w2 = p2.applyMatrix4(wm);
        positions.push(w1.x, w1.y, w1.z, w2.x, w2.y, w2.z);
      }
    } else {
      const pts = c.points.map((p) => pointOnEdge(mesh, p.v1, p.v2, p.t)).filter(Boolean).map((p) => p.applyMatrix4(wm));
      if (c.closingPreview && pts.length) pts.push(pts[0]);
      dots.push(...pts);
      for (let i = 0; i < pts.length - 1; i++) {
        const target = c.invalidLast && i === pts.length - 2 ? rejectedPositions : positions;
        target.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      }
    }
    if (positions.length) {
      const line = makeFatSegments(positions, hl, 2.5, this.renderer);
      line.renderOrder = 999;
      this.cutPreviewGroup.add(line);
    }
    if (rejectedPositions.length) {
      const line = makeFatSegments(rejectedPositions, 0xff3030, 2.5, this.renderer);
      line.material.toneMapped = false;
      line.renderOrder = 1000;
      this.cutPreviewGroup.add(line);
    }
    for (const [index, p] of dots.entries()) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 10),
        new THREE.MeshBasicMaterial({ color: c.invalidLast && index === dots.length - 1 ? 0xff3030 : hl, depthTest: false })
      );
      dot.position.copy(p);
      // Match selected vertex dots exactly, including zoom-independent size.
      dot.onBeforeRender = (renderer, scene, camera) => {
        const d = camera.position.distanceTo(dot.position);
        const s = Math.max(1e-4, d * 0.0055);
        dot.scale.set(s, s, s);
        dot.updateMatrixWorld();
      };
      dot.renderOrder = 999;
      this.cutPreviewGroup.add(dot);
    }
  };

  P.commitCut = function () {
    const c = this.cutMode;
    if (!c || !c.meshId || c.invalidLast) return false;
    const mesh = this.getMesh(c.meshId);
    if (!mesh) return false;
    this.pushUndo();
    // Freeze every existing quad diagonal before the topology changes, so
    // untouched faces can never sprout stray diagonal lines after the cut.
    mesh.lockTriangulationDiagonals();
    const cuts = c.kind === 'loop'
      ? (c.plan ? applyCutLoopPlan(mesh, c.plan) : 0)
      : (c.points.length >= 2 ? applyDrawCut(mesh, c.points, c.closed) : 0);
    if (!cuts) { this.undoStack.pop(); this.exitCutMode(); return false; }
    this.rebuildThreeMesh(mesh.id);
    this.clearSelection();
    this.updateStats();
    this.exitCutMode();
    return true;
  };
}