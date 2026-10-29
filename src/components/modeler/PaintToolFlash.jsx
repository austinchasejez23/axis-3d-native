import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';

const HOLD_MS = 4000;
const FADE_MS = 400;

// Name of the paint button that was just pressed. It sits at the left edge
// directly under the tool-name label (ToolAnnouncement, "Materials"), in the
// same type, and fades out after 4 seconds. The Paint tab announces a press
// with window.dispatchEvent(new CustomEvent('axis-paint-label', { detail: { label } })).
export default function PaintToolFlash({ suppressed = false }) {
  const { uiColor } = useTheme();
  const [text, setText] = useState(null);
  const [shown, setShown] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const onLabel = (e) => {
      const label = e.detail?.label;
      if (!label) return;
      clearTimeout(timer.current);
      setText(label);
      setShown(true);
      // Once faded out it is removed, so it never leaves an empty gap in the label stack.
      timer.current = setTimeout(() => {
        setShown(false);
        timer.current = setTimeout(() => setText(null), FADE_MS);
      }, HOLD_MS);
    };
    window.addEventListener('axis-paint-label', onLabel);
    return () => {
      window.removeEventListener('axis-paint-label', onLabel);
      clearTimeout(timer.current);
    };
  }, []);

  if (!text || suppressed) return null;
  return (
    <div
      className="w-full py-1 text-center font-mono font-semibold text-lg leading-tight pointer-events-none"
      style={{
        color: uiColor,
        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        opacity: shown ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      {text}
    </div>
  );
}
