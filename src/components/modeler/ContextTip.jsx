import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { pickTip } from '@/lib/contextTips';

const HOLD_MS = 7000;
const FADE_MS = 600;

// Tiny floating hint that lives in its own strip above the HUD. No background,
// no border, no close button — just words, always relevant to what is currently
// being done, and never overlapping anything.
export default function ContextTip({ context }) {
  const { uiColor } = useTheme();
  const [turn, setTurn] = useState(0);
  const [shown, setShown] = useState(false);

  // A new context starts its own run of tips immediately.
  useEffect(() => { setTurn(0); }, [context]);

  useEffect(() => {
    const timers = [
      setTimeout(() => setShown(true), 80),
      setTimeout(() => setShown(false), HOLD_MS),
      setTimeout(() => setTurn((t) => t + 1), HOLD_MS + FADE_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [turn, context]);

  const tip = pickTip();

  return (
    <div className="flex min-h-[1.75rem] items-center justify-center px-2 py-0.5 pointer-events-none text-center">
      <div
        className="mx-auto font-mono leading-tight whitespace-normal line-clamp-2"
        // Two short lines.
        style={{
          fontSize: '10px',
          maxWidth: '10.5rem',
          color: uiColor,
          opacity: shown ? 0.9 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        }}
      >
        {tip.split('{icon}').map((part, i, parts) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && <Info className="inline-block align-text-bottom" style={{ width: 12, height: 12 }} strokeWidth={2} />}
          </span>
        ))}
      </div>
    </div>
  );
}