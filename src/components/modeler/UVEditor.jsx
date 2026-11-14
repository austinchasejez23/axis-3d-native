import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, ChevronLeft } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { blockedButton } from '@/lib/unavailable';
import { transformIsland, islandBounds, repackLayout, DEFAULT_CUT_ANGLE, NO_CUT_ANGLE } from '@/lib/uvUnwrap';
import InlineSlider from './InlineSlider';

function insidePolygon(point, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i], [xj, yj] = corners[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The outline of each piece: the face sides only one of its faces uses, kept
// as [face, corner, corner] so it can be redrawn after the piece moves
// without working it out again (moving a piece never changes its outline).
function outlinesOf(data) {
  return data.islands.map((faces) => {
    const count = new Map();
    const k = ([u1, v1], [u2, v2]) => {
      const a = `${u1.toFixed(4)},${v1.toFixed(4)}`, b = `${u2.toFixed(4)},${v2.toFixed(4)}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    for (const fi of faces) {
      const c = data.faces[fi];
      if (!c) continue;
      for (let i = 0; i < c.length; i++) {
        const key = k(c[i], c[(i + 1) % c.length]);
        const item = count.get(key);
        if (item) item.n++; else count.set(key, { n: 1, side: [fi, i, (i + 1) % c.length] });
      }
    }
    return [...count.values()].filter((e) => e.n === 1).map((e) => e.side);
  });
}

const HINTS = {
  pieces: 'Drag a piece to move it. Twist to turn, pinch to resize.',
  seams: 'Tap edges on the model to mark or clear seams.',
};
// How often the model follows a piece while it is being dragged.
const PREVIEW_MS = 60;

// UV Editor, shown in the surface sheet in place of the Texture tab.
//  - Header like the sheet's: Back returns to the Texture tab keeping the
//    changes, X puts the UVs back and closes everything, ✓ keeps them and
//    closes everything.
//  - The layout: one finger drags a piece along one direction; two fingers
//    twist to turn it or pinch to resize it. Each gesture does only what it
//    starts as.
//  - Seams switches the view to Edge mode while on; tapping an edge on the
//    model marks or clears a seam (red). Cut angle also cuts every edge
//    sharper than it (amber).
//  - Unwrap starts the layout again, Pack fits the pieces back into the
//    square, Flip mirrors the selected piece, Undo takes back the last UV
//    change only.
export default function UVEditor({ meshId: openedFor, managerRef, onChange, onBack, onCancelAll, onApplyAll }) {
  const { uiColor, highlightColor } = useTheme();
  // The object the editor works on: fixed when it opens, so marking seams in
  // Edge mode (where nothing stays selected) never loses it.
  const [meshId] = useState(openedFor);
  const canvasRef = useRef(null);
  const [hasLayout, setHasLayout] = useState(() => !!managerRef.current?.getUnwrapData(meshId));
  const [seamMode, setSeamMode] = useState(false);
  const [angle, setAngle] = useState(() => {
    const a = managerRef.current?.getUnwrapData(meshId)?.angle;
    return a == null ? DEFAULT_CUT_ANGLE : a;
  });
  const [canUndo, setCanUndo] = useState(false);
  const angleRef = useRef(angle);
  angleRef.current = angle;
  // The layout and its outlines live in refs and are drawn straight onto the
  // canvas, so dragging a piece does not re-render the panel.
  const dataRef = useRef(managerRef.current?.getUnwrapData(meshId) || null);
  const outlinesRef = useRef(dataRef.current ? outlinesOf(dataRef.current) : []);
  const selectedRef = useRef(0);
  const history = useRef([]);
  const opening = useRef(null);
  const undoEntry = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const drawFrame = useRef(0);
  const preview = useRef({ timer: 0, last: 0 });
  const angleTimer = useRef(0);
  // The square fits beside the buttons and the Cut angle slider.
  const size = useMemo(() => Math.round(Math.max(150, Math.min(237, window.innerWidth - 136))), []);

  // Tell the sheet something changed, so its checkmark keeps it.
  const notify = () => onChange?.();

  // One undo step for the whole editing session, taken before the first change.
  const recordOnce = () => {
    const m = managerRef.current;
    if (!m || undoEntry.current) return;
    m.beginUnwrapEdit();
    undoEntry.current = m.undoStack?.[m.undoStack.length - 1] || true;
  };
  // Undo inside the editor: the UV state before each change.
  const remember = () => {
    const m = managerRef.current;
    const state = m?.captureUvState(meshId);
    if (!state) return;
    history.current.push(state);
    setCanUndo(true);
  };

  const draw = () => {
    drawFrame.current = 0;
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = '#141824';
    g.fillRect(0, 0, size, size);
    const image = managerRef.current?.getMesh(meshId)?.mapTexture?.image;
    if (image && (image.width || image.naturalWidth)) {
      try { g.globalAlpha = 0.6; g.drawImage(image, 0, 0, size, size); } catch { /* image not drawable */ }
      g.globalAlpha = 1;
    } else {
      const n = 8, cell = size / n;
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 0; y < n; y++) for (let x = (y % 2); x < n; x += 2) g.fillRect(x * cell, y * cell, cell, cell);
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const p = Math.round((size * i) / 4) + 0.5;
      g.moveTo(p, 0); g.lineTo(p, size); g.moveTo(0, p); g.lineTo(size, p);
    }
    g.stroke();
    if (data) {
      const selected = selectedRef.current;
      data.islands.forEach((faces, index) => {
        const active = index === selected;
        g.fillStyle = active ? `${highlightColor}4d` : 'rgba(255,255,255,0.10)';
        g.strokeStyle = active ? `${highlightColor}66` : 'rgba(255,255,255,0.22)';
        g.lineWidth = 0.75;
        g.beginPath();
        for (const fi of faces) {
          const corners = data.faces[fi];
          if (!corners?.length) continue;
          corners.forEach(([u, v], i) => { if (i === 0) g.moveTo(u * size, (1 - v) * size); else g.lineTo(u * size, (1 - v) * size); });
          g.closePath();
        }
        g.fill();
        g.stroke();
        g.strokeStyle = active ? highlightColor : 'rgba(255,255,255,0.75)';
        g.lineWidth = active ? 2 : 1.25;
        g.beginPath();
        for (const [fi, a, b] of outlinesRef.current[index] || []) {
          const c = data.faces[fi];
          if (!c?.[a] || !c?.[b]) continue;
          g.moveTo(c[a][0] * size, (1 - c[a][1]) * size);
          g.lineTo(c[b][0] * size, (1 - c[b][1]) * size);
        }
        g.stroke();
      });
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, size - 1, size - 1);
  };
  const redraw = () => { if (!drawFrame.current) drawFrame.current = requestAnimationFrame(draw); };

  // A new layout from the object (after Unwrap or Undo): its outlines change.
  const reload = () => {
    const data = managerRef.current?.getUnwrapData(meshId) || null;
    dataRef.current = data;
    outlinesRef.current = data ? outlinesOf(data) : [];
    if (selectedRef.current >= (data?.islands.length || 0)) selectedRef.current = 0;
    setHasLayout(!!data);
    redraw();
  };

  // Move the model's UVs along with a dragged piece, a few times a second.
  const previewNow = () => {
    preview.current.timer = 0;
    preview.current.last = performance.now();
    if (dataRef.current) managerRef.current?.previewUnwrapData(meshId, dataRef.current);
  };
  const schedulePreview = () => {
    if (preview.current.timer) return;
    const wait = Math.max(0, PREVIEW_MS - (performance.now() - preview.current.last));
    preview.current.timer = setTimeout(previewNow, wait);
  };
  const flushPreview = () => {
    if (preview.current.timer) { clearTimeout(preview.current.timer); preview.current.timer = 0; }
    if (dataRef.current) managerRef.current?.previewUnwrapData(meshId, dataRef.current);
  };
  // A finished change to the layout (gesture end, Pack, Flip).
  const keep = (next) => {
    dataRef.current = next;
    redraw();
    flushPreview();
    notify();
  };

  const runUnwrap = (cut) => {
    const m = managerRef.current;
    if (!m) return;
    recordOnce();
    if (m.unwrapMesh(meshId, { angle: cut, recordUndo: false })) {
      selectedRef.current = 0;
      reload();
      notify();
    }
  };

  // Open: remember how things were (for X), make sure there is a layout, and
  // show the cuts on the model.
  useEffect(() => {
    const m = managerRef.current;
    const canvas = canvasRef.current;
    if (canvas) {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = size * ratio;
      canvas.height = size * ratio;
    }
    if (!m) return undefined;
    opening.current = m.captureUvState(meshId);
    const mesh = m.getMesh(meshId);
    if (!m.getUnwrapData(meshId)) runUnwrap(angleRef.current);
    else if (mesh && mesh.uvMode !== 'unwrap') { recordOnce(); m.setUnwrapData(meshId, m.getUnwrapData(meshId)); notify(); }
    reload();
    m.setSeamOverlay(meshId);
    return () => {
      m.setSeamOverlay(null);
      if (drawFrame.current) cancelAnimationFrame(drawFrame.current);
      if (angleTimer.current) clearTimeout(angleTimer.current);
      if (preview.current.timer) { clearTimeout(preview.current.timer); previewNow(); }
    };
  }, [meshId]);

  useEffect(() => { redraw(); }, [highlightColor]);

  // Seams: Edge mode while on, every edge tap marks or clears that seam.
  useEffect(() => {
    const m = managerRef.current;
    if (!m || !seamMode) return undefined;
    const before = m.selectionMode;
    m.setSelectionMode('edge');
    m.cb?.onSelectionModeChange?.('edge');
    m.edgeTapHandler = (hit) => {
      if (hit.meshId !== meshId) return;
      recordOnce();
      remember();
      if (!m.toggleMeshSeam(meshId, hit.index)) { history.current.pop(); setCanUndo(history.current.length > 0); return; }
      runUnwrap(angleRef.current);
    };
    return () => {
      m.edgeTapHandler = null;
      m.setSelectionMode(before);
      m.cb?.onSelectionModeChange?.(before);
      if (before === 'object' && m.getMesh(meshId)) m.setSelection({ meshId, type: 'object', indices: [] });
    };
  }, [seamMode, meshId]);

  const changeAngle = (v) => {
    const cut = Math.round(v);
    // One undo step per slide (a pause starts a new one).
    if (!angleTimer.current) remember();
    setAngle(cut);
    if (angleTimer.current) clearTimeout(angleTimer.current);
    angleTimer.current = setTimeout(() => { angleTimer.current = 0; runUnwrap(cut); }, 160);
  };

  const undo = () => {
    const m = managerRef.current;
    const state = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!m || !state) return;
    if (angleTimer.current) { clearTimeout(angleTimer.current); angleTimer.current = 0; }
    if (preview.current.timer) { clearTimeout(preview.current.timer); preview.current.timer = 0; }
    m.restoreUvState(meshId, state);
    if (state.uvUnwrap?.angle != null) setAngle(state.uvUnwrap.angle);
    reload();
    notify();
  };

  const stopEditing = () => {
    setSeamMode(false);
    if (angleTimer.current) { clearTimeout(angleTimer.current); angleTimer.current = 0; runUnwrap(angleRef.current); }
    flushPreview();
  };
  const back = () => { stopEditing(); onBack?.(); };
  const done = () => { stopEditing(); onApplyAll?.(); };
  const cancel = () => {
    const m = managerRef.current;
    setSeamMode(false);
    if (angleTimer.current) { clearTimeout(angleTimer.current); angleTimer.current = 0; }
    if (preview.current.timer) { clearTimeout(preview.current.timer); preview.current.timer = 0; }
    if (m && opening.current && undoEntry.current) {
      m.restoreUvState(meshId, opening.current);
      const stack = m.undoStack || [];
      if (stack[stack.length - 1] === undoEntry.current) stack.pop();
    }
    onCancelAll?.();
  };

  const uvAt = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
  };
  const pick = (point) => {
    const data = dataRef.current;
    for (let index = data.islands.length - 1; index >= 0; index--) {
      if (data.islands[index].some((fi) => data.faces[fi] && insidePolygon(point, data.faces[fi]))) return index;
    }
    return -1;
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), turn: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  // Every change is measured from where the gesture began.
  const begin = (g) => {
    const b = islandBounds(dataRef.current, g.index);
    g.base = dataRef.current;
    g.center = [b.cu, b.cv];
    g.start = pointers.current.size >= 2 ? pair() : pointers.current.get(g.finger);
  };
  const onPointerDown = (event) => {
    if (!dataRef.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, uvAt(event));
    if (pointers.current.size === 1) {
      const hit = pick(pointers.current.get(event.pointerId));
      if (hit >= 0 && hit !== selectedRef.current) { selectedRef.current = hit; redraw(); }
      gesture.current = { index: hit >= 0 ? hit : selectedRef.current, finger: event.pointerId, action: null, changed: false };
      begin(gesture.current);
    } else if (pointers.current.size === 2 && gesture.current && !gesture.current.action) {
      gesture.current.action = 'pending';
      begin(gesture.current);
    }
  };
  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, uvAt(event));
    const [cu, cv] = g.center;
    let map;
    if (g.action === null || g.action === 'move') {
      if (event.pointerId !== g.finger) return;
      const p = pointers.current.get(g.finger);
      const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
      if (!g.action) {
        if (Math.hypot(dx, dy) * size < 5) return;
        g.action = 'move';
        g.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      map = g.axis === 'x' ? ([u, v]) => [u + dx, v] : ([u, v]) => [u, v + dy];
    } else {
      if (pointers.current.size < 2) return;
      const now = pair();
      const turn = wrap(now.turn - g.start.turn);
      if (g.action === 'pending') {
        const pinchPx = Math.abs(now.dist - g.start.dist) * size;
        const twistPx = Math.abs(turn) * (g.start.dist / 2) * size;
        if (Math.max(pinchPx, twistPx) < 8) return;
        g.action = twistPx > pinchPx ? 'rotate' : 'scale';
      }
      if (g.action === 'rotate') {
        const c = Math.cos(turn), s = Math.sin(turn);
        map = ([u, v]) => [cu + c * (u - cu) - s * (v - cv), cv + s * (u - cu) + c * (v - cv)];
      } else {
        const ratio = g.start.dist > 1e-6 ? Math.min(8, Math.max(0.125, now.dist / g.start.dist)) : 1;
        map = ([u, v]) => [cu + (u - cu) * ratio, cv + (v - cv) * ratio];
      }
    }
    if (!g.changed) { g.changed = true; recordOnce(); remember(); }
    dataRef.current = transformIsland(g.base, g.index, map);
    redraw();
    schedulePreview();
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    const ended = pointers.current.size === 0 || (g && (g.action !== null || event.pointerId === g.finger));
    if (!ended) return;
    gesture.current = null;
    if (g?.changed) keep(dataRef.current);
  };

  const flip = () => {
    const data = dataRef.current;
    if (!data) return;
    recordOnce();
    remember();
    const b = islandBounds(data, selectedRef.current);
    keep(transformIsland(data, selectedRef.current, ([u, v]) => [2 * b.cu - u, v]));
  };
  const pack = () => {
    const data = dataRef.current;
    if (!data) return;
    recordOnce();
    remember();
    keep(repackLayout(data));
  };
  const unwrap = () => { remember(); runUnwrap(angle); };

  const btn = 'modeling-value flex h-8 w-full min-w-0 items-center justify-center rounded-lg px-1 text-[13px] font-semibold active:scale-95 aria-disabled:opacity-35 aria-disabled:active:scale-100';
  const actionBtn = 'modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95';

  return (
    <div aria-label="UV Editor">
      <div className="px-2 pt-1.5 pb-1">
        <div className="relative flex items-center gap-1 rounded-xl px-1.5 py-1" style={{ background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <button onClick={back} aria-label="Back to Texture" className="flex h-8 w-6 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}>
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-bold leading-none" style={{ color: uiColor }}>UV Editor</h2>
          </div>
          <div className="w-[4.5rem] shrink-0 flex items-center justify-end gap-1.5">
            <button onClick={cancel} aria-label="Cancel and close" className={actionBtn} style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button onClick={done} aria-label="Apply" className={actionBtn} style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
      </div>
      <div className="px-2 pb-2">
        <div className="flex items-start gap-2">
          <canvas
            ref={canvasRef}
            aria-label="UV layout"
            className="block shrink-0 touch-none rounded-lg"
            style={{ width: size, height: size }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5" style={{ minHeight: size }}>
            <button type="button" onClick={() => setSeamMode((on) => !on)} aria-pressed={seamMode} className={btn} style={{ color: seamMode ? highlightColor : uiColor, borderColor: seamMode ? highlightColor : undefined }}>Seams</button>
            <button type="button" onClick={unwrap} className={btn} style={{ color: uiColor }}>Unwrap</button>
            <button type="button" {...blockedButton(!hasLayout, 'Nothing to pack yet', pack)} className={btn} style={{ color: uiColor }}>Pack</button>
            <button type="button" {...blockedButton(!hasLayout, 'Nothing to flip yet', flip)} className={btn} style={{ color: uiColor }}>Flip</button>
            <button type="button" {...blockedButton(!canUndo, 'No UV edits to undo', undo)} aria-label="Undo UV edit" className={btn} style={{ color: uiColor }}>Undo</button>
            <div>
              <InlineSlider
                label="Cut angle" value={angle} display={angle >= NO_CUT_ANGLE ? 'Off' : `${angle}°`}
                min={10} max={NO_CUT_ANGLE} step={1} grow onChange={changeAngle}
              />
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[12px] leading-tight" style={{ color: seamMode ? highlightColor : uiColor }}>{seamMode ? HINTS.seams : HINTS.pieces}</p>
      </div>
    </div>
  );
}
