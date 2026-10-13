import { useEffect, useRef, useState } from 'react';

const viewportHeight = () => window.visualViewport?.height || window.innerHeight;

export default function useKeyboardViewport() {
  const stableHeight = useRef(viewportHeight());
  const [metrics, setMetrics] = useState({ height: stableHeight.current, keyboardInset: 0, visibleHeight: stableHeight.current, offsetTop: 0 });

  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height || window.innerHeight;
      const editing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');

      if (!editing) stableHeight.current = height;

      setMetrics({
        height: stableHeight.current,
        keyboardInset: editing
          ? Math.max(0, stableHeight.current - height - (viewport?.offsetTop || 0))
          : 0,
        visibleHeight: height,
        offsetTop: viewport?.offsetTop || 0,
      });
    };

    const finishEditing = () => window.setTimeout(update, 100);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', finishEditing);

    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', finishEditing);
    };
  }, []);

  return metrics;
}