import { Check, ChevronLeft, X } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const TABS = [
  { id: 'paint', label: 'Paint' },
  { id: 'material', label: 'Material' },
  { id: 'texture', label: 'Texture' },
];

// Sheet header: a back chevron, the title (the Material tab reads
// "Environment"), the Paint · Material · Texture pills, then X / Check.
// Check APPLIES and leaves the sheet open on every tab. X is the only control
// that closes it, and it cancels anything Check has not committed yet. The
// chevron also leaves, returning to the general tool bar it was opened from.
export default function SurfaceSheetHeader({ tab, onTab, onApply, onClose, onBack }) {
  const { uiColor, highlightColor } = useTheme();
  const title = tab === 'material' ? 'Environment' : TABS.find((t) => t.id === tab)?.label;
  const actionBtn = 'modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95';
  return (
    <div className="px-2 pt-1.5 pb-1">
      <div
        className="relative flex items-center gap-1 rounded-xl px-1.5 py-1"
        style={{ background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
      >
        {/* Back and title share one fixed block so the pills stay centred. The
            title drops to 13px and truncates to make room for the chevron
            without pushing into the pills on a narrow phone. */}
        <div className="w-24 shrink-0 flex items-center gap-0.5 min-w-0">
          <button
            onClick={onBack}
            aria-label="Back to tools"
            className="flex h-8 w-6 shrink-0 items-center justify-center rounded-lg active:scale-95"
            style={{ color: uiColor }}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <h2 className="flex-1 min-w-0 truncate text-[13px] leading-none font-bold" style={{ color: uiColor }}>{title}</h2>
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex items-center p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => onTab(t.id)}
                  aria-pressed={active}
                  className="h-6 px-1.5 rounded-md text-[13px] font-medium whitespace-nowrap active:scale-95 transition-transform"
                  style={{
                    color: active ? highlightColor : 'rgba(255,255,255,0.7)',
                    background: 'transparent',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="w-[4.5rem] shrink-0 flex items-center justify-end gap-1.5">
          <button onClick={onClose} aria-label="Cancel and close" className={actionBtn} style={{ color: uiColor }}>
            <X className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <button onClick={onApply} aria-label="Apply" className={actionBtn} style={{ color: highlightColor, borderColor: highlightColor }}>
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
