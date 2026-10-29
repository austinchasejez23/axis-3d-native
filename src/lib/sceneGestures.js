import * as THREE from 'three';
import { sculptGrabStart, sculptGrabMove } from './sculptTools';
import { theme } from './theme';
import { beginFreeScale, updateFreeScale, updateFreeRotation } from '@/lib/freeTransforms';
import { beginCameraTouch, endCameraTouch } from '@/lib/cameraTouchSession';
import { discardTapMotion, resetCameraTouchSpeed } from '@/lib/cameraMotion';

// How long one finger may move alone before a two-finger gesture is read as
// "one finger anchored" (pinch / twist). Fingers never land and start moving
// at the same instant; without this wait a two-finger drag whose second finger
// lagged a few frames looked like a twist and rotated the object.
const LONE_FINGER_WAIT_MS = 140;

// On-screen direction of each axis a two-finger drag can scale along: the
// object's own axes for a whole object, world axes otherwise. Each entry is a
// unit screen direction plus how many pixels one world unit along it covers.
function dragAxisFrames(sm, localAxes) {
  const rect = sm.renderer.domElement.getBoundingClientRect();
  const toScreen = (v) => {
    const p = v.clone().project(sm.camera);
    return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height };
  };
  const center = sm.getSelectionCenter();
  const mesh = sm.getMesh(sm.selection.meshId);
  const q = localAxes && mesh ? new THREE.Quaternion().setFromEuler(mesh.rotation) : new THREE.Quaternion();
  const probe = Math.max(0.001, sm.cameraDist * 0.05);
  const a = toScreen(center);
  const frames = {};
  for (const [axis, dir] of [['x', new THREE.Vector3(1, 0, 0)], ['y', new THREE.Vector3(0, 1, 0)], ['z', new THREE.Vector3(0, 0, 1)]]) {
    const b = toScreen(center.clone().addScaledVector(dir.applyQuaternion(q), probe));
    const sx = b.x - a.x, sy = b.y - a.y;
    const len = Math.hypot(sx, sy);
    frames[axis] = { ux: len ? sx / len : 0, uy: len ? sy / len : 0, pxPerUnit: len / probe };
  }
  return frames;
}

// Size of the selection along one scale axis, in world units: along the
// object's own axis for a whole object, along the world axis otherwise.
function extentAlongAxis(sm, axis, localAxes) {
  const mesh = sm.getMesh(sm.selection.meshId);
  if (localAxes && mesh && mesh.vertices.length) {
    let min = Infinity, max = -Infinity;
    for (const v of mesh.vertices) { if (v[axis] < min) min = v[axis]; if (v[axis] > max) max = v[axis]; }
    return (max - min) * Math.abs(mesh.scale[axis] || 1);
  }
  if (sm.isGroupMode?.()) {
    // The whole multi-selection, in world space.
    const box = new THREE.Box3();
    for (const id of sm.selectedMeshIds) {
      const m = sm.getMesh(id);
      if (!m) continue;
      const wm = sm.getWorldMatrix(m);
      for (const v of m.vertices) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm));
    }
    if (!box.isEmpty()) return box.getSize(new THREE.Vector3())[axis];
  }
  const bounds = sm.getSelectionBounds();
  return { x: bounds.sx, y: bounds.sy, z: bounds.sz }[axis] || 0;
}

