import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef } from 'react';
import { Delete } from 'lucide-react';
import { useTheme } from '@/lib/theme';

// The HUD's number pad has its own appearance; other modeling keypads stay unchanged.
/**
 * @param {{ open: boolean, onKey: (key: string) => void,
 *   onClose?: () => void, decimal?: boolean, signed?: boolean }} props
 */
export default function HudNumberPad({ open, onKey, onClose = undefined, decimal = false, signed = false }) {
  const padRef = useRef(null);
  const { uiColor } = useTheme();
  useLayoutEffect(() => {
    if (!open || !padRef.current) return;
    const update = () => document.documentElement.style.setProperty('--modeling-keypad-height', `${padRef.current.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(padRef.current);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--modeling-keypad-height'); };
  }, [open, decimal, signed]);
  if (!open) return null;
  // Keep decimal point visible on every keypad for consistent entry.
  const lastRow = [signed ? '+/−' : null, '.', '0', 'Backspace'].filter(Boolean);
  if (lastRow.length === 2) lastRow.unshift('');
  const lastSpan = lastRow.length === 4 ? 'col-span-3' : 'col-span-4';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ...lastRow];
  return createPortal(
    <div ref={padRef} className="fixed bottom-0 left-0 right-0 z-[90] modeling-sheet"
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose?.(); } }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}>
      <div role="group" aria-label="HUD keypad" className="grid w-full grid-cols-12 gap-1.5 border-t p-2 touch-none"
        style={{ color: uiColor, borderColor: 'rgb(var(--modeling-border) / 0.16)' }}
        onPointerDown={(event) => event.stopPropagation()}>
        {keys.map((label, index) => label ? (
          <button key={`${label}-${index}`} type="button" aria-label={label}
            onClick={() => onKey(label)}
            className={`${index < 9 ? 'col-span-4' : lastSpan} flex h-11 items-center justify-center rounded-lg bg-transparent text-[17px] font-semibold active:opacity-60 touch-none`}
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}>
            {label === 'Backspace' ? <Delete className="h-5 w-5" /> : label}
          </button>
        ) : <span key={`blank-${index}`} className={lastSpan} />)}
      </div>
    </div>, document.body,
  );
}