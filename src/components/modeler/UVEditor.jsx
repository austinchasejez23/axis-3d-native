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
// Tap a piece to pick it; drag to move it; pinch to resize and twist it.
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
  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(a[0] - b[0], a[1] - b[1]), turn: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };

  // Every move is measured from where the gesture (or the second finger)
  // started, so fast drags never lose distance.
  const rebase = (g) => {
    const base = dataRef.current;
    const b = islandBounds(base, g.index);
    g.base = base;
    g.center = [b.cu, b.cv];
    g.start = pointers.current.size >= 2 ? pair() : { mid: [...pointers.current.values()][0], dist: 1, turn: 0 };
  };
  const onPointerDown = (event) => {
    if (!data) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, uvAt(event));
    if (pointers.current.size === 1) {
      const hit = pick(pointers.current.get(event.pointerId));
      if (hit >= 0) setSelected(hit);
      gesture.current = { index: hit >= 0 ? hit : selected, recorded: false, moved: false };
      rebase(gesture.current);
    } else if (gesture.current) {
      rebase(gesture.current);
    }
  };
  const onPointerMove = (event) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, uvAt(event));
    const two = pointers.current.size >= 2;
    const now = two ? pair() : { mid: [...pointers.current.values()][0], dist: 1, turn: 0 };
    const du = now.mid[0] - g.start.mid[0], dv = now.mid[1] - g.start.mid[1];
    if (!g.moved && !two && Math.hypot(du, dv) * size < 4) return;
    g.moved = true;
    const ratio = two && g.start.dist > 1e-6 ? Math.min(8, Math.max(0.125, now.dist / g.start.dist)) : 1;
    const turn = two ? -(now.turn - g.start.turn) : 0;
    const c = Math.cos(turn), s = Math.sin(turn);
    const [cu, cv] = g.center;
    const first = !g.recorded;
    g.recorded = true;
    commit(transformIsland(g.base, g.index, ([u, v]) => {
      const x = (u - cu) * ratio, y = (v - cv) * ratio;
      return [cu + c * x - s * y + du, cv + s * x + c * y + dv];
    }), first);
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size === 0) gesture.current = null;
    else rebase(g);
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
          <p className="mb-1 text-[12px] leading-tight" style={{ color: uiColor }}>Drag a piece to move it. Pinch to resize and turn.</p>
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
