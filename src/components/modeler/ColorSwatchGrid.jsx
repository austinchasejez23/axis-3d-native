import { Check } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import LoopingScroller from './LoopingScroller';

// Starter swatches shown until the user saves their own colors.
const DEFAULTS = ['#ffffff', '#2b2b2b', '#e02424', '#2563eb', '#22a55b', '#f0b429', '#f2711c', '#8b2ee0', '#f472b6'];

// Saved colors: one endless, swipeable row of round swatches. Saving the
// current color and removing all paint live in the paint tool row.
export default function ColorSwatchGrid({ color, onChange }) {
  const { savedColors, highlightColor } = useTheme();
  const slots = savedColors.length ? savedColors : DEFAULTS;
  return (
    <LoopingScroller shadows itemClass="pr-1.5" innerClass="items-center py-1">
      {slots.map((saved) => {
        const selected = saved.toLowerCase() === color?.toLowerCase();
        return (
          <button
            key={saved}
            onClick={() => onChange(saved)}
            aria-label={`Color ${saved}`}
            aria-pressed={selected}
            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-95"
            style={{
              background: saved,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.18)',
            }}
          >
            {selected && <Check className="w-[18px] h-[18px]" style={{ color: highlightColor, filter: 'drop-shadow(0 0 1px white) drop-shadow(0 1px 1px black)' }} />}
          </button>
        );
      })}
    </LoopingScroller>
  );
}
