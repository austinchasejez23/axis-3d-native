import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTheme } from '@/lib/theme';

export default function MovableToolChevron({ mode, expanded, onToggle }) {
  const { uiColor, highlightColor } = useTheme();
  const key = `axis3d.chevron.lower.v2.${mode}`;
  const read = () => { const p = JSON.parse(localStorage.getItem(key) || 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; };
  const [position, setPosition] = useState(read);
  const [held, setHeld] = useState(false);
  const drag = useRef(null), timer = useRef(null), suppress = useRef(false), button = useRef(null);
  const clamp = (p) => ({ x: Math.max(0, Math.min(p.x, window.innerWidth - 68)), y: Math.max(0, Math.min(p.y, window.innerHeight - 52)) });
  useEffect(() => { setPosition(read()); return () => clearTimeout(timer.current); }, [key]);
  useEffect(() => { const resize = () => setPosition(p => p ? clamp(p) : null); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const finish = (e) => {
    e.stopPropagation(); clearTimeout(timer.current);
    if (drag.current?.moved && e.type !== 'pointercancel') localStorage.setItem(key, JSON.stringify(clamp(drag.current.next)));
    if (e.type === 'pointercancel' && drag.current) setPosition(drag.current.previous);
    drag.current = null; setHeld(false);
  };
  const Chevron = expanded ? ChevronDown : ChevronUp;
  return (
    <button ref={button} aria-label={expanded ? 'Collapse hidden tools' : 'Expand hidden tools'} aria-pressed={expanded}
      className="pointer-events-auto w-[68px] h-[52px] shrink-0 flex items-center justify-center rounded-lg touch-none"
      style={{ color: uiColor, ...(position ? { position: 'fixed', left: clamp(position).x, top: clamp(position).y } : {}), outline: held ? `1px solid ${highlightColor}` : undefined }}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); suppress.current = false;
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, previous: position, ready: false };
        timer.current = setTimeout(() => { if (drag.current) { drag.current.ready = true; suppress.current = true; setHeld(true); } }, 450);
      }}
      onPointerMove={e => {
        e.stopPropagation(); const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.ready) { if (Math.hypot(dx, dy) > 14) clearTimeout(timer.current); return; }
        d.next = clamp({ x: d.left + dx, y: d.top + dy }); d.moved = true; setPosition(d.next);
      }}
      onPointerUp={finish} onPointerCancel={finish}
      onClick={e => { e.stopPropagation(); if (suppress.current) { suppress.current = false; return; } onToggle(); }}>
      <Chevron width={44} height={32} strokeWidth={2.5} />
    </button>
  );
}