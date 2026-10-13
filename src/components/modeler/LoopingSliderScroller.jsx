import { forwardRef, useImperativeHandle, useRef } from 'react';
import LoopingScroller from './LoopingScroller';

// Tall, narrow chevron: taller than it is wide.
function Chevron({ dir }) {
  return (
    <svg width="9" height="22" viewBox="0 0 9 22" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M7 2 L2 11 L7 20' : 'M2 2 L7 11 L2 20'} />
    </svg>
  );
}

// Material-style slider strip, endless and center-snapping. It does not swipe:
// only the chevrons move it, one slider per tap. The ends fade out exactly as
// in the Material and Texture tabs, with the chevrons sitting on the faded
// padding so they never cover a slider.
const LoopingSliderScroller = forwardRef(function LoopingSliderScroller({ children }, outerRef) {
  const ref = useRef(null);
  useImperativeHandle(outerRef, () => ({ goTo: (i) => ref.current?.goTo(i) }), []);
  const chevron = 'absolute inset-y-0 z-20 w-6 flex items-center text-white/80 active:scale-90 active:text-white';
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      <LoopingScroller
        ref={ref}
        swipe={false}
        snapCenter
        shadows
        shadowWidth={32}
        shadowAlpha={0.82}
        className="px-1"
        itemClass="px-3 border-l border-white/10"
        innerClass="items-end pt-1.5 [&_input]:!h-6"
      >
        {children}
      </LoopingScroller>
      <button type="button" onClick={() => ref.current?.step(-1)} aria-label="Previous slider" className={`${chevron} left-0 justify-start pl-1`}>
        <Chevron dir="left" />
      </button>
      <button type="button" onClick={() => ref.current?.step(1)} aria-label="Next slider" className={`${chevron} right-0 justify-end pr-1`}>
        <Chevron dir="right" />
      </button>
    </div>
  );
});

export default LoopingSliderScroller;
