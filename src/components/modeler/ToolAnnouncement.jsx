import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';

const SLIDE_MS = 350;

// Tool-name label: slides in from the right edge, under the Undo button.
export default function ToolAnnouncement({ suppressed = false }) {
  const { uiColor } = useTheme();
  const [selection, setSelection] = useState(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef([]);
  const clearTimers = () => timers.current.forEach(clearTimeout);

  useEffect(() => {
    const announce = (event) => {
      const label = event.detail?.label;
      if (!label) return;
      clearTimers();
      // A longer, sentence-style hint can opt into a narrower box so it wraps
      // into a tight block hugging the right edge.
      setSelection({ label, widthRem: event.detail?.widthRem, small: !!event.detail?.small });
      setVisible(false);
      timers.current = [
        setTimeout(() => setVisible(true), 20),
        setTimeout(() => setVisible(false), 5000),
        setTimeout(() => setSelection(null), 5000 + SLIDE_MS),
      ];
    };
    const close = (event) => {
      const closingLabel = event.detail?.label;
      setSelection((current) => {
        if (!current || (closingLabel && current.label.toLowerCase() !== closingLabel.toLowerCase())) return current;
        clearTimers();
        setVisible(false);
        timers.current = [setTimeout(() => setSelection(null), SLIDE_MS)];
        return current;
      });
    };
    window.addEventListener('axis-tool-selected', announce);
    window.addEventListener('axis-tool-closed', close);
    return () => {
      window.removeEventListener('axis-tool-selected', announce);
      window.removeEventListener('axis-tool-closed', close);
      clearTimers();
    };
  }, []);

  if (!selection || suppressed) return null;
  const label = selection.label.replace(/\n/g, ' ');
  return (
    <div className="w-full flex justify-center overflow-hidden pointer-events-none">
    <div
      className="font-mono font-semibold"
      style={{
        color: uiColor,
        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        transform: visible ? 'translateX(0)' : 'translateX(105%)',
        transition: `transform ${SLIDE_MS}ms ease`,
        maxWidth: `${selection.widthRem || 16}rem`,
      }}
    >
      <div className={`px-2 py-1.5 text-center leading-tight ${selection.small ? 'text-[14px]' : 'text-[1.375rem]'}`}>
        <span style={{ textWrap: 'balance' }}>{label}</span>
      </div>
    </div>
    </div>
  );
}
