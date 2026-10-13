import { ChevronLeft } from 'lucide-react';

// Header for a nested menu screen: a back chevron that steps back exactly one
// drawer, plus the current screen's title.
export default function MenuScreenHeader({ title, onBack, color, highlightColor, borderColor }) {
  return (
    <div className="flex items-center gap-1.5 h-10 pl-1 pr-2.5 border-b" style={{ borderColor }}>
      <button
        onClick={onBack}
        aria-label="Back"
        className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
        style={{ color }}
      >
        <ChevronLeft className="w-[19px] h-[19px]" strokeWidth={2.2} />
      </button>
      <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: highlightColor }}>{title}</span>
    </div>
  );
}