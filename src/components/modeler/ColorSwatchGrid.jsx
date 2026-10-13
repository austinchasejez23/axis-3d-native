import { Plus, Check, Ban } from 'lucide-react';
import { useTheme, theme } from '@/lib/theme';
import LoopingScroller from './LoopingScroller';

// Starter swatches shown until the user saves their own colors.
const DEFAULTS = ['#ffffff', '#2b2b2b', '#e02424', '#2563eb', '#22a55b', '#f0b429', '#f2711c', '#8b2ee0', '#f472b6'];

// Saved colors: one endless, swipeable row of round swatches ending in a "+"
// that stores the current color. When onRemovePaint is given, a "no paint"
// circle leads the row and strips all paint.
export default function ColorSwatchGrid({ color, onChange, onRemovePaint }) {
  const { savedColors, highlightColor } = useTheme();
  const slots = savedColors.length ? savedColors : DEFAULTS;
  const saveColor = () => {
    const base = savedColors.length ? savedColors : DEFAULTS;
    const next = [color, ...base.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 24);
    theme.set({ savedColors: next });
  };
  return (
    <LoopingScroller shadows itemClass="pr-1.5" innerClass="items-center py-1">
      {onRemovePaint && (
        <button
          onClick={onRemovePaint}
          aria-label="Remove all paint"
          className="w-7 h-7 rounded-full flex items-center justify-center text-white active:scale-95"
          style={{ background: 'rgba(255,255,255,0.06)', boxShadow: '0 0 0 1px rgba(255,255,255,0.18)' }}
        >
          <Ban className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      )}
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
      <button onClick={saveColor} aria-label="Save current color" className="w-7 h-7 rounded-full border border-white/45 flex items-center justify-center text-white active:scale-95">
        <Plus className="w-4 h-4" strokeWidth={2.2} />
      </button>
    </LoopingScroller>
  );
}
