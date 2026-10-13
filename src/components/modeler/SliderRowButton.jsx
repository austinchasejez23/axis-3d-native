import { useLayoutEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { surfaceControlStyle } from './surfaceControlStyle';

// One row of the left-hand material rail: a labelled button that slides its own
// horizontal slider out to the side when selected. No background fill so the
// model stays visible; the value always reads in white.
export default function SliderRowButton({ label, value, display, min = 0, max = 100, step = 1, active, onToggle, onChange, length = 150, side = 'right', variant = 'pill', floating = false }) {
  const { uiColor, highlightColor } = useTheme();
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  // Floating slide-outs are positioned in viewport coordinates beside their own
  // row: a scrolling menu panel (overflow-y) clips anything sticking out of its
  // side, so a slider anchored inside the panel would never be reachable.
  const rowRef = useRef(null);
  const [pop, setPop] = useState(null);
  useLayoutEffect(() => {
    if (!floating || !active || !rowRef.current) { setPop(null); return; }
    const place = () => {
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = rect.right + 8;
      setPop({ left, top: rect.top + rect.height / 2, width: Math.max(56, Math.min(length, window.innerWidth - left - 46)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [floating, active, length]);

  if (variant === 'flat') {
    // Same row shape as the hamburger-menu rows: h-10, tight padding, label
    // only. The slider slides out beside the label when the row is active —
    // or, with floating=true, pops out in a floating overlay that doesn't add
    // to the row's own width/height (so it never grows its container).
    const sliderInput = (width) => (
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="gs-slider cursor-pointer touch-none"
        style={{ width, '--gs-accent': highlightColor, '--gs-pct': `${pct}%` }}
      />
    );
    const valueSpan = (
      <span className="text-[11px] font-semibold tabular-nums text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.75)' }}>{display}</span>
    );
    return (
      <div ref={rowRef} className="py-1 flex items-center gap-2.5 pointer-events-auto">
        <button onClick={onToggle} className="shrink-0 active:scale-95 transition-transform">
          <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: active ? highlightColor : uiColor }}>{label}</span>
        </button>
        {active && !floating && (<>{sliderInput(length)}{valueSpan}</>)}
        {active && floating && pop && (
          <div
            className="fixed z-50 flex items-center gap-1.5 whitespace-nowrap pointer-events-auto"
            style={{ left: pop.left, top: pop.top, transform: 'translateY(-50%)' }}
          >
            {sliderInput(pop.width)}
            {valueSpan}
          </div>
        )}
      </div>
    );
  }

  const valueLabel = (
    <span
      className="text-[11px] font-semibold tabular-nums text-white"
      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.75)' }}
    >
      {display}
    </span>
  );

  const slider = active ? (
    <div className="flex items-center gap-1.5 pointer-events-auto">
      {side === 'left' && valueLabel}
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="gs-slider cursor-pointer touch-none"
        style={{ width: length, '--gs-accent': highlightColor, '--gs-pct': `${pct}%` }}
      />
      {side === 'right' && valueLabel}
    </div>
  ) : null;

  const button = (
    <button
      onClick={onToggle}
      style={surfaceControlStyle(active, highlightColor, uiColor)}
      className={`pointer-events-auto ${side === 'left' ? 'mr-1.5' : 'ml-1.5'} px-3 py-1.5 rounded-xl text-left text-[12px] font-semibold leading-tight tracking-wide active:scale-95 transition-all`}
    >
      {label}
    </button>
  );

  if (side === 'left') {
    return (
      <div className="relative flex items-center justify-end">
        {slider}
        {button}
      </div>
    );
  }

  return (
    <div className="relative flex items-center">
      {button}
      {slider}
    </div>
  );
}