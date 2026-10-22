import * as THREE from 'three';

// Desktop mouse controls, kept separate from the touch gesture code.
//
//   left click            → select (click on the selection deselects it)
//   left hold + drag      → move the selection (off-selection: orbit camera)
//   right hold + drag     → scale the selection along the drag direction
//   right hold + wheel    → uniform scale the selection
//   wheel over selection  → rotate the selection
//   wheel elsewhere       → zoom
//   middle hold + drag    → pan
//
// Sculpt and Draw face use the left button the same way as one finger.
// Multi-select is touch-only: the mouse path never enters it.
export function applySceneMouse(SceneManager) {
  const P = SceneManager.prototype;

  P.setupMouseEvents = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    this.renderer.domElement.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });
  };

  P.isMouseOverSelection = /** @this {import('./SceneManager.js').SceneManager} */ function (x, y) {
    // Surface mode never transforms objects, on mouse or touch.
    if (this.surfaceMode) return false;
    if (!this.selection.meshId) return false;
    return this.isPointOverSelection(x, y) || this.isPointNearSelection(x, y);
  };

  // Undo for wheel bursts: one snapshot per burst, not per notch.
  P._beginWheelStep = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (!this._wheelActive) {
      this._wheelActive = true;
      this.rotatePivot = this.getSelectionCenter();
      this.pushUndo();
    }
    clearTimeout(this._wheelTimer);
    this._wheelTimer = setTimeout(() => {
      this._wheelActive = false;
      this.rotatePivot = null;
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.updateHud();
    }, 500);
  };

  P.onMouseDown = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    e.preventDefault();
    this.stopCameraMotion();
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    if (this.multiSelect) this.exitMultiSelect();
    if (this.beginSceneLightMouse?.(e)) return;
    if (this.addVertexMode && e.button === 0) {
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'add_vertex' };
      return;
    }
    // Brush / spray: a left press paints immediately and keeps painting on drag.
    if (this.paintTool && this.paintTool.tool !== 'fill' && e.button === 0) {
      // Paint only starts on the object; empty space orbits the camera.
      const ndcP = this.screenToNDC(e.clientX, e.clientY);
      const paintHits = this.raycastMeshes(ndcP.x, ndcP.y);
      if (paintHits.length > 0) {
        // Same as touch: pressing the brush on an object selects it (object
        // mode) so the stroke always lands.
        const hitMeshId = this.findMeshIdByObject(paintHits[0].object);
        if (hitMeshId && this.selection.type === 'object') {
          const already = this.isGroupMode() ? this.selectedMeshIds.includes(hitMeshId) : this.selection.meshId === hitMeshId;
          if (!already) this.setSelection({ meshId: hitMeshId, type: 'object', indices: [] });
        }
        this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'paint' };
        this.cancelPaintPreview();
        // Nothing commits until Apply; the stroke joins the pending batch.
        this.beginPendingPaint();
        this.paintAt(e.clientX, e.clientY);
        return;
      }
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'orbit' };
      return;
    }
    // Sculpt: a left press on a mesh starts a stroke; empty space orbits.
    if (this.sculptTool?.active && e.button === 0) {
      const sculpting = this.beginSculptStroke(e.clientX, e.clientY);
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: sculpting ? 'sculpt' : 'orbit' };
      return;
    }
    // Draw face: a left press starts the outline, the drag draws it.
    if (this.drawMode && e.button === 0) {
      this.beginDrawFaceStroke(e.clientX, e.clientY);
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'draw' };
      return;
    }
    if (this.cutMode && e.button === 0) {
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'cut' };
      return;
    }
    // Measure mode: a left click places a measure point; a drag orbits.
    if (this.measureMode && e.button === 0) {
      this.mouse = { button: 0, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, mode: 'measure' };
      return;
    }
    const over = this.isMouseOverSelection(e.clientX, e.clientY);
    if (this.extrudeDrag && e.button === 0) {
      const canGrab = this.extrudeDrag.kind !== 'edge' || over;
      this.mouse = {
        button: e.button,
        startX: e.clientX, startY: e.clientY,
        lastX: e.clientX, lastY: e.clientY,
        moved: false,
        mode: canGrab ? 'extrude_drag' : 'orbit',
      };
      return;
    }
    this.mouse = {
      button: e.button,
      startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY,
      moved: false,
      mode: e.button === 0 ? (over ? 'move_pending' : e.shiftKey ? 'pan' : 'orbit')
        : e.button === 2 ? (over ? 'scale_pending' : 'pan')
          : 'pan',
    };
  };

  P.onMouseMove = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    const m = this.mouse;
    if (!m) return;
    if (this.updateSceneLightMouse?.(e)) return;
    const dx = e.clientX - m.lastX;
    const dy = e.clientY - m.lastY;
    if (Math.hypot(e.clientX - m.startX, e.clientY - m.startY) > 4) m.moved = true;

    if (m.mode === 'add_vertex') {
      if (m.moved) this.queueCameraMove('orbit', dx, dy);
      m.lastX = e.clientX;
      m.lastY = e.clientY;
      return;
    }

    if (m.mode === 'paint') {
      this.paintAt(e.clientX, e.clientY);
      m.lastX = e.clientX;
      m.lastY = e.clientY;
      return;
    }
    if (m.mode === 'sculpt') {
      this.moveSculptStroke(e.clientX, e.clientY);
      m.lastX = e.clientX;
      m.lastY = e.clientY;
      return;
    }
    if (m.mode === 'draw') {
      this.appendDrawFacePoint(e.clientX, e.clientY);
      m.lastX = e.clientX;
      m.lastY = e.clientY;
      return;
    }
    if (m.mode === 'extrude_drag') {
      const offset = this.extrudeOffsetFromDrag(m.startX, m.startY, e.clientX, e.clientY);
      if (Math.abs(offset) > 1e-4) {
        m.moved = true;
        this.extrudeDrag.hasDragged = true;
        this.updateExtrudeHeight(offset);
      }
      return;
    }

    if (m.mode === 'orbit') {
      if (m.moved) this.queueCameraMove('orbit', dx, dy);
    } else if (m.mode === 'pan') {
      this.queueCameraMove('pan', dx, dy);
    } else if (m.mode === 'move_pending') {
      if (m.moved) {
        m.mode = 'move';
        m.axis = null;
        this.activeAction = 'move';
        this.pushUndo();
      }
    } else if (m.mode === 'scale_pending') {
      if (m.moved) this._beginMouseScale(e);
    }

    if (m.mode === 'move') {
      const center = this.getSelectionCenter();
      const worldDelta = this.screenToWorldDrag(m.lastX, m.lastY, e.clientX, e.clientY, center);
      if (this.freeMove) {
        this.activeAxis = null;
        this.translateSelection(worldDelta);
      } else {
        if (!m.axis) {
          const ax = Math.abs(worldDelta.x), ay = Math.abs(worldDelta.y), az = Math.abs(worldDelta.z);
          m.axis = ax >= ay && ax >= az ? 'x' : (ay >= az ? 'y' : 'z');
          this.activeAxis = m.axis;
        }
        const axisDelta = new THREE.Vector3();
        axisDelta[m.axis] = worldDelta[m.axis];
        this.translateSelection(axisDelta);
      }
    } else if (m.mode === 'scale') {
      this._updateMouseScale(e);
    }

    m.lastX = e.clientX;
    m.lastY = e.clientY;
  };

  // Right-drag axis scale: the surface follows the pointer, growing when the
  // drag moves away from the selection center and shrinking when it moves in.
  P._beginMouseScale = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    const m = this.mouse;
    m.mode = 'scale';
    this.activeAction = 'scale';
    this.pushUndo();
    const center = this.getSelectionCenter();
    const mesh = this.getMesh(this.selection.meshId);
    m.localAxes = this.selection.type === 'object' && !!mesh && !this.isGroupMode();
    const raw = this.screenToWorldDrag(m.startX, m.startY, e.clientX, e.clientY, center);
    const delta = m.localAxes ? this.worldToLocalDelta(mesh, raw) : raw;
    const ax = Math.abs(delta.x), ay = Math.abs(delta.y), az = Math.abs(delta.z);
    m.axis = ax >= ay && ax >= az ? 'x' : (ay >= az ? 'y' : 'z');
    this.activeAxis = m.axis;
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.negate(), center);
    const start = this.rayToPlane(m.startX, m.startY, plane);
    let sideVec = start ? start.clone().sub(center) : null;
    if (sideVec && m.localAxes && mesh) sideVec = this.worldToLocalDelta(mesh, sideVec);
    const side = sideVec ? sideVec[m.axis] : 0;
    m.axisSign = side < 0 ? -1 : 1;
    m.startOffset = Math.max(0.05, Math.abs(side));
    m.lastRatio = 1;
  };

  P._updateMouseScale = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    const m = this.mouse;
    const center = this.getSelectionCenter();
    let delta = this.screenToWorldDrag(m.startX, m.startY, e.clientX, e.clientY, center);
    if (m.localAxes) {
      const mesh = this.getMesh(this.selection.meshId);
      if (mesh) delta = this.worldToLocalDelta(mesh, delta);
    }
    const amount = delta[m.axis] * (m.axisSign || 1);
    const ratio = Math.max(0.05, (m.startOffset + amount) / m.startOffset);
    const f = ratio / (m.lastRatio || 1);
    if (Math.abs(f - 1) > 0.001) {
      this.scaleSelectionAxis(m.axis, f);
      m.lastRatio = ratio;
    }
  };

  P.onMouseUp = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    const m = this.mouse;
    if (this.finishSceneLightMouse?.()) { this.mouse = null; return; }
    this.mouse = null;
    if (!m) return;
    if (m.moved && (m.mode === 'orbit' || m.mode === 'pan')) this.releaseCameraMotion();
    if (m.mode === 'add_vertex') {
      if (!m.moved) this.handleAddVertexTap(e.clientX, e.clientY);
      this.activeAction = 'idle';
      this.updateHud();
      return;
    }
    if (m.mode === 'paint') {
      this.endPaintStroke();
      this.activeAction = 'idle';
      this.updateHud();
      return;
    }
    if (m.mode === 'sculpt') {
      this.sculptStroke = null;
      this.endHeavyEdit();
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.updateHud();
      return;
    }
    if (m.mode === 'draw') {
      this.finishDrawFaceStroke(e.clientX, e.clientY);
      return;
    }
    if (m.mode === 'extrude_drag') {
      this.commitExtrudeDrag();
      this.activeAction = 'idle';
      this.activeAxis = null;
      this.updateHud();
      return;
    }
    if (m.mode === 'cut') {
      if (!m.moved) this.handleCutTap(e.clientX, e.clientY);
      this.activeAction = 'idle';
      this.updateHud();
      return;
    }
    if (m.mode === 'measure') {
      if (!m.moved) this.measureTap(e.clientX, e.clientY);
      this.activeAction = 'idle';
      this.updateHud();
      return;
    }
    if (!m.moved && m.button === 0 && this._radialArray) {
      const point = this.screenToNDC(e.clientX, e.clientY);
      if (this.raycastMeshes(point.x, point.y).length === 0) this.cb.onEmptyTap?.();
      else this.radialArraySelectPreview();
    } else if (!m.moved && m.button === 0) {
      // Open panels get the canvas click before selection changes, matching the
      // touch path. Closing Surface therefore never deselects its target.
      const panelHandled = this.cb.onEmptyTap?.();
      if (!panelHandled) {
        // Click on the current selection deselects it; anywhere else selects.
        if (m.mode === 'move_pending') {
          if (this.selectionMode === 'object') this.clearSelection();
          else this.deselectAtPoint(e.clientX, e.clientY);
        } else {
          // Selecting never paints: the panel checkmark applies the color.
          this.selectAtScreenPoint(e.clientX, e.clientY);
        }
      }
    }
    this.activeAction = 'idle';
    this.activeAxis = null;
    this.updateHud();
  };

  P.onMouseWheel = /** @this {import('./SceneManager.js').SceneManager} */ function (e) {
    if (this.lightingEdit) {
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
      return;
    }
    const held = this.mouse;
    // Right button held → uniform scale of the selection.
    if (held && held.button === 2 && this.selection.meshId) {
      e.preventDefault();
      this._beginWheelStep();
      this.activeAction = 'scale';
      this.scaleSelection(e.deltaY < 0 ? 1.05 : 1 / 1.05);
      return;
    }
    // Pointer over the selection → rotate it about the axis the camera faces.
    if (this.selection.meshId && this.isMouseOverSelection(e.clientX, e.clientY)) {
      e.preventDefault();
      this._beginWheelStep();
      this.activeAction = 'rotate';
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      const ax = Math.abs(camDir.x), ay = Math.abs(camDir.y), az = Math.abs(camDir.z);
      const axisVec = ax >= ay && ax >= az
        ? new THREE.Vector3(Math.sign(camDir.x) || 1, 0, 0)
        : ay >= az
          ? new THREE.Vector3(0, Math.sign(camDir.y) || 1, 0)
          : new THREE.Vector3(0, 0, Math.sign(camDir.z) || 1);
      this.rotateSelectionAroundAxis(-e.deltaY * 0.0015, axisVec);
      return;
    }
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };
}