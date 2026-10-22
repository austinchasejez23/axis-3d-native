import { Children, forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import ScrollerTunnelShadows from './ScrollerTunnelShadows';

const COPIES = 5;
const MIDDLE = 2;
const DRAG_START = 6;      // px of sideways travel before a touch becomes a swipe
const FRICTION = 0.995;    // momentum decay per ms
const MIN_SPEED = 0.02;    // px/ms where momentum stops

// Endless sideways strip. When the items are wider than the strip they are
// rendered COPIES times and the view is kept inside the middle copy by jumping
// whole copies, so the last item is followed by the first in both directions.
// When everything already fits, a single copy is shown and nothing loops.
//
// Swiping is done here, not by the browser: the modeler turns off native touch
// panning on every button and slider, which left these strips unswipeable. A
// finger anywhere on the strip (except on a slider's track) drags it, with
// momentum on release. A drag never fires the button it started on.
//   swipe       finger/wheel scrolling on (false: only step() moves it)
//   snapCenter  the view comes to rest centered on an item
//   shadows     edge fades (shadowWidth / shadowAlpha) hinting the strip loops
// The ref exposes step(-1 | 1) and goTo(i).
const LoopingScroller = forwardRef(/** @param {{
  children?: import('react').ReactNode,
  swipe?: boolean,
  snapCenter?: boolean,
  shadows?: boolean,
  shadowWidth?: number,
  shadowAlpha?: number,
  className?: string,
  itemClass?: string,
  innerClass?: string,
}} props */ function LoopingScroller(
  { children, swipe = true, snapCenter = false, shadows = false, shadowWidth = 16, shadowAlpha = 0.6, className = '', itemClass = '', innerClass = '' },
  ref,
) {
  const items = Children.toArray(children).filter(Boolean);
  const count = items.length;
  const scrollRef = useRef(null);
  const innerRef = useRef(null);
  const timer = useRef(null);
  const pending = useRef(null);
  const drag = useRef(null);
  const busy = useRef(false);
  const fling = useRef(0);
  const swallowClick = useRef(false);
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

  // Jump by whole copies back into the middle one; returns how far it moved.
  const wrap = useCallback(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner || copiesRef.current < COPIES) return 0;
    const period = inner.getBoundingClientRect().width / COPIES;
    const x = el.scrollLeft;
    const next = (((x % period) + period) % period) + period * MIDDLE;
    if (Math.abs(next - x) <= 0.5) return 0;
    el.scrollLeft = next;
    return el.scrollLeft - x;
  }, []);

  const settle = useCallback(() => {
    if (busy.current) return;
    pending.current = null;
    wrap();
  }, [wrap]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    el.addEventListener('scrollend', settle);
    return () => {
      el.removeEventListener('scrollend', settle);
      clearTimeout(timer.current);
      cancelAnimationFrame(fling.current);
    };
  }, [settle]);

  // scrollend where supported; the idle timer covers older browsers.
  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 140);
  };

  const centerOn = useCallback((idx) => {
    const el = scrollRef.current;
    const k = innerRef.current.children[idx];
    if (!el || !k) return;
    pending.current = idx;
    el.scrollTo({ left: k.offsetLeft + k.offsetWidth / 2 - el.clientWidth / 2, behavior: 'smooth' });
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 500);
  }, [settle]);

  const nearest = () => {
    const el = scrollRef.current;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let idx = 0;
    let best = Infinity;
    [...innerRef.current.children].forEach((k, i) => {
      const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid);
      if (d < best) { best = d; idx = i; }
    });
    return idx;
  };

  // Hand the strip back once a drag (and its momentum) is over.
  const release = useCallback(() => {
    const el = scrollRef.current;
    busy.current = false;
    if (!el) return;
    el.style.scrollSnapType = '';
    if (snapCenter) centerOn(nearest());
    else settle();
  }, [snapCenter, centerOn, settle]);

  const glide = useCallback((speed) => {
    const el = scrollRef.current;
    let v = speed;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(32, now - last);
      last = now;
      v *= Math.pow(FRICTION, dt);
      el.scrollLeft -= v * dt;
      wrap();
      if (Math.abs(v) > MIN_SPEED) fling.current = requestAnimationFrame(frame);
      else release();
    };
    if (Math.abs(v) > MIN_SPEED) fling.current = requestAnimationFrame(frame);
    else release();
  }, [wrap, release]);

  const onPointerDown = (e) => {
    if (!swipe || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // A slider's track belongs to the slider.
    if (e.target.closest?.('input[type="range"]')) return;
    cancelAnimationFrame(fling.current);
    if (busy.current) release();
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, s0: scrollRef.current.scrollLeft, active: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const el = scrollRef.current;
    const dx = e.clientX - d.x0;
    if (!d.active) {
      if (Math.abs(dx) > DRAG_START && Math.abs(dx) > Math.abs(e.clientY - d.y0)) {
        d.active = true;
        busy.current = true;
        el.style.scrollSnapType = 'none';
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      } else {
        return;
      }
    }
    el.scrollLeft = d.s0 - dx;
    d.s0 += wrap();
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = 0.8 * ((e.clientX - d.lastX) / dt) + 0.2 * d.v;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
  };

  const onPointerEnd = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.active) return;
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
    // A finger that stopped before lifting should not glide.
    glide(e.timeStamp - d.lastT > 80 ? 0 : d.v);
  };

  const onClickCapture = (e) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  useImperativeHandle(ref, () => ({
    step(dir) {
      const kids = innerRef.current.children;
      const idx = pending.current ?? nearest();
      centerOn(Math.max(0, Math.min(kids.length - 1, idx + dir)));
    },
    // Bring item `i` (0-based within one copy) to the center, using whichever
    // copy is nearest to where the view is now.
    goTo(i) {
      const el = scrollRef.current;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let idx = i;
      let best = Infinity;
      [...innerRef.current.children].forEach((k, j) => {
        if (j % count !== i) return;
        const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid);
        if (d < best) { best = d; idx = j; }
      });
      centerOn(idx);
    },
  }), [centerOn, count]);

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
        className={`${swipe ? 'overflow-x-auto' : 'overflow-x-hidden'} no-scrollbar ${snapCenter ? 'snap-x snap-mandatory' : ''}`}
        style={{ touchAction: 'none' }}
      >
        <div ref={innerRef} className={`flex w-max ${innerClass}`}>{list}</div>
      </div>
      {shadows && looping && <ScrollerTunnelShadows width={shadowWidth} alpha={shadowAlpha} />}
    </div>
  );
});

export default LoopingScroller;
