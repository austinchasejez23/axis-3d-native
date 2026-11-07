import { Axis3d, Check, Undo2, X } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import ModelingPanel from '@/components/modeler/ModelingPanel';
import { blockedButton } from '@/lib/unavailable';

// Opened by double-tapping Orientation reset. Undo brings back the
// orientation the last reset removed from the selected geometry, keeping
// every edit made since.
export default function OrientationPanel({ canUndo, onUndo, onCancel, onApply }) {
  const { uiColor, highlightColor } = useTheme();
  const actionBtn = 'modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95';
  return (
    <ModelingPanel label="Orientation controls">
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Axis3d className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Orientation</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label="Cancel orientation changes" className={actionBtn} style={{ color: uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={onApply} aria-label="Apply orientation" className={actionBtn} style={{ color: highlightColor, borderColor: highlightColor }}>
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="modeling-value flex items-center gap-2 rounded-lg px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: uiColor }}>Undo orientation reset</span>
          <button type="button" {...blockedButton(!canUndo, 'No orientation reset to undo', onUndo)} aria-label="Undo orientation reset"
            className="modeling-value flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold active:scale-95 aria-disabled:opacity-35"
            style={{ color: highlightColor, borderColor: highlightColor }}>
            <Undo2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            Undo
          </button>
        </div>
      </div>
    </ModelingPanel>
  );
}
