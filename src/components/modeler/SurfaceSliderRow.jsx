import { forwardRef, useImperativeHandle, useRef } from 'react';
import LoopingScroller from './LoopingScroller';

// Endless sideways strip of inline sliders, each separated by a thin divider.
// Swipe on the labels or the space above them; a slider's track adjusts the
// slider. `goTo(i)` brings slider i to the middle of the strip.
const SurfaceSliderRow = forwardRef(/** @param {{ children?: import('react').ReactNode, fit?: boolean, compact?: boolean, scrollPadTop?: boolean }} props */ function SurfaceSliderRow({ children, fit = false, compact = false, scrollPadTop = false }, outerRef) {
  const loopRef = useRef(null);
  useImperativeHandle(outerRef, () => ({ goTo: (i) => loopRef.current?.goTo(i) }), []);
  const spacing = compact
    ? 'py-1 [&_input]:!h-7'
    : scrollPadTop
      ? 'pt-4 pb-0 [&_input]:!h-8'
      : 'py-2 [&_input]:!h-8';
  return (
    <div className="relative mt-1.5 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      {fit ? (
        <div className={`flex items-end px-1 ${spacing} w-full [&>*]:px-3 [&>*+*]:border-l [&>*+*]:border-white/10`}>
          {children}
        </div>
      ) : (
        <LoopingScroller
          ref={loopRef}
          shadows
          shadowWidth={32}
          shadowAlpha={0.82}
          itemClass="px-3 border-l border-white/10"
          innerClass={`items-end ${spacing}`}
        >
          {children}
        </LoopingScroller>
      )}
    </div>
  );
});

export default SurfaceSliderRow;
