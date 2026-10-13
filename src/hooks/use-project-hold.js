import { useEffect, useRef } from 'react';
export default function useProjectHold(onHold) {
  const timer = useRef(null), origin = useRef(null), held = useRef(false);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  return {
    onPointerDown(event) {
      if (event.button !== 0) return;
      cancel(); held.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { held.current = true; onHold(); }, 450);
    },
    onPointerMove(event) {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(event) { event.preventDefault(); },
    onClickCapture(event) {
      if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false; }
    },
    onKeyDown(event) {
      if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onHold(); }
    },
  };
}