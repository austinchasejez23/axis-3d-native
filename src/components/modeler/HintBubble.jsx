import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/lib/theme';

const SHOW_MS = 8000;
const FADE_MS = 500;
const GAP = 9;
const EDGE = 6;
const POINTER = 10;

// A small talk box whose point touches the control it is about (`target` is a
// CSS selector, or a function returning a screen rectangle, such as the
// selection's place on the model). It fades in, pulses slightly and fades away after about 8
// seconds. Tapping it or the control closes it at once.
export default function HintBubble({ target, text, side = 'top', onClose }) {
  const { highlightColor } = useTheme();
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [place, setPlace] = useState(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), SHOW_MS - FADE_MS);
    const done = setTimeout(() => closeRef.current?.('timeout'), SHOW_MS);
    const onPointer = (event) => {
      if (typeof target === 'function') {
        const r = target();
        if (r && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) closeRef.current?.('target');
        return;
      }
      const node = document.querySelector(target);
      if (node && node.contains(event.target)) closeRef.current?.('target');
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => { clearTimeout(fade); clearTimeout(done); window.removeEventListener('pointerdown', onPointer, true); };
  }, [target]);

  // Follows the control every frame, so it stays attached while things move;
  // if the control goes away, so does the hint.
  useLayoutEffect(() => {
    let frame = 0, missing = 0;
    const tick = () => {
      const box = boxRef.current;
      const rect = typeof target === 'function' ? target() : document.querySelector(target)?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) {
        missing += 1;
        if (missing > 3) { closeRef.current?.('gone'); return; }
      } else if (box) {
        missing = 0;
        const w = box.offsetWidth, h = box.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left, top, point;
        if (side === 'right') {
          left = Math.min(rect.right + GAP, vw - w - EDGE);
          top = Math.max(EDGE, Math.min(rect.top + rect.height / 2 - h / 2, vh - h - EDGE));
          point = Math.max(POINTER, Math.min(rect.top + rect.height / 2 - top, h - POINTER));
        } else {
          left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - EDGE));
          top = side === 'bottom' ? rect.bottom + GAP : rect.top - GAP - h;
          point = Math.max(POINTER + 2, Math.min(rect.left + rect.width / 2 - left, w - POINTER - 2));
        }
        setPlace((current) => (current && current.left === left && current.top === top && current.point === point ? current : { left, top, point }));
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target, side]);

  const background = 'rgba(10,12,18,0.95)';
  const border = `1px solid ${highlightColor}`;
  const pointerStyle = side === 'right'
    ? { left: -POINTER / 2 - 1, top: (place?.point ?? 0) - POINTER / 2, borderLeft: border, borderBottom: border }
    : side === 'bottom'
      ? { top: -POINTER / 2 - 1, left: (place?.point ?? 0) - POINTER / 2, borderLeft: border, borderTop: border }
      : { bottom: -POINTER / 2 - 1, left: (place?.point ?? 0) - POINTER / 2, borderRight: border, borderBottom: border };
  const origin = side === 'right' ? `0 ${place?.point ?? 0}px` : side === 'bottom' ? `${place?.point ?? 0}px 0` : `${place?.point ?? 0}px 100%`;

  return createPortal(
    <div
      role="status"
      onPointerDown={(event) => { event.stopPropagation(); closeRef.current?.('tap'); }}
      className={`${leaving ? 'axis-hint-out' : 'axis-hint'} fixed z-[70] pointer-events-auto`}
      style={{ left: place?.left ?? -9999, top: place?.top ?? -9999 }}
    >
      <div
        ref={boxRef}
        className="axis-hint-body relative rounded-lg px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
        style={{ color: '#ffffff', background, border, boxShadow: '0 6px 18px rgba(0,0,0,0.4)', transformOrigin: origin }}
      >
        {text}
        <span aria-hidden="true" className="absolute rotate-45" style={{ width: POINTER, height: POINTER, background, ...pointerStyle }} />
      </div>
    </div>,
    document.body,
  );
}
