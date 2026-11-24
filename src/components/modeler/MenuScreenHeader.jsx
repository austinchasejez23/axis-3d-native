import { ChevronLeft } from 'lucide-react';

// Header for a nested menu screen or a side panel opened from a menu row: a
// back chevron that steps back exactly one drawer (when there is one to step
// back to), the title, and the panel's own controls on the right.
export default function MenuScreenHeader({ title, icon: Icon = null, onBack = undefined, color, highlightColor, borderColor, actions = null }) {
  return (
    <div className={`flex items-center gap-1.5 h-10 ${onBack ? 'pl-1' : 'pl-3'} ${actions ? 'pr-1.5' : 'pr-2.5'} border-b`} style={{ borderColor }}>
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
          style={{ color }}
        >
          <ChevronLeft className="w-[19px] h-[19px]" strokeWidth={2.2} />
        </button>
      )}
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} style={{ color: highlightColor }} />}
      <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: highlightColor }}>{title}</span>
      {actions && <div className="ml-auto pl-3 flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
