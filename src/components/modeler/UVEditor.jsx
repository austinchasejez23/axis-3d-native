import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/lib/theme';
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

// UV panel: the object's flattened pieces laid out on the image square.
// Same gestures as the model: one finger drags a piece along one direction
// (across or up and down); two fingers twist to turn it or pinch to resize it.
// Each gesture locks to the first action it starts and does only that.
// "Cut angle" decides where the surface is opened (red lines on the model).
export default function UVEditor({ meshId, managerRef, onChange, onClose }) {
  const { uiColor, highlightColor } = useTheme();
  const canvasRef = useRef(null);
  const [data, setData] = useState(() => managerRef.current?.getUnwrapData(meshId) || null);
  const [selected, setSelected] = useState(0);
  const [angle, setAngle] = useState(() => {
    const a = managerRef.current?.getUnwrapData(meshId)?.angle;
    return a == null ? DEFAULT_CUT_ANGLE : a;
  });
  const dataRef = useRef(data);
  dataRef.current = data;
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const frame = useRef(0);
  const pending = useRef(null);
  const timer = useRef(0);
  const undone = useRef(false);
  const size = useMemo(() => Math.round(Math.min(window.innerWidth - 36, window.innerHeight * 0.3)), []);

  const recordOnce = () => {
    if (undone.current) return false;
    undone.current = true;
    return true;
  };
  const commit = (next, recordUndo) => {
    if (recordUndo) managerRef.current?.beginUnwrapEdit();
    setData(next);
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current) managerRef.current?.setUnwrapData(meshId, pending.current);
      pending.current = null;
      onChange?.();
    });
  };

  const runUnwrap = (cut) => {
    const m = managerRef.current;
    if (!m) return;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    pending.current = null;
    if (m.unwrapSelection({ angle: cut, recordUndo: recordOnce() })) {
      setData(m.getUnwrapData(meshId));
      setSelected(0);
      onChange?.();
    }
  };

  // Open: make sure there is a layout and show the cuts on the model.
  useEffect(() => {
    const m = managerRef.current;
    if (!m) return undefined;
    const mesh = m.getMesh(meshId);
    if (!m.getUnwrapData(meshId)) runUnwrap(angle);
    else if (mesh && mesh.uvMode !== 'unwrap') { m.setUVMode('unwrap'); onChange?.(); }
    m.setSeamOverlay(meshId);
    return () => {
      m.setSeamOverlay(null);
      if (frame.current) cancelAnimationFrame(frame.current);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) m.setUnwrapData(meshId, pending.current);
    };
  }, [meshId]);

  const changeAngle = (v) => {
    const cut = Math.round(v);
    setAngle(cut);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runUnwrap(cut), 160);
  };

  // Draw the layout.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    const g = canvas.getContext('2d');
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = '#1b2030';
    g.fillRect(0, 0, size, size);
    const image = managerRef.current?.getMesh(meshId)?.mapTexture?.image;
    if (image && (image.width || image.naturalWidth)) {
      try { g.globalAlpha = 0.55; g.drawImage(image, 0, 0, size, size); } catch { /* image not drawable */ }
      g.globalAlpha = 1;
    }
    const at = ([u, v]) => [u * size, (1 - v) * size];
    data.islands.forEach((faces, index) => {
      const active = index === selected;
      g.fillStyle = active ? `${highlightColor}55` : 'rgba(255,255,255,0.10)';
      g.strokeStyle = active ? highlightColor : 'rgba(255,255,255,0.55)';
      g.lineWidth = active ? 1.5 : 1;
      for (const fi of faces) {
        const corners = data.faces[fi];
        if (!corners?.length) continue;
        g.beginPath();
        corners.forEach((uv, i) => { const [x, y] = at(uv); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
        g.closePath();
        g.fill();
        g.stroke();
      }
    });
    g.strokeStyle = 'rgba(255,255,255,0.4)';
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
      gesture.current = { index: hit >= 0 ? hit : selected, finger: event.pointerId, action: null, recorded: false };
      begin(gesture.current);
    } else if (pointers.current.size === 2 && gesture.current && !gesture.current.action) {
      // A second finger before a drag has started: a two-finger gesture.
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
      // One finger: move along one direction only.
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
        // Twist or pinch, whichever starts first, and only that.
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
    const first = !g.recorded;
    g.recorded = true;
    commit(transformIsland(g.base, g.index, map), first);
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) { gesture.current = null; return; }
    // Lifting a finger ends the gesture; the other finger does nothing until all lift.
    if (g && (g.action !== null || event.pointerId === g.finger)) gesture.current = null;
  };

  const flip = () => {
    if (!data) return;
    const b = islandBounds(data, selected);
    commit(transformIsland(data, selected, ([u, v]) => [2 * b.cu - u, v]), true);
  };
  const pack = () => { if (data) commit(repackLayout(data), true); };

  const chip = (label, onClick, active = false) => (
    <button
      key={label} type="button" onClick={onClick}
      className="modeling-value flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-[13px] font-medium active:scale-95"
      style={{ color: active ? highlightColor : uiColor, borderColor: active ? highlightColor : undefined }}
    >
      {label}
    </button>
  );

  return createPortal(
    <section
      aria-label="UV editor"
      className="fixed inset-x-0 z-[95] px-1.5 pointer-events-auto"
      style={{ bottom: 'calc(4.375rem + var(--axis-safe-bottom, env(safe-area-inset-bottom, 0px)))' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="modeling-sheet mx-auto w-fit max-w-full rounded-2xl p-2">
        <div style={{ width: size }}>
          <p className="mb-1 text-[12px] leading-tight" style={{ color: uiColor }}>Drag to move. Twist to turn, pinch to resize.</p>
          <canvas
            ref={canvasRef}
            aria-label="UV layout"
            className="block touch-none rounded-lg"
            style={{ width: size, height: size }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="mt-1.5">
            <InlineSlider
              label="Cut angle" value={angle} display={angle >= NO_CUT_ANGLE ? 'Off' : `${angle}°`}
              min={10} max={NO_CUT_ANGLE} step={1} grow onChange={changeAngle}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {chip('Unwrap', () => runUnwrap(angle))}
            {chip('Pack', pack)}
            {chip('Flip', flip)}
            {chip('Done', onClose, true)}
          </div>
        </div>
      </div>
    </section>,
    document.body,
  );
}
