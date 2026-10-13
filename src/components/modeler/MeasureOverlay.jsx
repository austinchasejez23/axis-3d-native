import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { formatLength } from '@/lib/units';

// Measuring tool readout: a marker on each tapped point, a line between the
// last two, and the distance at the line's midpoint. Polls the manager's
// measure points every frame so the readout tracks the camera.
export default function MeasureOverlay({ managerRef, unit, enabled }) {
  const { highlightColor } = useTheme();
  const [view, setView] = useState(null);

  useEffect(() => {
    if (!enabled) { setView(null); return; }
    let active = true;
    let raf = 0;
    const tick = () => {
      if (!active) return;
      const mgr = managerRef.current;
      if (mgr) {
        const rect = mgr.renderer.domElement.getBoundingClientRect();
        const project = (world) => {
          const p = world.clone().project(mgr.camera);
          if (p.z < -1 || p.z > 1) return null;
          return { x: ((p.x + 1) / 2) * rect.width + rect.left, y: ((-p.y + 1) / 2) * rect.height + rect.top };
        };
        const worldPts = mgr.measurePoints || [];
        const pts = worldPts.map(project);
        let next = null;
        if (pts.length >= 1 && pts[0]) {
          next = {
            a: pts[0],
            b: pts[1] || null,
            length: worldPts.length >= 2 ? worldPts[0].distanceTo(worldPts[1]) : null,
          };
        }
        const keyOf = (v) => v
          ? `${Math.round(v.a.x)}|${Math.round(v.a.y)}|${v.b ? `${Math.round(v.b.x)},${Math.round(v.b.y)}` : '-'}|${v.length ?? ''}`
          : '';
        setView((prev) => (keyOf(prev) === keyOf(next) ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [enabled, unit, managerRef]);

  if (!enabled || !view) return null;
  const dot = (p) => (
    <span
      aria-hidden="true"
      className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2"
      style={{ left: p.x, top: p.y, background: highlightColor, boxShadow: '0 0 0 2px rgba(0,0,0,0.7)' }}
    />
  );
  const mid = view.b ? { x: (view.a.x + view.b.x) / 2, y: (view.a.y + view.b.y) / 2 } : null;
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {view.b && (
        <svg className="absolute inset-0 w-full h-full">
          <line x1={view.a.x} y1={view.a.y} x2={view.b.x} y2={view.b.y} stroke={highlightColor} strokeWidth={2} />
        </svg>
      )}
      {dot(view.a)}
      {view.b && dot(view.b)}
      {view.b && mid && (
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono"
          style={{
            left: mid.x, top: mid.y, color: '#ffffff',
            fontSize: '13px', fontWeight: 700,
            textShadow: '0 1px 0 rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.9)',
          }}
        >
          {formatLength(view.length, unit)}
        </span>
      )}
    </div>
  );
}