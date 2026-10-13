import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { getToolDescription } from '@/lib/toolKnowledge';


const SLIDE_MS = 350;

export default function ToolAnnouncement({ toolActive = false, suppressed = false }) {
  const { uiColor } = useTheme();
  const [selection, setSelection] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const timers = useRef([]);
  const clearTimers = () => timers.current.forEach(clearTimeout);

  useEffect(() => {
    const announce = (event) => {
      const label = event.detail?.label;
      if (!label) return;
      clearTimers();
      // Most announcements are a short tool name and fit the default width
      // fine. A longer, sentence-style hint can opt into a narrower box so
      // it wraps into a tight, balanced block hugging the left edge instead
      // of stretching a single line toward the middle of the screen.
      setSelection({ label, widthRem: event.detail?.widthRem, mode: event.detail?.mode });
      setShowDescription(false);
      setVisible(false);
      timers.current = [setTimeout(() => setVisible(true), 20)];
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
    // The paint label shows just below this one; fold the description away so
    // the two never overlap.
    const collapse = () => setShowDescription(false);
    window.addEventListener('axis-tool-selected', announce);
    window.addEventListener('axis-tool-closed', close);
    window.addEventListener('axis-paint-label', collapse);
    return () => {
      window.removeEventListener('axis-tool-selected', announce);
      window.removeEventListener('axis-tool-closed', close);
      window.removeEventListener('axis-paint-label', collapse);
      clearTimers();
    };
  }, []);

  // The label only stays while a tool is actually active. A one-shot tool
  // (extrude, delete, …) shows its name briefly, then slides away.
  useEffect(() => {
    if (!selection || toolActive) return;
    const hide = setTimeout(() => {
      setVisible(false);
      timers.current = [setTimeout(() => setSelection(null), SLIDE_MS)];
    }, showDescription ? 5000 : 3000);
    return () => clearTimeout(hide);
  }, [selection, toolActive, showDescription]);

  if (!selection || suppressed) return null;
  const label = selection.label.replace(/\n/g, ' ');
  return (
    <div
      className="absolute top-[calc(max(env(safe-area-inset-top,0px),1.75rem)+7rem)] left-0 z-50 font-mono font-semibold"
      style={{
        color: uiColor,
        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        transform: visible ? 'translateX(0)' : 'translateX(-105%)',
        transition: `transform ${SLIDE_MS}ms ease`,
        maxWidth: `${selection.widthRem || 16}rem`,
      }}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 px-2 py-1.5 text-left text-[1.375rem] leading-tight pointer-events-auto touch-none"
        aria-label={`Show ${label} description`}
        onClick={() => setShowDescription(true)}
      >
        <span style={{ textWrap: 'balance' }}>{label}</span>
      </button>
      {showDescription && (
        <p className="px-2 pb-1 text-[12px] leading-snug font-medium">
          {getToolDescription(label, selection.mode)}
        </p>
      )}
    </div>
  );
}