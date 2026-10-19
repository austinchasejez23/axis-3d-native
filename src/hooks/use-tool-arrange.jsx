import { useEffect, useRef, useState } from 'react';
import { loadToolLayout, saveToolLayout } from '@/lib/toolLayout';

const HOLD_MS = 450;
const HOLD_DRIFT_PX = 20;
const DROP_EDGE_PX = 20;
const expandedByMode = new Map();

// Arranging and hiding tools, modeled on the modeler's own multi-select:
//   • touch-and-hold a tool, then DRAG it to a free slot to move it there (or
//     onto another tool to swap the two);
//   • touch-and-hold a tool and RELEASE in place to select it — like a press-
//     hold on geometry enters multi-select. While anything is selected, plain
//     taps toggle other tools in and out of the selection instead of running.
//   • with two or more selected, Hide (or Show, when the selection is already
//     hidden) tucks them away; a chevron then expands/collapses the hidden set.
export function useToolArrange(mode) {
  const [layout, setLayout] = useState(() => loadToolLayout(mode));
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(() => expandedByMode.get(mode) || false);
  const [held, setHeld] = useState(null);   // { row, col } being dragged
  const [over, setOver] = useState(null);   // { row, col } under the finger
  const [pointer, setPointer] = useState(null); // { x, y } of the finger while dragging
  const heldRef = useRef(null);
  const timer = useRef(null);
  const start = useRef(null);
  const lastPoint = useRef(null);
  const dragged = useRef(false);
  const detach = useRef(null);

  useEffect(() => { heldRef.current = null; setHeld(null); setLayout(loadToolLayout(mode)); setSelected([]); setExpanded(expandedByMode.get(mode) || false); }, [mode]);
  useEffect(() => () => { clearTimeout(timer.current); detach.current?.(); }, []);

  const commit = (rows, hidden = layout.hidden) => {
    setLayout({ rows, hidden });
    saveToolLayout(mode, rows, hidden);
  };

  const slotAt = (x, y) => {
    const direct = document.elementFromPoint(x, y)?.closest('[data-tool-slot]');
    if (direct) {
      const [row, col] = direct.getAttribute('data-tool-slot').split(':').map(Number);
      return { row, col };
    }

    const slots = [...document.querySelectorAll('[data-tool-slot]')]
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    if (slots.length === 0) return null;

    const bounds = slots.reduce((box, { rect }) => ({
      left: Math.min(box.left, rect.left),
      right: Math.max(box.right, rect.right),
      top: Math.min(box.top, rect.top),
      bottom: Math.max(box.bottom, rect.bottom),
    }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    if (x < bounds.left - DROP_EDGE_PX || x > bounds.right + DROP_EDGE_PX || y < bounds.top - DROP_EDGE_PX || y > bounds.bottom + DROP_EDGE_PX) return null;

    // Keep the winning element and its distance separately, instead of
    // inventing an extra property on the DOM hit record.
    let nearest = null;
    let nearestDistance = Infinity;
    for (const current of slots) {
      const cx = current.rect.left + current.rect.width / 2;
      const cy = current.rect.top + current.rect.height / 2;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance < nearestDistance) {
        nearest = current;
        nearestDistance = distance;
      }
    }
    if (!nearest) return null;
    const [row, col] = nearest.el.getAttribute('data-tool-slot').split(':').map(Number);
    return { row, col };
  };

  const cancelHold = () => { clearTimeout(timer.current); timer.current = null; };

  const toggleSelected = (id) => setSelected((s) => (s.includes(id) ? s.filter((t) => t !== id) : [...s, id]));

  const onPointerDown = (row, col) => (event) => {
    // Follow the finger on the window, not on the button it started on: a touch
    // that leaves the button (or that the browser tries to claim) stops
    // delivering events to the element itself, so the move never happened on a
    // phone. Window listeners keep every move and the release.
    detach.current?.();
    let finished = false;
    const reset = () => {
      cancelHold();
      heldRef.current = null;
      setHeld(null);
      setOver(null);
      setPointer(null);
    };
    const finish = (point) => {
      if (finished) return;
      finished = true;
      detach.current?.();
      onPointerUp(point);
    };
    const move = (e) => { lastPoint.current = e; e.preventDefault(); onPointerMove(e); };
    const up = (e) => finish(e);
    // Android can cancel either event stream after the tool has already lifted.
    // Commit at the last known finger position instead of throwing the move away.
    const pointerCancel = () => heldRef.current ? finish(lastPoint.current) : reset();
    const touchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      lastPoint.current = touch;
      onPointerMove(touch);
    };
    const touchEnd = (e) => {
      const touch = e.changedTouches[0];
      if (touch) finish(touch);
    };
    const touchCancel = () => heldRef.current ? finish(lastPoint.current) : reset();
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchCancel);
    detach.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchCancel);
      detach.current = null;
    };
    start.current = { x: event.clientX, y: event.clientY, row, col };
    lastPoint.current = event;
    dragged.current = false;
    cancelHold();
    timer.current = setTimeout(() => {
      dragged.current = true;
      heldRef.current = { row, col };
      setHeld(heldRef.current);
      setOver(heldRef.current);
      setPointer({ x: start.current.x, y: start.current.y });
      navigator.vibrate?.(12);
    }, HOLD_MS);
  };

  const onPointerMove = (event) => {
    if (!heldRef.current) {
      // Movement before the hold completes cancels arranging. It must never
      // pick up or move a tool, and the release must not activate that tool.
      if (timer.current && start.current) {
        const moved = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
        if (moved > HOLD_DRIFT_PX) {
          cancelHold();
          dragged.current = true;
        }
      }
      return;
    }
    setOver(slotAt(event.clientX, event.clientY));
    setPointer({ x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event) => {
    cancelHold();
    const active = heldRef.current;
    if (!active) return;
    const rows = layout.rows;
    const target = slotAt(event.clientX, event.clientY);
    if (!target || (target.row === active.row && target.col === active.col)) {
      // Held and released in place: select it, like press-hold on geometry.
      toggleSelected(rows[active.row][active.col]);
    } else {
      const next = rows.map((r) => [...r]);
      next[target.row][target.col] = rows[active.row][active.col];
      next[active.row][active.col] = rows[target.row][target.col];
      commit(next);
    }
    heldRef.current = null;
    setHeld(null);
    setOver(null);
    setPointer(null);
  };

  // The pick-up gesture must not also fire the tool it was held on.
  const onClickCapture = (event) => {
    if (dragged.current) {
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // Hide / Show the selection. Showing keeps the grid expanded so the tools
  // that just came back are visible right where they are.
  const allSelectedHidden = selected.length > 0 && selected.every((id) => layout.hidden.includes(id));
  const toggleHideSelected = () => {
    const hidden = allSelectedHidden
      ? layout.hidden.filter((id) => !selected.includes(id))
      : [...new Set([...layout.hidden, ...selected])];
    commit(layout.rows, hidden);
    setSelected([]);
  };

  return {
    rows: layout.rows,
    hidden: layout.hidden,
    selected,
    toggleSelected,
    clearSelected: () => setSelected([]),
    allSelectedHidden,
    toggleHideSelected,
    expanded,
    toggleExpanded: () => setExpanded((value) => {
      const next = !value;
      expandedByMode.set(mode, next);
      return next;
    }),
    held,
    over,
    pointer,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClickCapture,
  };
}