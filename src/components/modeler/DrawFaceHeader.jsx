import { Check, Grid3x3, X } from 'lucide-react';
import { DrawFaceIcon } from '@/lib/toolIcons';
import { useTheme } from '@/lib/theme';

// Same header as the other tool panels, with the Grid toggle in the row's flow
// (between the title and the X / Check pair) so it can never cover the title.
export default function DrawFaceHeader({ grid, onGrid, onCancel, onApply }) {
  const { uiColor, highlightColor } = useTheme();
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
        <DrawFaceIcon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <h2 className="whitespace-nowrap text-[16px] font-bold tracking-tight leading-none">Draw Face</h2>
      </div>
      <button type="button" aria-label="Draw face grid" aria-pressed={grid} onClick={onGrid}
        className="modeling-value flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg px-3 text-[14px] font-semibold active:scale-95"
        style={{ color: grid ? highlightColor : uiColor, borderColor: grid ? highlightColor : undefined }}><Grid3x3 className="h-4 w-4" /><span className="relative -top-px">Grid</span></button>
      <div className="ml-2 flex shrink-0 items-center gap-3">
        <button type="button" onClick={onCancel} aria-label="Cancel draw face" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
        <button type="button" onClick={onApply} aria-label="Apply draw face" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
      </div>
    </div>
  );
}