// Touch gesture handling for SceneManager, extracted so SceneManager.js stays
// within the file size limit. Behavior is unchanged from when it lived inline.
export function applySceneGestures(SceneManager) {
  const P = SceneManager.prototype;

  P.setupEvents = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    el.addEventListener('lostpointercapture', (e) => {
      if (this.cameraGesture) this.onPointerUp(e);
    });
    this._cancelCameraOnBlur = () => {
      this.stopCameraMotion();
      if (this.cameraGesture) this._cameraTouchFrozen = true;
    };
    window.addEventListener('blur', this._cancelCameraOnBlur);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setupMouseEvents();
  };

  // Sculpt strokes are shared by touch and mouse. Begin returns true when the
  // press landed on an editable mesh; the FIRST mesh touched owns the stroke.
  P.beginSculptStroke = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    const ndc = this.screenToNDC(x, y);
    const hits = this.raycastMeshes(ndc.x, ndc.y);
    if (hits.length === 0) return false;
    const meshId = this.findMeshIdByObject(hits[0].object);
    const mesh = this.getMesh(meshId);
    if (!mesh || mesh.locked) return false;
    this.beginHeavyEdit(meshId);
    const wm = this.getWorldMatrix(mesh);
    const inv = new THREE.Matrix4().copy(wm).invert();
    const hitWorld = hits[0].point.clone();
    const localCenter = hitWorld.clone().applyMatrix4(inv);
    const stroke = {
      meshId, tool: this.sculptTool.tool, size: this.sculptTool.size,
      intensity: this.sculptTool.intensity, axes: this.sculptTool.axes || [], localCenter, hitWorld,
      startScreen: { x, y }, grabbed: null,
      undone: this.sculptTool.tool === 'smooth',
    };
    this.sculptStroke = stroke;
    if (this.sculptTool.tool === 'move') {
      stroke.grabbed = sculptGrabStart(this, mesh, localCenter, this.sculptTool.size);
    } else {
      this.pushUndo();
      this.applySculptBrush(mesh, stroke, hits[0]);
      if (this.selection.meshId === meshId) this.updateHighlights();
    }
    return true;
  };

  P.moveSculptStroke = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    const stroke = this.sculptStroke;
    if (!stroke) return;
    const mesh = this.getMesh(stroke.meshId);
    if (!mesh) return;
    if (stroke.tool === 'move') {
      if (!stroke.undone) { this.pushUndo(); stroke.undone = true; }
      const worldDelta = this.screenToWorldDrag(stroke.startScreen.x, stroke.startScreen.y, x, y, stroke.hitWorld);
      sculptGrabMove(this, mesh, stroke.grabbed, worldDelta, stroke.intensity, stroke.axes);
    } else {
      const ndc = this.screenToNDC(x, y);
      const hits = this.raycastMeshes(ndc.x, ndc.y);
      const hit = hits.find(h => this.findMeshIdByObject(h.object) === stroke.meshId);
      if (hit) {
        const wm = this.getWorldMatrix(mesh);
        const inv = new THREE.Matrix4().copy(wm).invert();
        stroke.localCenter = hit.point.clone().applyMatrix4(inv);
        this.applySculptBrush(mesh, stroke, hit);
      }
    }
    if (this.selection.meshId === stroke.meshId) this.updateHighlights();
  };

  P.onPointerDown = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    // Armed eyedropper: the first finger (or left click) is a color pick, not
    // a paint stroke, selection or camera move. It resolves on release.
    if (this.eyedropper && !this._eyedropDown && this.pointers.size === 0 && (e.pointerType !== 'mouse' || e.button === 0)) {
      e.preventDefault();
      this._eyedropDown = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'mouse') return this.onMouseDown(e);
    e.preventDefault();
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch {}
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now() });
    if (this.pointers.size === 1) this._quickTapCamera = { theta: this.cameraTheta, phi: this.cameraPhi, target: this.cameraTarget.clone(), distance: this.cameraDist };
    else this._quickTapCamera = null;
    // The camera is always free (orbit / pan / zoom, any number of fingers).
    // Gestures just never overlap: while the camera is moving, extra fingers
    // keep driving the camera and can never manipulate the selection.
    if (this.pointers.size === 1) {
      this.movedSignificantly = false;
      this.cameraGesture = false;
      this.gesture = null;
      this.gestureData = null;
      this.stopCameraMotion();
      this._resumeObjectGesture = false;
    } else if (this.gesture === 'translate' || this.gesture === 'manipulate') {
      // An object gesture is already committed — an extra finger never switches it.
      return;
    } else if (this.gesture === 'paint') {
      // A second finger ends the stroke and hands the fingers to the camera.
      this.endPaintStroke();
    }

    if (beginCameraTouch(this)) return;
    if (this.beginSceneLightGesture?.(e)) return;

    if (this.addVertexMode && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      this.gesture = 'add_vertex_pending';
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.paintTool && this.paintTool.tool !== 'fill' && !this.multiSelect && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      // Paint only starts on the object itself; a finger on empty space runs
      // the camera so the view stays navigable while brush/spray are active.
      const ndcP = this.screenToNDC(e.clientX, e.clientY);
      const paintHits = this.raycastMeshes(ndcP.x, ndcP.y);
      // A selected edge is a valid paint target across its touch reach. Exact
      // raycasts can miss the mathematical boundary between its two faces; that
      // must still begin paint, never fall through to camera orbit.
      const selectedEdgeHit = this.selection.type === 'edge' && this.selection.indices.length > 0
        && this.isPointNearSelection(e.clientX, e.clientY, theme.gestureSelectReach);
      if (paintHits.length > 0 || selectedEdgeHit) {
        // Touching a mesh with the brush/spray always paints it — auto-select
        // it first (object mode only) so a stroke never silently does nothing
        // just because nothing was selected yet.
        const hitMeshId = paintHits.length > 0
          ? this.findMeshIdByObject(paintHits[0].object)
          : this.selection.meshId;
        if (hitMeshId && this.selection.type === 'object') {
          const already = this.isGroupMode() ? this.selectedMeshIds.includes(hitMeshId) : this.selection.meshId === hitMeshId;
          if (!already) this.setSelection({ meshId: hitMeshId, type: 'object', indices: [] });
        }
        this.gesture = 'paint';
        this.gestureData = { lastX: e.clientX, lastY: e.clientY };
        // An unapplied color preview never sticks: a stroke discards it first.
        this.cancelPaintPreview();
        // Nothing commits until Apply; the stroke joins the pending batch.
        this.beginPendingPaint();
        this.paintAt(e.clientX, e.clientY);
        return;
      }
      this.gesture = 'orbit_pending';
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return;
    }

    // Sculpt mode: a single finger on a mesh deforms it (smooth or grab-move);
    // the FIRST mesh touched owns the whole stroke (lift to sculpt another).
    if (this.sculptTool && this.sculptTool.active && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      if (this.beginSculptStroke(e.clientX, e.clientY)) {
        this.gesture = 'sculpt';
        return;
      }
      // No mesh under the finger → orbit (skip press-hold/multi-select while sculpting).
      this.gesture = 'orbit_pending';
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return;
    }

    // Cut modes: one finger taps a position on an edge (drag still orbits).
    if (this.cutMode && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      if (this.beginCutDrag(e.clientX, e.clientY)) {
        this.gesture = 'cut_drag';
        return;
      }
      this.gesture = 'cut_pending';
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return;
    }

    // Measure mode: a tap snaps a measure point onto the nearest vertex or
    // edge; a drag from anywhere still orbits the camera.
    if (this.measureMode && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      this.gesture = 'measure_pending';
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.drawMode && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      this.gesture = 'draw';
      this.beginDrawFaceStroke(e.clientX, e.clientY);
      return;
    }

    // Any extrude — edge or face — must be grabbed ON or immediately beside the
    // thing being extruded. A drag started away from it runs the camera, so
    // panning/orbiting can never accidentally pull an extrusion.
    if (this.extrudeDrag && this.pointers.size === 1) {
      clearTimeout(this.pressHoldTimer);
      const canGrab = this.isPointOverSelection(e.clientX, e.clientY)
        || this.isPointNearSelection(e.clientX, e.clientY, theme.gestureSelectReach);
      if (canGrab) this.beginHeavyEdit();
      this.gesture = canGrab ? 'extrude_drag' : 'orbit_pending';
      this.gestureData = canGrab ? { startX: e.clientX, startY: e.clientY } : null;
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.pointers.size === 1) {
      this.dragStartScreen = { x: e.clientX, y: e.clientY };
      // The radial preview is one provisional selection. A finger on ANY
      // copy moves the entire ring, and no hold/tap can split its selection.
      if (this._radialArray) {
        clearTimeout(this.pressHoldTimer);
        this.gesture = this.isPointOverSelection(e.clientX, e.clientY)
          || this.isPointNearSelection(e.clientX, e.clientY, theme.gestureSelectReach)
          ? 'translate_pending' : 'orbit_pending';
        return;
      }
      // Multi-select already active: in object mode, a drag started ON a selected
      // object moves the whole group; a drag on an unselected object paints it in;
      // a tap (no move) toggles. Sub-object modes always paint-add on drag.
      if (this.multiSelect) {
        clearTimeout(this.pressHoldTimer);
        this._msPainted = false;
        // A drag that begins on an existing multi-selection manipulates that
        // selection in every mode. Releasing after a real drag exits the
        // staging mode while retaining the selected elements; only a clean tap
        // continues to the selection-toggle behavior below.
        // The same small screen-space margin as the normal one-finger drag, so a
        // thin selected part (a tube, a frame rail) can be grabbed without a
        // pixel-perfect hit.
        if (!this.surfaceMode && this.selection.meshId && (this.isPointOverSelection(e.clientX, e.clientY)
          || this.isPointNearSelection(e.clientX, e.clientY, theme.gestureSelectReach))) {
          this.gesture = 'translate_pending';
          this.gestureData = { lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, axis: null };
          return;
        }
        const ndcMs = this.screenToNDC(e.clientX, e.clientY);
        let onGeomMs = false;
        if (this.selectionMode === 'vertex') onGeomMs = !!this.findClosestVertex(ndcMs.x, ndcMs.y, 0.1);
        else if (this.selectionMode === 'edge') onGeomMs = !!this.findClosestEdge(ndcMs.x, ndcMs.y, 0.1);
        else onGeomMs = this.raycastMeshes(ndcMs.x, ndcMs.y).length > 0;
        if (!onGeomMs) {
          this.gesture = 'orbit_pending';
          return;
        }
        // In multi-select, a drag across geometry never selects: it runs the
        // camera. Paint-select only arms after a press-hold.
        this.gesture = 'orbit_pending';
        this.gestureData = null;
        this.pressHoldTimer = setTimeout(() => {
          if (this.movedSignificantly || this.pointers.size !== 1) return;
          if (this.surfaceMode && this.surfaceSection === 'texture') return;
          this.gesture = 'multiselect_hold';
          this.gestureData = null;
          this._msPainted = true;
          if (this.selectionMode === 'object') {
            const hits = this.raycastMeshes(ndcMs.x, ndcMs.y);
            const id = hits.length > 0 ? this.findMeshIdByObject(hits[0].object) : null;
            if (id && !this.selectedMeshIds.includes(id)) {
              this.selectedMeshIds.push(id);
              this.selection = { meshId: id, type: 'object', indices: [] };
              this.updateHighlights();
              this.updateStats();
            }
          } else {
            this.selectAtPointAdd(e.clientX, e.clientY);
          }
        }, theme.gestureHoldDelay);
        return;
      }
      // A one-finger transform must start directly on the selected geometry or
      // within a very small screen-space margin. Everything else controls camera.
      // Surface mode never transforms objects — the finger only selects/paints.
      const overSelection = !this.surfaceMode && (this.isPointOverSelection(e.clientX, e.clientY)
        || this.isPointNearSelection(e.clientX, e.clientY, theme.gestureSelectReach));
      const ndc = this.screenToNDC(e.clientX, e.clientY);
      let onGeometry = false;
      if (this.selectionMode === 'vertex') onGeometry = !!this.findClosestVertex(ndc.x, ndc.y, 0.1);
      else if (this.selectionMode === 'edge') onGeometry = !!this.findClosestEdge(ndc.x, ndc.y, 0.1);
      else onGeometry = this.raycastMeshes(ndc.x, ndc.y).length > 0;

      if (overSelection) {
        this.gesture = 'translate_pending';
      } else {
        this.gesture = 'orbit_pending';
      }

      // Press-hold: on geometry → enter multi-select and seed it; on empty
      // space → marquee selection frame.
      this.pressHoldTimer = setTimeout(() => {
        if (!this.movedSignificantly && this.pointers.size === 1) {
          if (this.surfaceMode && this.surfaceSection === 'texture') return;
          if (onGeometry) {
            this.enterMultiSelect();
            if (this.selectionMode === 'object') {
              const hits = this.raycastMeshes(ndc.x, ndc.y);
              if (hits.length > 0) {
                const id = this.findMeshIdByObject(hits[0].object);
                if (id) {
                  if (!this.selectedMeshIds.includes(id)) this.selectedMeshIds.push(id);
                  this.selection = { meshId: id, type: 'object', indices: [] };
                }
              }
              this.updateHighlights();
              this.updateStats();
            } else {
              this.selectAtPointAdd(e.clientX, e.clientY);
            }
            this.gesture = 'multiselect_hold';
            this.gestureData = null;
          } else {
            this.gesture = 'marquee';
            this.gestureData = { startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY };
            if (this.selectionMode === 'object' || this.selectionMode === 'vertex' || this.selectionMode === 'edge' || this.selectionMode === 'face') this.enterMultiSelect();
            this.updateMarquee();
          }
        }
      }, theme.gestureHoldDelay);
    } else if (this.pointers.size === 2) {
      clearTimeout(this.pressHoldTimer);
      // A second finger aborts a selection frame that is still being drawn.
      if (this.gesture === 'marquee') {
        this.cb.onMarqueeChange?.(null);
        this.closeEmptyMultiSelect();
      }
      const pts = [...this.pointers.values()];
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      // Two fingers grab the selection only when they are ON it or right beside
      // it (tight buffer) — a pinch out in empty space runs the camera instead
      // of silently resizing the selected object.
      const overSelection = this.isPointOverSelection(pts[0].x, pts[0].y) || this.isPointOverSelection(pts[1].x, pts[1].y)
        || this.isPointNearSelection(pts[0].x, pts[0].y, theme.gestureSelectReach) || this.isPointNearSelection(pts[1].x, pts[1].y, theme.gestureSelectReach);

      // While sculpting, two fingers always run the camera (never object manipulate).
      if (this.sculptTool && this.sculptTool.active) {
        this.sculptStroke = null;
        this.gesture = 'camera_two';
        this.gestureData = {
          startDist: dist, startAngle: angle,
          startMidX: midX, startMidY: midY,
          lastMidX: midX, lastMidY: midY, lastDist: dist, lastAngle: angle,
        };
        return;
      }

      if (this.selection.meshId && (overSelection || this._resumeObjectGesture) && !this.cameraGesture && !this.surfaceMode) {
        this.gesture = 'manipulate';
        this.gestureData = {
          startDist: dist, startAngle: angle,
          startMidX: midX, startMidY: midY,
          mode: null,
          center: this.getSelectionCenter(),
        };
      } else {
        this.gesture = 'camera_two';
        this.cameraGesture = true;
        this.gestureData = {
          startDist: dist, startAngle: angle,
          startMidX: midX, startMidY: midY,
          lastMidX: midX, lastMidY: midY,
          lastDist: dist,
          lastAngle: angle,
        };
      }
    }
  };

  P.onPointerMove = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    if (e.pointerType === 'mouse') return this.onMouseMove(e);
    if (!this.pointers.has(e.pointerId)) return;
    if (this.cameraGesture && this._cameraTouchFrozen) return;
    // Touch can remain captured by the canvas while the finger glides across
    // a toolbar or a tool-name label. Don't orbit the scene under that UI.
    // This only pauses camera motion, not an intentional modeling drag.
    if (this.cameraGesture && typeof document !== 'undefined') {
      const ui = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(
        'button, input, [role="button"], [role="textbox"], .modeling-panel'
      );
      if (ui) {
        const current = this.pointers.get(e.pointerId);
        current.x = e.clientX;
        current.y = e.clientY;
        this.stopCameraMotion();
        return;
      }
    }
    const ptr = this.pointers.get(e.pointerId);
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    ptr.x = e.clientX; ptr.y = e.clientY;

    if (this._cameraHandoffGuard && this.pointers.size === 1 && this.cameraGesture) {
      const moved = Math.hypot(e.clientX - this._cameraHandoffGuard.x, e.clientY - this._cameraHandoffGuard.y);
      if (moved < 7) return;
      this._cameraHandoffGuard = null;
      resetCameraTouchSpeed(this);
    }

    const totalMove = Math.hypot(e.clientX - ptr.startX, e.clientY - ptr.startY);
    if (totalMove > theme.gestureMoveThreshold) {
      this.movedSignificantly = true;
      clearTimeout(this.pressHoldTimer);
    }

    if (this.updateSceneLightGesture?.(e)) return;

    if (this.gesture === 'sculpt' && this.pointers.size === 1) {
      this.moveSculptStroke(e.clientX, e.clientY);
      return;
    }

    if (this.gesture === 'paint' && this.pointers.size === 1) {
      // Follow the finger's actual path: interpolate between move events so a
      // fast stroke lays down continuous paint instead of separated dabs.
      const d = this.gestureData || (this.gestureData = { lastX: e.clientX, lastY: e.clientY });
      const distP = Math.hypot(e.clientX - d.lastX, e.clientY - d.lastY);
      // Dab spacing scales with the brush so big brushes stay responsive.
      const spacing = Math.max(6, (this._paintStroke?.screenRadius || 0) * 0.35);
      const steps = Math.min(6, Math.max(1, Math.round(distP / spacing)));
      for (let i = 1; i <= steps; i++) {
        this.paintAt(d.lastX + (e.clientX - d.lastX) * (i / steps), d.lastY + (e.clientY - d.lastY) * (i / steps));
      }
      d.lastX = e.clientX; d.lastY = e.clientY;
      return;
    }

    if (this.gesture === 'cut_drag' && this.pointers.size === 1) {
      this.dragCutTo(e.clientX, e.clientY);
      return;
    }

    if (this.gesture === 'add_vertex_pending' && this.pointers.size === 1) {
      if (this.movedSignificantly) this.queueCameraMove('orbit', dx, dy);
      return;
    }

    if (this.gesture === 'cut_pending' && this.pointers.size === 1) {
      if (this.movedSignificantly) this.queueCameraMove('orbit', dx, dy);
      return;
    }

    if (this.gesture === 'measure_pending' && this.pointers.size === 1) {
      if (this.movedSignificantly) this.queueCameraMove('orbit', dx, dy);
      return;
    }

    if (this.gesture === 'draw' && this.pointers.size === 1) {
      this.appendDrawFacePoint(e.clientX, e.clientY);
      return;
    }

    if (this.gesture === 'extrude_drag') {
      if (this.extrudeDrag.freeDrag) {
        const center = this.getSelectionCenter();
        const worldDelta = this.screenToWorldDrag(this.gestureData.startX, this.gestureData.startY, e.clientX, e.clientY, center);
        if (worldDelta.lengthSq() > 1e-8) {
          this.extrudeDrag.hasDragged = true;
          this.updateExtrudeFree(worldDelta);
        }
        return;
      }
      const offset = this.extrudeOffsetFromDrag(this.gestureData.startX, this.gestureData.startY, e.clientX, e.clientY);
      if (Math.abs(offset) > 1e-4) {
        this.extrudeDrag.hasDragged = true;
        this.updateExtrudeHeight(offset);
      }
      return;
    }

    if (this.gesture === 'multiselect_hold' && this.pointers.size === 1) {
      if (this.movedSignificantly) {
        this.gesture = 'multiselect_paint';
        this.gestureData = { lastX: e.clientX, lastY: e.clientY, started: true };
        this._msPainted = true;
        this.selectAtPointAdd(e.clientX, e.clientY);
      }
      return;
    }
    if (this.gesture === 'multiselect_paint' && this.pointers.size === 1) {
      const d = this.gestureData;
      const mdx = e.clientX - d.lastX, mdy = e.clientY - d.lastY;
      if (!d.started || Math.hypot(mdx, mdy) > 6) {
        if (this.selectAtPointAdd(e.clientX, e.clientY)) this._msPainted = true;
        d.lastX = e.clientX; d.lastY = e.clientY; d.started = true;
      }
      return;
    }

    if (this.pointers.size === 1) {
      if (this.gesture === 'marquee') {
        this.gestureData.curX = e.clientX;
        this.gestureData.curY = e.clientY;
        this.updateMarquee();
      } else if (this.gesture === 'translate_pending') {
        // Faces and edges get a deliberate grace distance before a transform
        // commits, preventing a selection tap from immediately dragging geometry.
        // In multi-select the same grace applies, so a tap on a selected item
        // toggles it off instead of being read as a tiny drag.
        const translateGrace = this.multiSelect || this.selection.type === 'face' || this.selection.type === 'edge' ? 8 : 0.5;
        if (totalMove > translateGrace) {
          this.movedSignificantly = true;
          clearTimeout(this.pressHoldTimer);
          if (this.selection.meshId || this.isGroupMode()) {
            this.gesture = 'translate';
            this.gestureData = { lastX: ptr.startX, lastY: ptr.startY, startX: ptr.startX, startY: ptr.startY, axis: null, moveCenter: this.getSelectionCenter().clone() };
            this.activeAction = 'move';
            if (this.multiSelect) this._msManipulated = true;
            this.beginHeavyEdit();
            this.pushUndo();
          } else {
            this.gesture = 'orbit';
          }
        }
      }

      if (this.gesture === 'orbit' || this.gesture === 'orbit_pending') {
        if (this.movedSignificantly) {
          const firstMove = this.gesture === 'orbit_pending';
          this.gesture = 'orbit';
          this.cameraGesture = true;
          this.queueCameraMove('orbit', firstMove ? e.clientX - ptr.startX : dx, firstMove ? e.clientY - ptr.startY : dy);
        }
      } else if (this.gesture === 'translate') {
        const center = this.getSelectionCenter();
        const origin = this.gestureData.moveCenter;
        // Derive every frame from the original touch and selection position.
        // Incremental deltas fight snap corrections and cause drag lag/drift.
        const worldDelta = this.screenToWorldDrag(
          this.gestureData.startX, this.gestureData.startY,
          e.clientX, e.clientY, origin
        ).multiplyScalar(this.precisionFactor ?? 1);
        if (this.freeMove) {
          this.activeAxis = null;
          // Use the entire drag, not tiny incremental deltas that grid snapping
          // can repeatedly swallow and make Free Move appear stuck.
          this.translateSelection(origin.clone().add(worldDelta).sub(center));
        } else {
          if (!this.gestureData.axis) {
            const ax = Math.abs(worldDelta.x), ay = Math.abs(worldDelta.y), az = Math.abs(worldDelta.z);
            this.gestureData.axis = ax >= ay && ax >= az ? 'x' : (ay >= az ? 'y' : 'z');
            this.activeAxis = this.gestureData.axis;
          }
          const axisDelta = new THREE.Vector3();
          axisDelta[this.gestureData.axis] = origin[this.gestureData.axis] + worldDelta[this.gestureData.axis] - center[this.gestureData.axis];
          this.translateSelection(axisDelta);
        }
        this.gestureData.lastX = e.clientX;
        this.gestureData.lastY = e.clientY;
      }
    } else if (this.pointers.size === 2 && this.gesture === 'camera_two') {
      this.scheduleCameraTwoFinger();
    } else if (this.pointers.size === 2 && this.gesture === 'manipulate') {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);

      const angleDelta = Math.atan2(Math.sin(angle - this.gestureData.startAngle), Math.cos(angle - this.gestureData.startAngle));
      const panDx = midX - this.gestureData.startMidX;
      const panDy = midY - this.gestureData.startMidY;

      if (this.gestureData.mode === null) {
        const pinchChange = Math.abs(dist - this.gestureData.startDist);
        const angleChange = Math.abs(angleDelta);
        const panChange = Math.hypot(panDx, panDy);
        const rotChange = dist * angleChange;

        const maxChange = Math.max(pinchChange, rotChange, panChange);
        const subObjectGrace = this.selection.type === 'face' ? 5 : this.selection.type === 'edge' ? 10 : 5;
        if (maxChange < subObjectGrace) return;
        // Only ONE finger needs to move: anchoring a finger on the object and
        // spreading/pinching/twisting with the other is the normal gesture, and
        // requiring both to move meant it never engaged at all.
        const movedPointers = pts.filter((p) => Math.hypot(p.x - p.startX, p.y - p.startY) > 3).length;
        if (movedPointers === 0) return;
        const now = performance.now();
        if (!this.gestureData.firstMoveAt) this.gestureData.firstMoveAt = now;
        if (movedPointers === 1 && now - this.gestureData.firstMoveAt < LONE_FINGER_WAIT_MS) return;
        // Pointer moves arrive one finger at a time. Never commit scaling from
        // the first moved-finger event: that transient distance change made a
        // same-direction slide look like a huge pinch and caused the jump. A
        // genuinely anchored-finger pinch engages on its next movement event.
        if (movedPointers === 1 && !this.gestureData.singlePointerSeen) {
          this.gestureData.singlePointerSeen = true;
          return;
        }
        if (movedPointers === 1 && maxChange < (this.selection.type === 'face' ? 8 : 12)) return;

        // Rotation gets a generous buffer: full weight on the twist score and a
        // low activation angle so twisting the selection engages easily.
        const rotScore = rotChange;
        const pinchMin = theme.gesturePinchThreshold;
        // Single-axis scale (both fingers sliding together) engages on a shorter
        // drag, and pinch has to clearly beat it to take over instead.
        const panMin = Math.max(3, pinchMin * 0.5);
        // Two fingers travelling in the same direction are an axis slide, even
        // though their pointermove events arrive one at a time and briefly look
        // like a pinch. Waiting for both movement vectors prevents that transient
        // distance change from stealing the gesture as uniform scale.
        const p0dx = pts[0].x - pts[0].startX, p0dy = pts[0].y - pts[0].startY;
        const p1dx = pts[1].x - pts[1].startX, p1dy = pts[1].y - pts[1].startY;
        const p0len = Math.hypot(p0dx, p0dy), p1len = Math.hypot(p1dx, p1dy);
        const parallelSlide = p0len > 3 && p1len > 3 && (p0dx * p1dx + p0dy * p1dy) / (p0len * p1len) > 0.82;
        // A selected face must respond to a deliberate twist before the same
        // pointer movement is mistaken for pinch or axis-scale. This is
        // especially important after extrusion, when the new cap is already
        // selected and should rotate immediately under two fingers.
        const faceTwist = this.selection.type === 'face'
          && !parallelSlide
          && angleChange > 0.045
          && rotScore >= panChange * 1.25
          && rotScore >= pinchChange * 0.8;
        if (faceTwist) {
          this.gestureData.mode = 'rotate';
          this.activeAction = 'rotate';
          this.activeAxis = null;
          this.activeRotation = 0;
          this.activeRotationAxis = null;
          this.rotatePivot = this.getSelectionCenter();
          this.pushUndo();
        } else if (parallelSlide && panChange > panMin) {
          this.gestureData.mode = 'axis_scale';
          this.activeAction = 'scale';
          this.pushUndo();
          // Scale along whichever axis lines up best with the drag ON SCREEN.
          // Axes pointing almost straight at the camera are skipped: their
          // screen direction is just noise.
          const axMesh = this.getMesh(this.selection.meshId);
          this.gestureData.localAxes = this.selection.type === 'object' && axMesh && !this.isGroupMode();
          const frames = dragAxisFrames(this, this.gestureData.localAxes);
          const maxPx = Math.max(frames.x.pxPerUnit, frames.y.pxPerUnit, frames.z.pxPerUnit);
          const dragLen = Math.hypot(panDx, panDy) || 1;
          let bestAxis = 'x', bestScore = -1;
          for (const axis of ['x', 'y', 'z']) {
            const fr = frames[axis];
            if (fr.pxPerUnit < maxPx * 0.3) continue;
            const score = Math.abs(panDx * fr.ux + panDy * fr.uy) / dragLen;
            if (score > bestScore) { bestScore = score; bestAxis = axis; }
          }
          this.gestureData.axis = bestAxis;
          this.gestureData.axisFrame = frames[bestAxis];
          this.activeAxis = bestAxis;
          this.gestureData.axisSign = 1;
          // The object's own size along that axis (not its on-screen box,
          // which after a rotation can be far smaller and made scaling race).
          const extent = extentAlongAxis(this, bestAxis, this.gestureData.localAxes);
          // Scale against the full selected extent. Using one quarter of the
          // extent multiplied finger travel by four and made the object shoot
          // across the viewport as soon as an axis-scale gesture engaged.
          this.gestureData.startOffset = Math.max(0.2, extent * 0.25);
          this.gestureData.lastRatio = 1;
          this.gestureData.smoothRatio = 1;
          // The movement used to recognize the gesture must not also resize the
          // selection. Rebase at activation so scaling starts from this exact
          // finger position, then follows subsequent movement at full speed.
          this.gestureData.startMidX = midX;
          this.gestureData.startMidY = midY;
          if (this.freeScale) {
            this.gestureData.mode = 'free_scale';
            beginFreeScale(this, this.gestureData);
          }
        } else if (pinchChange > pinchMin && pinchChange >= rotScore && pinchChange > panChange * 1.5) {
          this.gestureData.mode = 'scale';
          this.activeAction = 'scale';
          this.activeAxis = null;
          this.gestureData.scaleRefDist = dist;
          this.gestureData.lastFactor = 1;
          this.pushUndo();
        } else if (!parallelSlide && angleChange > 0.045
          && rotScore >= panChange * 1.25) {
          this.gestureData.mode = 'rotate';
          this.activeAction = 'rotate';
          this.activeAxis = null;
          this.activeRotation = 0;
          this.activeRotationAxis = null;
          this.rotatePivot = this.getSelectionCenter();
          this.pushUndo();
        } else if (angleChange <= 0.06 && pinchChange > pinchMin && pinchChange > panChange) {
          this.gestureData.mode = 'scale';
          this.activeAction = 'scale';
          this.activeAxis = null;
          this.gestureData.scaleRefDist = dist;
          this.gestureData.lastFactor = 1;
          this.pushUndo();
        } else {
          return;
        }
      }

      // Any committed two-finger transform leaves multi-select on release,
      // while preserving the resulting selection.
      if (this.multiSelect && this.gestureData.mode) this._msManipulated = true;
      if (this.gestureData.mode) this.beginHeavyEdit();

      if (this.gestureData.mode === 'rotate' && this.freeRotate) {
        updateFreeRotation(this, this.gestureData, midX, midY, angleDelta);
        this.gestureData.startAngle = angle;
      } else if (this.gestureData.mode === 'free_scale') {
        updateFreeScale(this, this.gestureData, midX, midY);
      } else if (this.gestureData.mode === 'rotate') {
        if (Math.abs(angleDelta) > 0.004) {
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          const ax = Math.abs(camDir.x), ay = Math.abs(camDir.y), az = Math.abs(camDir.z);
          const axisVec = ax >= ay && ax >= az
            ? new THREE.Vector3(Math.sign(camDir.x) || 1, 0, 0)
            : ay >= az
              ? new THREE.Vector3(0, Math.sign(camDir.y) || 1, 0)
              : new THREE.Vector3(0, 0, Math.sign(camDir.z) || 1);
          const rotDelta = angleDelta * (theme.gestureRotateSensitivity ?? 1) * (this.precisionFactor ?? 1);
          this.rotateSelectionAroundAxis(rotDelta, axisVec);
          this.activeRotation = (this.activeRotation || 0) + rotDelta;
          if (!this.activeRotationAxis) {
            this.activeRotationAxis = axisVec.x !== 0 ? 'x' : axisVec.y !== 0 ? 'y' : 'z';
            this.activeAxis = this.activeRotationAxis;
          }
          this.gestureData.startAngle = angle;
        }
      } else if (this.gestureData.mode === 'axis_scale') {
        // The chosen AXIS still follows the view, but the SCALE SIGN must
        // follow the user's screen gesture, never the world-axis projection.
        // Right and up always grow; left and down always shrink, even after
        // orbiting to the opposite side of the model.
        const fr = this.gestureData.axisFrame;
        const dx = midX - this.gestureData.startMidX;
        const dy = midY - this.gestureData.startMidY;
        const horizontal = Math.abs(fr?.ux || 0) >= Math.abs(fr?.uy || 0);
        const screenTravel = horizontal ? dx : -dy;
        const along = fr && fr.pxPerUnit > 0 ? screenTravel / fr.pxPerUnit : 0;
        // Gesture activation is rebased above, so recognition movement cannot
        // resize the selection. Apply the post-activation drag directly; easing
        // it by half made deliberate scaling feel stuck on a phone.
        const amount = along * (this.gestureData.axisSign || 1) * (theme.gestureScaleSensitivity ?? 1) * 0.35 * (this.precisionFactor ?? 1);
        // Growth is linear in the drag; shrink is hyperbolic (startOffset /
        // (startOffset - amount)), which approaches zero smoothly and never
        // actually reaches it — so a long shrink drag can never snap or
        // collapse the object flat, while still having no fixed limit.
        const target = amount >= 0
          ? (this.gestureData.startOffset + amount) / this.gestureData.startOffset
          : this.gestureData.startOffset / (this.gestureData.startOffset - amount);
        const ratio = target;
        this.gestureData.smoothRatio = ratio;
        const f = ratio / (this.gestureData.lastRatio || 1);
        if (Math.abs(f - 1) > 0.002) {
          this.scaleSelectionAxis(this.gestureData.axis, f);
          this.gestureData.lastRatio = ratio;
        }
      } else if (this.gestureData.mode === 'scale') {
        // Linear pinch: the scale change is proportional to how many PIXELS the
        // fingers moved (relative to the gesture's starting spread), not to the
        // ratio of finger distances — so scaling runs at a constant speed and
        // never accelerates as the object (or the finger spread) gets smaller.
        // The tiny epsilon only keeps the factor from reaching zero/negative.
        const ref = Math.max(60, this.gestureData.scaleRefDist || dist);
        const target = Math.max(
          0.001,
          1 + (dist - this.gestureData.scaleRefDist) * (theme.gestureScaleSensitivity ?? 1) * (this.precisionFactor ?? 1) / ref
        );
        const f = target / (this.gestureData.lastFactor || 1);
        if (Math.abs(f - 1) > 0.001) {
          this.scaleSelection(f);
          this.gestureData.lastFactor = target;
        }
      }
    }
  };

  P.onPointerUp = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    if (this._eyedropDown && e.pointerId === this._eyedropDown.id) {
      const d = this._eyedropDown;
      this._eyedropDown = null;
      if (e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) {
        const color = this.sampleColorAt(e.clientX, e.clientY);
        if (color) this.eyedropper?.(color);
      }
      return;
    }
    if (e.pointerType === 'mouse') return this.onMouseUp(e);
    // A finger that never pressed DOWN on the canvas must not be treated as a
    // canvas tap. Dismiss overlays close their layer on press and then unmount,
    // so the release lands here — and without this guard that release ran the
    // empty-tap handler too, closing a second layer from one tap.
    if (!this.pointers.has(e.pointerId)) return;
    // Flush the last paired position before either finger disappears; otherwise
    // the scheduled pan/zoom frame can drop that movement on release.
    if (this.gesture === 'camera_two' && this.pointers.size === 2) {
      if (this._cameraTwoFingerFrame) cancelAnimationFrame(this._cameraTwoFingerFrame);
      this._cameraTwoFingerFrame = null;
      this.applyCameraTwoFinger();
    }
    const pointer = this.pointers.get(e.pointerId);
    const quickTap = this.pointers.size === 1 && pointer && this._quickTapCamera &&
      performance.now() - pointer.startTime < 240 &&
      Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 22 &&
      (this.gesture === 'orbit' || this.gesture === 'orbit_pending');
    if (quickTap) {
      // The tap's movement was held back and never shown, so this restore
      // changes nothing on screen; it only guards against stray input.
      discardTapMotion(this);
      this.stopCameraMotion();
      this.cameraTheta = this._quickTapCamera.theta;
      this.cameraPhi = this._quickTapCamera.phi;
      this.cameraTarget.copy(this._quickTapCamera.target);
      this.cameraDist = this._quickTapCamera.distance;
      this.applyCamera();
      this.cameraGesture = false;
      this.movedSignificantly = false;
      this.gesture = 'orbit_pending';
    }
    this._quickTapCamera = null;
    const cameraTouchEnded = quickTap ? false : endCameraTouch(this, e);
    this.pointers.delete(e.pointerId);
    clearTimeout(this.pressHoldTimer);
    // Last finger up: restore any detail that was skipped during the gesture.
    if (this.pointers.size === 0) this.endHeavyEdit();
    if (cameraTouchEnded) {
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.updateHud();
      return;
    }

    if (this.finishSceneLightGesture?.()) return;

    if (this.gesture === 'sculpt') {
      this.sculptStroke = null;
      if (this.pointers.size === 0) {
        this.activeAction = 'idle';
        this.activeAxis = null;
        this.gesture = null;
        this.gestureData = null;
        this.updateHud();
      } else {
        this.cameraGesture = true;
        this.gesture = 'orbit_pending';
        this.gestureData = null;
      }
      return;
    }

    if (this.gesture === 'paint') {
      this.endPaintStroke();
      this.gesture = null;
      this.gestureData = null;
      return;
    }

    if (this.gesture === 'cut_drag') {
      this.endCutDrag();
      this.gesture = null;
      this.gestureData = null;
      return;
    }

    if (this.gesture === 'add_vertex_pending') {
      if (!this.movedSignificantly) this.handleAddVertexTap(e.clientX, e.clientY);
      this.gesture = null;
      this.gestureData = null;
      return;
    }

    if (this.gesture === 'cut_pending') {
      if (!this.movedSignificantly) this.handleCutTap(e.clientX, e.clientY);
      this.gesture = null;
      this.gestureData = null;
      return;
    }

    if (this.gesture === 'measure_pending') {
      if (!this.movedSignificantly) this.measureTap(e.clientX, e.clientY);
      this.gesture = null;
      this.gestureData = null;
      return;
    }

    if (this.gesture === 'draw') {
      this.finishDrawFaceStroke(e.clientX, e.clientY);
      this.gesture = null;
      this.gestureData = null;
      return;
    }

    if (this.gesture === 'extrude_drag') {
      this.commitExtrudeDrag();
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.gesture = null;
      this.gestureData = null;
      this.updateHud();
      return;
    }

    if (this.gesture === 'marquee') {
      this.applyMarquee();
      this.cb.onMarqueeChange?.(null);
      this.closeEmptyMultiSelect();
    }

    if (this.pointers.size === 0) {
      // All fingers lifted after a camera move: clear the lock, no tap handling.
      if (this.cameraGesture) {
        this.cameraGesture = false;
        this.gesture = null;
        this.gestureData = null;
        this.activeAction = 'idle';
        this.activeAxis = null;
        this.updateHud();
        return;
      }
      if (!this.movedSignificantly) {
        // Only a genuinely empty canvas tap may dismiss an open panel. Tapping
        // geometry must continue through to selection while Surface stays open.
        const tapNdc = this.screenToNDC(e.clientX, e.clientY);
        const tapHitsGeometry = this.raycastMeshes(tapNdc.x, tapNdc.y).length > 0;
        const panelHandled = !tapHitsGeometry && this.cb.onEmptyTap?.();
        if (panelHandled) {
          this.activeAction = 'idle';
          this.activeAxis = null;
          this.gesture = null;
          this.gestureData = null;
          this.updateHud();
          return;
        }
        // After manipulating a multi-selection, tapping its geometry (or an
        // adjacent face sharing a selected vertex) clears the entire group.
        if (this._postMultiActionSelection && tapHitsGeometry) {
          const hits = this.raycastMeshes(tapNdc.x, tapNdc.y);
          const meshId = hits.length ? this.findMeshIdByObject(hits[0].object) : null;
          let attached = this.selectedMeshIds.includes(meshId) || meshId === this.selection.meshId;
          if (!attached && this.selection.type === 'face' && meshId === this.selection.meshId) attached = true;
          if (attached) {
            this._postMultiActionSelection = false;
            this.exitMultiSelect();
            this.clearSelection();
            this.gesture = null;
            this.gestureData = null;
            this.activeAction = 'idle';
            this.updateHud();
            return;
          }
        }
        // A press-hold that just entered multi-select already selected the
        // object under the finger. Running the toggle on release would remove
        // it again, so the object you were holding must stay selected.
        if (this.gesture === 'multiselect_hold') {
          this.activeAction = 'idle';
          this.activeAxis = null;
          this.gesture = null;
          this.gestureData = null;
          this.updateHud();
          return;
        }
        if (this._radialArray) {
          // A tap on a preview copy cannot silently deselect the array or
          // turn an uncommitted ring into a single-object selection.
          this.radialArraySelectPreview();
        } else if (this.multiSelect && !this._msPainted) {
          let hit = false;
          if (this.selectionMode === 'object') hit = this.toggleObjectAtScreenPoint(e.clientX, e.clientY);
          else hit = this.toggleSelectionAtScreenPoint(e.clientX, e.clientY);
          if (!hit) { this.exitMultiSelect(); this.clearSelection(); }
          else if (this.selectionMode === 'object') {
            this.selection = { meshId: this.selectedMeshIds[0] || null, type: 'object', indices: [] };
            this.updateHighlights();
            this.updateStats();
          }
        } else if (this.gesture === 'translate_pending') {
          if (this.selectionMode === 'object') {
            const ndcUp = this.screenToNDC(e.clientX, e.clientY);
            const hitsUp = this.raycastMeshes(ndcUp.x, ndcUp.y);
            const idUp = hitsUp.length > 0 ? this.findMeshIdByObject(hitsUp[0].object) : null;
            if (!idUp || idUp === this.selection.meshId) this.clearSelection();
            else this.setSelection({ meshId: idUp, type: 'object', indices: [] });
          } else if (!this.deselectAtPoint(e.clientX, e.clientY)) {
            this.selectAtScreenPoint(e.clientX, e.clientY);
          }
        } else if (this.gesture === 'orbit_pending') {
          // Selecting never paints: the panel checkmark applies the color.
          this.selectAtScreenPoint(e.clientX, e.clientY);
        }
      }
      if (this.multiSelect && (this.gesture === 'translate' || this._msManipulated)) {
        this._postMultiActionSelection = true;
        this.exitMultiSelect();
      }
      this._msManipulated = false;
      this._resumeObjectGesture = false;
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.activeRotation = 0;
      this.activeRotationAxis = null;
      this.rotatePivot = null;
      this.gesture = null;
      this.gestureData = null;
      this.updateHud();
    } else {
      // Once a two-finger gesture has started, lifting one finger must never
      // hand the remaining finger off to one-finger orbit. Real touch releases
      // are never perfectly simultaneous, and that tiny gap otherwise causes
      // the camera to jump as the second finger leaves the glass.
      if (this.gesture === 'manipulate' || this.gesture === 'translate' || this.gesture === 'translate_pending') {
        if (this.multiSelect && this.gesture === 'manipulate' && this.gestureData?.mode) this._msManipulated = true;
        this._resumeObjectGesture = true;
        this.gesture = 'object_paused';
        this.gestureData = null;
      } else {
        this.cameraGesture = true;
        this.gesture = 'camera_release_lock';
        this.gestureData = null;
      }
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.activeRotation = 0;
      this.activeRotationAxis = null;
      this.rotatePivot = null;
      this.updateHud();
    }
  };

  // Coalesce interleaved pointer events so pan and dolly use both fingers'
  // latest positions together once per frame.
  P.scheduleCameraTwoFinger = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this._cameraTwoFingerFrame) return;
    this._cameraTwoFingerFrame = requestAnimationFrame(() => {
      this._cameraTwoFingerFrame = null;
      this.applyCameraTwoFinger();
    });
  };

  // Two-finger midpoint pan plus distance-ratio dolly; twist does not orbit.
  P.applyCameraTwoFinger = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.gesture !== 'camera_two' || this.pointers.size !== 2 || this._cameraTouchFrozen) return;
    const g = this.gestureData;
    if (!g) return;
    const pts = [...this.pointers.values()];
    const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    this.pan(midX - g.lastMidX, midY - g.lastMidY);
    this.zoom(Math.max(1, g.lastDist) / dist);
    g.lastMidX = midX;
    g.lastMidY = midY;
    g.lastDist = dist;
  };

  P.updateMarquee = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (!this.gestureData) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = this.gestureData.startX - rect.left;
    const y = this.gestureData.startY - rect.top;
    const w = this.gestureData.curX - this.gestureData.startX;
    const h = this.gestureData.curY - this.gestureData.startY;
    this.cb.onMarqueeChange?.({ x, y, w, h });
  };

  // A selection frame that was aborted or captured nothing must not leave
  // multi-select open when nothing is selected.
  P.closeEmptyMultiSelect = function () {
    if (!this.multiSelect) return;
    const sel = this.selection;
    const hasSelection = this.selectedMeshIds.length > 0
      || (!!sel?.meshId && (sel.type === 'object' || (sel.indices?.length || 0) > 0));
    if (!hasSelection) this.exitMultiSelect();
  };

  P.applyMarquee = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (!this.gestureData) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = this.gestureData.startX, sy = this.gestureData.startY;
    const ex = this.gestureData.curX, ey = this.gestureData.curY;
    const ndc = {
      x: ((Math.min(sx, ex) - rect.left) / rect.width) * 2 - 1,
      y: -((Math.max(sy, ey) - rect.top) / rect.height) * 2 + 1,
      w: (Math.abs(ex - sx) / rect.width) * 2,
      h: (Math.abs(ey - sy) / rect.height) * 2,
    };
    this.selectInMarquee(ndc);
  };
}