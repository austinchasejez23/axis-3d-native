import { useEffect, useRef, useState } from 'react';
import { Gauge, Move3D, Magnet, Crosshair } from 'lucide-react';
import ResistanceIcon from './ResistanceIcon';
import { useTheme } from '@/lib/theme';
import { helpIntercept } from '@/lib/helpMode';

// A deliberate tap toggles a viewport option. Free Transform and Snapping
// open their settings panels on double-tap; dragging across the stack never
// activates a button.
const SNAP_HINT = 'Double-tap the Snapping icon for settings';
const SNAP_HINT_WIDTH_REM = 12;
const FREE_HINT = 'Double-tap the Free Transform icon for settings';
const FREE_HINT_WIDTH_REM = 12;
const RESISTANCE_HINT = 'Double-tap the Resistance icon for settings';

export default function RenderBoostButtons({ renderBoost, freeTransform, snapping, onRenderBoost, onToggleFreeTransform, onToggleSnapping, onOpenFreeTransformPanel, onOpenSnapPanel, onFocus, precision, onTogglePrecision, onOpenPrecisionPanel, group = 'all' }) {
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
  const button = 'pointer-events-auto relative w-full h-8 rounded-md flex items-center justify-center active:scale-95 transition-transform touch-none';
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
      if (helpIntercept({ id: target })) return;
      const now = performance.now();
      const dbl = doubleTapRef.current.target === target && now - doubleTapRef.current.at < 360;
      doubleTapRef.current = dbl ? { target: null, at: 0 } : { target, at: now };
      if (dbl && openPanel) openPanel();
      else action();
    },
  });

  const handleFreeTap = () => {
    if (!freeTransform) window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: FREE_HINT, widthRem: FREE_HINT_WIDTH_REM, small: true } }));
    select('Free Transform', onToggleFreeTransform);
  };
  const handleResistanceTap = () => {
    window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: RESISTANCE_HINT, widthRem: 12, small: true } }));
    select('Resistance', onTogglePrecision);
  };
  const handleSnapTap = () => {
    if (!snapping) window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: SNAP_HINT, widthRem: SNAP_HINT_WIDTH_REM, small: true } }));
    select('Snapping', onToggleSnapping);
  };

  return (
    <div className="relative z-10 flex w-full flex-col items-center">
      {(group === 'all' || group === 'visual') && <button {...tapProps('boost', () => select('Render boost', onRenderBoost))} aria-label="Toggle navigation render boost" aria-pressed={renderBoost} style={style(renderBoost)} className={button}>
        {notice === 'Render boost' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Render boost</span>}
        <Gauge className="w-5 h-5 shrink-0" strokeWidth={2} />
      </button>}
      {group === 'all' && <div className="h-[10px] w-full" aria-hidden="true" />}
      {(group === 'all' || group === 'action') && <>
      <button
        {...tapProps('free', handleFreeTap, onOpenFreeTransformPanel)}
        aria-label="Toggle free transform"
        aria-pressed={freeTransform}
        title="Double-tap for free transform settings"
        style={style(freeTransform)}
        className={button}
      >
        {notice === 'Free Transform' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Free Transform</span>}
        <Move3D className="w-5 h-5 shrink-0" strokeWidth={2} />
      </button>
      <div className="h-[10px] w-full" aria-hidden="true" />
      <div className="relative w-full">
        <button
          {...tapProps('snap', handleSnapTap, onOpenSnapPanel)}
          aria-label="Toggle snapping"
          aria-pressed={snapping}
          title="Double-tap for snap settings"
          style={style(snapping)}
          className={button}
        >
          {notice === 'Snapping' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Snapping</span>}
          <Magnet className="w-5 h-5 shrink-0" strokeWidth={2} />
        </button>
      </div>
      <div className="h-[10px] w-full" aria-hidden="true" />
      <button {...tapProps('precision', handleResistanceTap, onOpenPrecisionPanel)} aria-label="Toggle resistance" aria-pressed={precision} title="Double-tap for resistance settings" style={style(precision)} className={button}>
        {notice === 'Resistance' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Resistance</span>}
        <ResistanceIcon className="w-5 h-5 shrink-0" />
      </button>
      <div className="h-[10px] w-full" aria-hidden="true" />
      {/* Focus: one tap re-centers the camera on the current selection. */}
      <button {...tapProps('focus', () => select('Focus', onFocus))} aria-label="Focus on selection" style={style(false)} className={button}>
        {notice === 'Focus' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Focus</span>}
        <Crosshair className="w-5 h-5 shrink-0" strokeWidth={2} />
      </button>
      </>}
    </div>
  );
}