import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef } from 'react';
import SegmentsKeypad from './SegmentsKeypad';

export default function ModelingNumberPad({ open, onKey, decimal = false, signed = false }) {
  const padRef = useRef(null);
  useLayoutEffect(() => {
    if (!open || !padRef.current) return;
    const update = () => document.documentElement.style.setProperty('--modeling-keypad-height', `${padRef.current.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(padRef.current);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--modeling-keypad-height'); };
  }, [open, decimal, signed]);
  if (!open) return null;
  return createPortal(
    <div ref={padRef}
      className="fixed bottom-0 left-0 right-0 z-[90] modeling-sheet"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <SegmentsKeypad onKey={onKey} decimal={decimal} signed={signed} />
    </div>,
    document.body,
  );
}