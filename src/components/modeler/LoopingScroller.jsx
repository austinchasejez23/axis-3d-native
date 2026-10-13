import { Children, forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import ScrollerTunnelShadows from './ScrollerTunnelShadows';

const COPIES = 5;
const MIDDLE = 2;

// Endless sideways strip. When the items are wider than the strip they are
// rendered COPIES times and, whenever scrolling settles, the view jumps by
// whole copies back to the middle one — so the last item is followed by the
// first, in both directions. When everything already fits, a single copy is
// shown and nothing loops.
//   swipe       finger/wheel scrolling on (false: only step() moves it)
//   snapCenter  items carry snap-center so the view always rests on one item
//   shadows     edge fades (shadowWidth / shadowAlpha) hinting the strip loops;
//               they span the whole outer box, padding from `className` included
// The ref exposes step(-1 | 1): move one item and center it.
const LoopingScroller = forwardRef(function LoopingScroller(
  { children, swipe = true, snapCenter = false, shadows = false, shadowWidth = 16, shadowAlpha = 0.6, className = '', itemClass = '', innerClass = '' },
  ref,
) {
  const items = Children.toArray(children).filter(Boolean);
  const count = items.length;
  const scrollRef = useRef(null);
  const innerRef = useRef(null);
  const timer = useRef(null);
  const pending = useRef(null);
  const [copies, setCopies] = useState(1);
  const copiesRef = useRef(1);
  copiesRef.current = copies;
  const looping = copies > 1;

  // Loop only when one copy is wider than the strip.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const measure = () => {
      const one = innerRef.current.getBoundingClientRect().width / copiesRef.current;
      setCopies(one > el.clientWidth + 0.5 ? COPIES : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  // Start on the first item of the middle copy.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!looping) { el.scrollLeft = 0; return; }
    const first = innerRef.current.children[count * MIDDLE];
    el.scrollLeft = snapCenter ? first.offsetLeft + first.offsetWidth / 2 - el.clientWidth / 2 : first.offsetLeft;
  }, [looping, count, snapCenter]);

  // Once scrolling stops, jump by whole copies back into the middle one.
  const settle = useCallback(() => {
    pending.current = null;
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner || copiesRef.current < COPIES) return;
    const period = inner.getBoundingClientRect().width / COPIES;
    const x = el.scrollLeft;
    const next = (((x % period) + period) % period) + period * MIDDLE;
    if (Math.abs(next - x) > 0.5) el.scrollLeft = next;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    el.addEventListener('scrollend', settle);
    return () => {
      el.removeEventListener('scrollend', settle);
      clearTimeout(timer.current);
    };
  }, [settle]);

  // scrollend where supported; the idle timer covers older browsers.
  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 140);
  };

  useImperativeHandle(ref, () => ({
    step(dir) {
      const el = scrollRef.current;
      const kids = [...innerRef.current.children];
      let idx = pending.current;
      if (idx == null) {
        const mid = el.scrollLeft + el.clientWidth / 2;
        let best = Infinity;
        kids.forEach((k, i) => {
          const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid);
          if (d < best) { best = d; idx = i; }
        });
      }
      idx = Math.max(0, Math.min(kids.length - 1, idx + dir));
      pending.current = idx;
      const k = kids[idx];
      el.scrollTo({ left: k.offsetLeft + k.offsetWidth / 2 - el.clientWidth / 2, behavior: 'smooth' });
      clearTimeout(timer.current);
      timer.current = setTimeout(settle, 500);
    },
    // Bring item `i` (0-based within one copy) to the center, using whichever
    // copy is nearest to where the view is now.
    goTo(i) {
      const el = scrollRef.current;
      const kids = [...innerRef.current.children];
      const mid = el.scrollLeft + el.clientWidth / 2;
      let idx = i;
      let best = Infinity;
      kids.forEach((k, j) => {
        if (j % count !== i) return;
        const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid);
        if (d < best) { best = d; idx = j; }
      });
      pending.current = idx;
      const k = kids[idx];
      el.scrollTo({ left: k.offsetLeft + k.offsetWidth / 2 - el.clientWidth / 2, behavior: 'smooth' });
      clearTimeout(timer.current);
      timer.current = setTimeout(settle, 500);
    },
  }), [settle, count]);

  const list = Array.from({ length: copies }, (_, c) =>
    items.map((item, i) => (
      <div key={`${c}-${i}`} className={`shrink-0 ${snapCenter ? 'snap-center' : ''} ${itemClass}`}>
        {item}
      </div>
    )),
  ).flat();

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`${swipe ? 'overflow-x-auto' : 'overflow-x-hidden'} no-scrollbar ${snapCenter ? 'snap-x snap-mandatory' : ''}`}
        style={{ touchAction: swipe ? 'pan-x' : 'pan-y' }}
      >
        <div ref={innerRef} className={`flex w-max ${innerClass}`}>{list}</div>
      </div>
      {shadows && looping && <ScrollerTunnelShadows width={shadowWidth} alpha={shadowAlpha} />}
    </div>
  );
});

export default LoopingScroller;
