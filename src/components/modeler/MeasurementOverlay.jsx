import { useEffect, useRef, useState } from 'react';
import { formatLength } from '@/lib/units';
import { getMeasurements } from '@/lib/measurements';
import { useTheme } from '@/lib/theme';

// Renders floating measurement labels that track edges in screen space.
// Polls getMeasurements(manager, option) every frame while enabled; only
// updates React state when a rounded pixel / text value actually changes.
export default function MeasurementOverlay({ managerRef, unit, option, enabled }) {
  const [labels, setLabels] = useState([]);
  const lastMoveRef = useRef(0);
  const selectionRef = useRef('');
  const { highlightColor } = useTheme();

  useEffect(() => {
    if (!enabled) { setLabels([]); lastMoveRef.current = 0; return; }
    let active = true;
    let raf = 0;
    const tick = () => {
      if (!active) return;
      const mgr = managerRef.current;
      if (mgr) {
        const moving = (mgr.activeAction === 'move' || mgr.activeAction === 'scale') &&
          (mgr.selectionMode === 'face' || mgr.selectionMode === 'edge');
        const selectionKey = [mgr.selectionMode, mgr.selection?.meshId, ...(mgr.selection?.indices || [])].join(':');
        if (selectionRef.current !== selectionKey) {
          selectionRef.current = selectionKey;
          lastMoveRef.current = 0;
        }
        const now = performance.now();
        if (moving) lastMoveRef.current = now;
        const elapsed = now - lastMoveRef.current;
        const lingering = !moving && lastMoveRef.current > 0 && elapsed < 5600;
        const ms = getMeasurements(mgr, option, lingering);
        const next = ms.filter(m => !m.stretchDimension || moving || lingering).map((m) => ({
          x: Math.round(m.x),
          y: Math.round(m.y),
          text: (m.prefix ? `${m.prefix} ` : '') + formatLength(m.length, unit),
          line: m.line ? Object.fromEntries(Object.entries(m.line).map(([key, value]) => [key, Math.round(value)])) : null,
          stretchDimension: !!m.stretchDimension,
          opacity: m.stretchDimension && lingering && elapsed > 5000 ? Math.max(0, 1 - (elapsed - 5000) / 600) : 1,
        }));
        setLabels((prev) => {
          if (prev.length !== next.length) return next;
          for (let i = 0; i < next.length; i++) {
            if (prev[i].x !== next[i].x || prev[i].y !== next[i].y || prev[i].text !== next[i].text || prev[i].opacity !== next[i].opacity ||
              JSON.stringify(prev[i].line) !== JSON.stringify(next[i].line)) return next;
          }
          return prev;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [enabled, option, unit, managerRef]);

  if (!enabled) return null;
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {labels.map((l, i) => (
        <div
          key={i}
          className="absolute inset-0 font-mono"
          style={{ color: l.stretchDimension ? highlightColor : '#ffffff', opacity: l.opacity, fontSize: '13px', fontWeight: 700,
            textShadow: '0 1px 0 rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.9)' }}
        >
          {l.line && (() => {
            const { x1, y1, x2, y2 } = l.line;
            const dx = x2 - x1, dy = y2 - y1;
            const length = Math.hypot(dx, dy);
            const gap = Math.min(length * 0.4, l.text.length * 4.2 + 9);
            const t = length > 0 ? gap / (2 * length) : 0;
            const nx = length > 0 ? -dy / length * 5 : 0;
            const ny = length > 0 ? dx / length * 5 : 0;
            return <svg className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="1.5" fill="none">
                <path d={`M ${x1} ${y1} L ${l.x - dx * t} ${l.y - dy * t} M ${l.x + dx * t} ${l.y + dy * t} L ${x2} ${y2}`} />
                <path d={`M ${x1 - nx} ${y1 - ny} L ${x1 + nx} ${y1 + ny} M ${x2 - nx} ${y2 - ny} L ${x2 + nx} ${y2 + ny}`} />
              </g>
            </svg>;
          })()}
          <span className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
            style={{ left: l.x, top: l.y }}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}