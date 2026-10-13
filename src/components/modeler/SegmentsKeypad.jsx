import { Delete } from 'lucide-react';
import { useTheme } from '@/lib/theme';

export default function SegmentsKeypad({ onKey, decimal = false, signed = false }) {
  const { uiColor } = useTheme();
  // Consistent numeric layout in every editor. The decimal key is always
  // present; integer-only fields may ignore it or round at commit.
  const lastRow = [signed ? '+/−' : null, '.', '0', 'Backspace'].filter(Boolean);
  if (lastRow.length === 2) lastRow.unshift('');
  const lastSpan = lastRow.length === 4 ? 'col-span-3' : 'col-span-4';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ...lastRow];
  return (
    <div role="group" aria-label={decimal ? 'Decimal numeric keypad' : 'Numeric keypad'} className="grid w-full grid-cols-12 gap-1.5 border-t p-2 touch-none"
      style={{ color: uiColor, borderColor: 'rgb(var(--modeling-border) / 0.16)' }}
      onPointerDown={(event) => event.stopPropagation()}>
      {keys.map((label, index) => label ? (
        <button key={`${label}-${index}`} type="button" aria-label={label}
          onClick={() => onKey(label)}
          className={`${index < 9 ? 'col-span-4' : lastSpan} flex h-11 items-center justify-center rounded-lg border text-[17px] font-semibold active:opacity-60 touch-none`}
          style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
          {label === 'Backspace' ? <Delete className="h-5 w-5" /> : label}
        </button>
      ) : <span key={`blank-${index}`} className={lastSpan} />)}
    </div>
  );
}