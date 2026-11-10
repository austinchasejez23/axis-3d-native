import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, Plus, RotateCw, FlipHorizontal2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { transformIsland, islandBounds } from '@/lib/uvUnwrap';

function insidePolygon(point, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i], [xj, yj] = corners[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// UV editor: the flattened pieces (islands) of the object laid out on the
// image square. Tap a piece to pick it, drag to move it, and use the buttons
// to resize, turn or flip it. The object updates as you go.
export default function UVEditor({ meshId, managerRef, onChange, onClose }) {
  const { uiColor, highlightColor } = useTheme();
  const canvasRef = useRef(null);
  const [data, setData] = useState(() => managerRef.current?.getUnwrapData(meshId) || null);
  const [selected, setSelected] = useState(0);
  const drag = useRef(null);
  const frame = useRef(0);
  const pending = useRef(null);
  const size = useMemo(() => Math.round(Math.min(window.innerWidth - 36, window.innerHeight * 0.44)), []);

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
  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    if (pending.current) managerRef.current?.setUnwrapData(meshId, pending.current);
  }, [meshId, managerRef]);

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

  const onPointerDown = (event) => {
    if (!data) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = uvAt(event);
    const hit = pick(point);
    if (hit >= 0) setSelected(hit);
    drag.current = { index: hit >= 0 ? hit : selected, last: point, moved: false, picked: hit >= 0 };
  };
  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d || !d.picked) return;
    const point = uvAt(event);
    const du = point[0] - d.last[0], dv = point[1] - d.last[1];
    if (!d.moved && Math.hypot(du, dv) * size < 3) return;
    const first = !d.moved;
    d.moved = true;
    d.last = point;
    commit(transformIsland(data, d.index, ([u, v]) => [u + du, v + dv]), first);
  };
  const onPointerUp = () => { drag.current = null; };

  const apply = (fn) => {
    if (!data) return;
    const b = islandBounds(data, selected);
    commit(transformIsland(data, selected, (uv) => fn(uv, b)), true);
  };
  const buttons = [
    { label: 'Smaller', icon: Minus, run: () => apply(([u, v], b) => [b.cu + (u - b.cu) * 0.9, b.cv + (v - b.cv) * 0.9]) },
    { label: 'Larger', icon: Plus, run: () => apply(([u, v], b) => [b.cu + (u - b.cu) * 1.1, b.cv + (v - b.cv) * 1.1]) },
    { label: 'Rotate', icon: RotateCw, run: () => apply(([u, v], b) => [b.cu + (v - b.cv), b.cv - (u - b.cu)]) },
    { label: 'Flip', icon: FlipHorizontal2, run: () => apply(([u, v], b) => [2 * b.cu - u, v]) },
  ];

  return createPortal(
    <section
      aria-label="UV editor"
      className="fixed inset-x-0 z-[95] px-1.5 pointer-events-auto"
      style={{ bottom: 'calc(4.375rem + var(--axis-safe-bottom, env(safe-area-inset-bottom, 0px)))' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="modeling-sheet mx-auto w-fit max-w-full rounded-2xl p-2">
        {data ? (
          <>
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
            <div className="mt-1.5 flex items-center gap-1.5">
              {buttons.map(({ label, icon: Icon, run }) => (
                <button
                  key={label} type="button" aria-label={label} onClick={run}
                  className="modeling-value flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg active:scale-95"
                  style={{ color: uiColor }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </button>
              ))}
              <button
                type="button" aria-label="Done" onClick={onClose}
                className="modeling-value flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg active:scale-95"
                style={{ color: highlightColor, borderColor: highlightColor }}
              >
                <Check className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 px-1 py-1 text-[13px]" style={{ color: uiColor }}>
            <span>Unwrap the object first.</span>
            <button type="button" onClick={onClose} className="modeling-value h-8 rounded-lg px-3 active:scale-95">Close</button>
          </div>
        )}
      </div>
    </section>,
    document.body,
  );
}
