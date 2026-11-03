import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTheme } from '@/lib/theme';

// Where the chevron sits until it is moved: centred under the seven side
// controls (their layout position, so it stays put while they are slid
// away), hovering just above the left column's tools — the bottom bar, or
// whatever is shown in the left slots above it, so it rises as tools are
// expanded or moved there.
function toolAnchor(node) {
  const controls = document.getElementById('axis-side-controls');
  const grid = node?.closest('[data-tool-grid]');
  if (!controls || !grid) return null;
  let topCell = null;
  for (const cell of grid.querySelectorAll('[data-tool-cell$=":0"]')) {
    const rect = cell.getBoundingClientRect();
    if (rect.height > 0 && (!topCell || rect.top < topCell.top)) topCell = rect;
  }
  const top = topCell ? topCell.top : grid.querySelector('[data-tool-bar]')?.getBoundingClientRect().top;
  if (!Number.isFinite(top)) return null;
  // No room between the side controls and the left slots (all filled on a
  // short screen): sit beside the top left-slot tool instead of on either.
  if (topCell && top - 54 < controls.getBoundingClientRect().bottom + 2) {
    return { x: Math.round(topCell.right + 2), y: Math.round(topCell.top) };
  }
  return { x: Math.round(controls.offsetLeft + controls.offsetWidth / 2 - 34), y: Math.round(top - 52 - 2) };
}

export default function MovableToolChevron({ mode, expanded, onToggle }) {
  const { uiColor, highlightColor } = useTheme();
  const key = `axis3d.chevron.lower.v4.${mode}`;
  const read = () => { const p = JSON.parse(localStorage.getItem(key) || 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; };
  const [position, setPosition] = useState(read);
  const [anchor, setAnchor] = useState(null);
  const [held, setHeld] = useState(false);
  const drag = useRef(null), timer = useRef(null), suppress = useRef(false), button = useRef(null);
  const clamp = (p) => ({ x: Math.max(0, Math.min(p.x, window.innerWidth - 68)), y: Math.max(0, Math.min(p.y, window.innerHeight - 52)) });
  useEffect(() => { setPosition(read()); return () => clearTimeout(timer.current); }, [key]);
  // Re-measured after every render (tools expanded, hidden, moved, Boolean
  // opened) and whenever the tool grid changes size.
  const measure = () => {
    const next = toolAnchor(button.current);
    setAnchor((current) => (current?.x === next?.x && current?.y === next?.y ? current : next));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const resize = () => { setPosition(p => p ? clamp(p) : null); measure(); };
    window.addEventListener('resize', resize);
    const grid = button.current?.closest('[data-tool-grid]');
    const observer = grid && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (grid) observer?.observe(grid);
    return () => { window.removeEventListener('resize', resize); observer?.disconnect(); };
  }, []);
  // A moved chevron stays on screen; the default spot may sit slightly past
  // the left edge so it stays centred under the side controls.
  const placed = position ? clamp(position) : anchor ? { x: anchor.x, y: clamp(anchor).y } : null;
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
      style={{ color: uiColor, ...(placed ? { position: 'fixed', left: placed.x, top: placed.y } : {}), outline: held ? `1px solid ${highlightColor}` : undefined }}
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