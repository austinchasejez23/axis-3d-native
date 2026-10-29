import { EyeOff, Eye } from 'lucide-react';
import MovableToolChevron from '@/components/modeler/MovableToolChevron';
import { useTheme } from '@/lib/theme';

// Right-aligned strip above the tool grid: Hide and Show both appear as soon as
// one or more tools are selected; the chevron appears once anything is hidden
// and expands (up) or collapses (down) the hidden tools.
export default function ToolGridActions({ mode, showHide, onHide, onShow, showChevron, expanded, onToggleExpanded }) {
  const { uiColor, toolLabelsEnabled } = useTheme();
  if (!showHide && !showChevron) return null;
  const pill = 'pointer-events-auto h-6 px-3 flex items-center gap-1.5 rounded-lg active:scale-95 transition-transform text-[12px] font-bold';
  const pillStyle = { color: uiColor, background: 'rgba(0,0,0,0.0)', border: '1px solid rgba(255,255,255,0.45)' };
  return (
    <div className={`absolute right-1 z-20 flex justify-end items-center gap-1 pointer-events-none ${toolLabelsEnabled ? 'bottom-[7.25rem]' : 'bottom-[5.75rem]'}`}>
      {showHide && (
        <>
          <button onClick={onShow} className={pill} style={pillStyle}>
            <Eye className="w-5 h-5" strokeWidth={2} />
            Show
          </button>
          <button onClick={onHide} className={pill} style={pillStyle}>
            <EyeOff className="w-5 h-5" strokeWidth={2} />
            Hide
          </button>
        </>
      )}
      {showChevron && <MovableToolChevron mode={mode} expanded={expanded} onToggle={onToggleExpanded} />}
    </div>
  );
}
