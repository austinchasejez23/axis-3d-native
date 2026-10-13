import { useEffect, useRef, useState } from 'react';

// Lightweight native-style pull-to-refresh for a scrollable container.
// Only engages when the container is already scrolled to the top.
export default function usePullToRefresh(ref, onRefresh, { threshold = 70 } = {}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pullRef = useRef(0);
  pullRef.current = pull;
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e) => {
      if (el.scrollTop <= 0 && e.touches.length === 1) startY.current = e.touches[0].clientY;
      else startY.current = null;
    };
    const onMove = (e) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && el.scrollTop <= 0) {
        setPull(Math.min(dy * 0.5, threshold + 25));
      } else {
        setPull(0);
      }
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      const reached = pullRef.current >= threshold;
      startY.current = null;
      if (reached) {
        setRefreshing(true);
        setPull(threshold);
        await new Promise((r) => setTimeout(r, 400));
        cbRef.current?.();
        setRefreshing(false);
      }
      setPull(0);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, threshold]);

  return { pull, refreshing };
}