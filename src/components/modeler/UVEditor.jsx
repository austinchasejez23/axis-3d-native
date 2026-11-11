import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Scissors, LayoutGrid, FlipHorizontal2, Grid2X2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { SeamIcon } from '@/lib/toolIcons';
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

// The outline of each piece: the edges only one of its faces uses.
function outlineOf(data, faces) {
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
      if (item) item.n++; else count.set(key, { n: 1, a: c[i], b: c[(i + 1) % c.length] });
    }
  }
  return [...count.values()].filter((e) => e.n === 1);
}

const HINTS = {
  pieces: 'Drag a piece to move it. Twist to turn, pinch to resize.',
  seams: 'Tap edges on the model to mark or clear seams.',
};

// UV Editor: the object's surface laid flat on the image square.
//  - Pieces: one finger drags a piece along one direction; two fingers twist
//    to turn it or pinch to resize it. Each gesture does only what it starts as.
//  - Seams: switches the view to Edge mode while on; tapping an edge on the
//    model marks or clears a seam (red) and the layout updates. Cut angle also
//    cuts every edge sharper than it (amber).
//  - Unwrap starts the layout again, Pack fits the pieces back into the square,
//    Flip mirrors the selected piece.
//  - X puts everything back as it was when the editor opened; ✓ keeps it.
export default function UVEditor({ meshId: openedFor, managerRef, onChange, onClose }) {
  const { uiColor, highlightColor } = useTheme();
  // The object the editor works on: fixed when it opens, so marking seams in
  // Edge mode (where nothing stays selected) never loses it.
  const [meshId] = useState(openedFor);
  const canvasRef = useRef(null);
  const [data, setData] = useState(() => managerRef.current?.getUnwrapData(meshId) || null);
  const [selected, setSelected] = useState(0);
  const [seamMode, setSeamMode] = useState(false);
  const [angle, setAngle] = useState(() => {
    const a = managerRef.current?.getUnwrapData(meshId)?.angle;
    return a == null ? DEFAULT_CUT_ANGLE : a;
  });
  const angleRef = useRef(angle);
  angleRef.current = angle;
  const dataRef = useRef(data);
  dataRef.current = data;
  const opening = useRef(null);
  const undoEntry = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const frame = useRef(0);
  const pending = useRef(null);
  const timer = useRef(0);
  const size = useMemo(() => Math.round(Math.min(window.innerWidth * 0.62, window.innerHeight * 0.32)), []);

  // Tell the Texture tab what the object's wrap and image scale now are.
  const notify = () => {
    const mesh = managerRef.current?.getMesh(meshId);
    onChange?.({ uvMode: mesh?.uvMode || 'box', scale: mesh?.textureTransform?.scale ?? 1 });
  };

  // One undo step for the whole editing session, taken before the first change.
  const recordOnce = () => {
    const m = managerRef.current;
    if (!m || undoEntry.current) return;
    m.beginUnwrapEdit();
    undoEntry.current = m.undoStack?.[m.undoStack.length - 1] || true;
  };
  const commit = (next) => {
    recordOnce();
    setData(next);
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current) managerRef.current?.setUnwrapData(meshId, pending.current);
      pending.current = null;
      notify();
    });
  };
  const runUnwrap = (cut) => {
    const m = managerRef.current;
    if (!m) return;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    pending.current = null;
    recordOnce();
    if (m.unwrapMesh(meshId, { angle: cut, recordUndo: false })) {
      setData(m.getUnwrapData(meshId));
      setSelected(0);
      notify();
    }
  };

  // Open: remember how things were (for X), make sure there is a layout, and
  // show the cuts on the model.
  useEffect(() => {
    const m = managerRef.current;
    if (!m) return undefined;
    opening.current = m.captureUvState(meshId);
    const mesh = m.getMesh(meshId);
    if (!m.getUnwrapData(meshId)) runUnwrap(angleRef.current);
    else if (mesh && mesh.uvMode !== 'unwrap') { recordOnce(); m.setUnwrapData(meshId, m.getUnwrapData(meshId)); notify(); }
    m.setSeamOverlay(meshId);
    return () => {
      m.setSeamOverlay(null);
      if (frame.current) cancelAnimationFrame(frame.current);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) m.setUnwrapData(meshId, pending.current);
    };
  }, [meshId]);

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
      if (!m.toggleMeshSeam(meshId, hit.index)) return;
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
    setAngle(cut);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runUnwrap(cut), 160);
  };

  const cancel = () => {
    const m = managerRef.current;
    setSeamMode(false);
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    if (timer.current) { clearTimeout(timer.current); timer.current = 0; }
    pending.current = null;
    if (m && opening.current && undoEntry.current) {
      m.restoreUvState(meshId, opening.current);
      const stack = m.undoStack || [];
      if (stack[stack.length - 1] === undoEntry.current) stack.pop();
      notify();
    }
    onClose?.();
  };
  const done = () => { setSeamMode(false); onClose?.(); };

  // Draw: the image (or a checker when there is none) under a quarter grid,
  // then every piece with its faces faint and its outline strong.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    const g = canvas.getContext('2d');
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
    for (let i = 1; i < 4; i++) {
      const p = Math.round((size * i) / 4) + 0.5;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    }
    const at = ([u, v]) => [u * size, (1 - v) * size];
    const path = (corners) => {
      g.beginPath();
      corners.forEach((uv, i) => { const [x, y] = at(uv); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.closePath();
    };
    data.islands.forEach((faces, index) => {
      const active = index === selected;
      g.fillStyle = active ? `${highlightColor}4d` : 'rgba(255,255,255,0.10)';
      g.strokeStyle = active ? `${highlightColor}66` : 'rgba(255,255,255,0.22)';
      g.lineWidth = 0.75;
      for (const fi of faces) {
        const corners = data.faces[fi];
        if (!corners?.length) continue;
        path(corners);
        g.fill();
        g.stroke();
      }
      g.strokeStyle = active ? highlightColor : 'rgba(255,255,255,0.75)';
      g.lineWidth = active ? 2 : 1.25;
      g.beginPath();
      for (const { a, b } of outlineOf(data, faces)) {
        const [x1, y1] = at(a), [x2, y2] = at(b);
        g.moveTo(x1, y1); g.lineTo(x2, y2);
      }
      g.stroke();
    });
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, size - 1, size - 1);
  }, [data, selected, size, meshId, managerRef, highlightColor]);

  const uvAt = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
  };
  const pick = (point) => {
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
    if (!data) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, uvAt(event));
    if (pointers.current.size === 1) {
      const hit = pick(pointers.current.get(event.pointerId));
      if (hit >= 0) setSelected(hit);
      gesture.current = { index: hit >= 0 ? hit : selected, finger: event.pointerId, action: null };
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
    commit(transformIsland(g.base, g.index, map));
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) { gesture.current = null; return; }
    if (g && (g.action !== null || event.pointerId === g.finger)) gesture.current = null;
  };

  const flip = () => {
    if (!data) return;
    const b = islandBounds(data, selected);
    commit(transformIsland(data, selected, ([u, v]) => [2 * b.cu - u, v]));
  };
  const pack = () => { if (data) commit(repackLayout(data)); };

  const action = (label, Icon, onClick) => (
    <button
      key={label} type="button" onClick={onClick}
      className="modeling-value flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[13px] font-semibold active:scale-95"
      style={{ color: uiColor }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
      {label}
    </button>
  );

  return createPortal(
    <section
      aria-label="UV Editor"
      className="modeling-panel fixed inset-x-0 z-[95] px-1.5 pointer-events-auto"
      style={{ bottom: 'calc(4.375rem + var(--axis-safe-bottom, env(safe-area-inset-bottom, 0px)))' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="modeling-sheet rounded-2xl px-2 py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Grid2X2 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="truncate text-[16px] font-bold tracking-tight leading-none">UV Editor</h2>
          </div>
          <button
            type="button" onClick={() => setSeamMode((on) => !on)} aria-pressed={seamMode}
            className="modeling-value flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold active:scale-95"
            style={{ color: seamMode ? highlightColor : uiColor, borderColor: seamMode ? highlightColor : undefined }}
          >
            <SeamIcon className="h-4 w-4" strokeWidth={1.8} />
            Seams
          </button>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={cancel} aria-label="Cancel UV changes" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button type="button" onClick={done} aria-label="Keep UV changes" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="flex gap-2">
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
          <div className="flex min-w-0 flex-1 flex-col gap-1.5" style={{ height: size }}>
            {action('Unwrap', Scissors, () => runUnwrap(angle))}
            {action('Pack', LayoutGrid, pack)}
            {action('Flip', FlipHorizontal2, flip)}
          </div>
        </div>
        <p className="mt-1.5 text-[12px] leading-tight" style={{ color: seamMode ? highlightColor : uiColor }}>{seamMode ? HINTS.seams : HINTS.pieces}</p>
        <div className="mt-1.5">
          <InlineSlider
            label="Cut angle" value={angle} display={angle >= NO_CUT_ANGLE ? 'Off' : `${angle}°`}
            min={10} max={NO_CUT_ANGLE} step={1} grow onChange={changeAngle}
          />
        </div>
      </div>
    </section>,
    document.body,
  );
}
