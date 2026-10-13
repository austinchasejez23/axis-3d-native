import { useEffect, useRef, useState } from 'react';
import { Gauge, Move3D, Magnet } from 'lucide-react';
import { useTheme } from '@/lib/theme';

// A deliberate tap toggles a viewport option. Free Transform and Snapping
// open their settings panels on double-tap; dragging across the stack never
// activates a button.
const SNAP_HINT = 'Double-tap the Snapping icon for settings';
const SNAP_HINT_WIDTH_REM = 9;
const FREE_HINT = 'Double-tap the Free Transform icon for settings';
const FREE_HINT_WIDTH_REM = 11;

export default function RenderBoostButtons({ renderBoost, freeTransform, snapping, onRenderBoost, onToggleFreeTransform, onToggleSnapping, onOpenFreeTransformPanel, onOpenSnapPanel }) {
  const { uiColor, highlightColor } = useTheme();
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);
  const pointerRef = useRef(null);
  const doubleTapRef = useRef({ target: null, at: 0 });
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const select = (label, action) => {
    clearTimeout(timerRef.current);
    setNotice(label);
    timerRef.current = setTimeout(() => setNotice(null), 1400);
    action();
  };
  const button = 'pointer-events-auto min-w-9 h-8 rounded-md flex items-center justify-end gap-1.5 active:scale-95 transition-transform touch-none';
  const style = (active) => ({
    color: active ? highlightColor : uiColor,
    textShadow: '0 1px 3px rgba(0,0,0,0.35)',
  });

  const tapProps = (target, action, openPanel) => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointerRef.current = { target, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    },
    onPointerMove: (e) => {
      e.stopPropagation();
      const p = pointerRef.current;
      if (p?.target === target && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) p.moved = true;
    },
    onPointerCancel: (e) => { e.stopPropagation(); pointerRef.current = null; },
    onPointerUp: (e) => {
      e.stopPropagation();
      const p = pointerRef.current;
      pointerRef.current = null;
      if (!p || p.target !== target || p.id !== e.pointerId || p.moved) return;
      const now = performance.now();
      const dbl = doubleTapRef.current.target === target && now - doubleTapRef.current.at < 360;
      doubleTapRef.current = dbl ? { target: null, at: 0 } : { target, at: now };
      if (dbl && openPanel) openPanel();
      else action();
    },
  });

  const handleFreeTap = () => {
    if (!freeTransform) window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: FREE_HINT, widthRem: FREE_HINT_WIDTH_REM } }));
    select('Free Transform', onToggleFreeTransform);
  };
  const handleSnapTap = () => {
    if (!snapping) window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: SNAP_HINT, widthRem: SNAP_HINT_WIDTH_REM } }));
    select('Snapping', onToggleSnapping);
  };

  return (
    <div className="relative z-10 flex flex-col items-end gap-2.5 mr-4">
      <button {...tapProps('boost', () => select('Render boost', onRenderBoost))} aria-label="Toggle navigation render boost" aria-pressed={renderBoost} style={style(renderBoost)} className={button}>
        {notice === 'Render boost' && <span className="text-sm whitespace-nowrap translate-y-[3px]">Render boost</span>}
        <Gauge className="w-5 h-5 shrink-0" strokeWidth={2} />
      </button>
      <button
        {...tapProps('free', handleFreeTap, onOpenFreeTransformPanel)}
        aria-label="Toggle free transform"
        aria-pressed={freeTransform}
        title="Double-tap for free transform settings"
        style={style(freeTransform)}
        className={button}
      >
        {notice === 'Free Transform' && <span className="text-sm whitespace-nowrap translate-y-[3px]">Free Transform</span>}
        <Move3D className="w-5 h-5 shrink-0" strokeWidth={2} />
      </button>
      <div className="relative">
        <button
          {...tapProps('snap', handleSnapTap, onOpenSnapPanel)}
          aria-label="Toggle snapping"
          aria-pressed={snapping}
          title="Double-tap for snap settings"
          style={style(snapping)}
          className={button}
        >
          {notice === 'Snapping' && <span className="text-sm whitespace-nowrap translate-y-[3px]">Snapping</span>}
          <Magnet className="w-5 h-5 shrink-0" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}