import { useLayoutEffect, useRef, useState } from 'react';

// True while the element sits under `rect` (an open menu's box, with a small
// margin). Lets UI step aside only when something actually covers it.
/**
 * @param {{ left: number, top: number, right: number, bottom: number } | null} rect
 * @param {number} [gap]
 * @returns {[import('react').MutableRefObject<any>, boolean]}
 */
export default function useCoveredBy(rect, gap = 4) {
  const ref = useRef(null);
  const [covered, setCovered] = useState(false);
  useLayoutEffect(() => {
    const box = rect && ref.current?.getBoundingClientRect();
    const hit = !!(box && box.width && box.height
      && box.left < rect.right + gap && box.right > rect.left - gap
      && box.top < rect.bottom + gap && box.bottom > rect.top - gap);
    setCovered((was) => (was === hit ? was : hit));
  });
  return [ref, covered];
}
