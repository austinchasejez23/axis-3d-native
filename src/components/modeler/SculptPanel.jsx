import { Check, Hand, X } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import SculptAxisButtons from './SculptAxisButtons';
import SculptToolButtons from './SculptToolButtons';
import SculptSliderRow from './SculptSliderRow';

export default function SculptPanel({
  tool, size, intensity, activeAxes,
  onTool, onSize, onIntensity, onAxesChange,
  onCancel, onApply, onTuningChange,
}) {
  const { uiColor, highlightColor } = useTheme();
  const actionClass = 'modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95';

  return (
    <div
      className="absolute left-0 right-0 bottom-[3.75rem] z-50 safe-bottom pointer-events-auto px-1.5"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div data-sculpt-panel className="modeling-panel modeling-sheet rounded-2xl">
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
          <div className="flex w-[4.75rem] shrink-0 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Hand className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Sculpt</h2>
          </div>
          <div className="flex-1 flex justify-center min-w-0">
            <SculptAxisButtons activeAxes={activeAxes} onChange={onAxesChange} />
          </div>
          <div className="flex w-[4.75rem] shrink-0 items-center justify-end gap-3">
            <button type="button" onClick={onCancel} aria-label="Cancel sculpt" className={actionClass} style={{ color: uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={onApply} aria-label="Apply sculpt" className={actionClass} style={{ color: highlightColor, borderColor: highlightColor }}>
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="px-2 h-[8.25rem] flex flex-col gap-1 pb-1.5">
          <SculptToolButtons tool={tool} onTool={onTool} />
          <div className="flex-1 min-h-0 flex flex-col">
            <SculptSliderRow
              label="Size" value={size} display={size.toFixed(2)}
              min={0.05} max={2} step={0.01} onChange={onSize}
              onActiveChange={onTuningChange}
            />
            <SculptSliderRow
              label="Intensity" value={intensity} display={`${Math.round(intensity * 100)}%`}
              min={0} max={1} step={0.01} onChange={onIntensity}
            />
          </div>
        </div>
      </div>
    </div>
  );
}