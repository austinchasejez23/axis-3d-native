import { EyeOff, Eye } from 'lucide-react';
import { useTheme } from '@/lib/theme';

// Hide and Show sit centred just above the second row from the bottom (the
// highest row that can be a full row of tools), so they never cover a tool;
// both appear as soon as one or more tools are selected. (The chevron for
// hidden tools sits in the grid itself: ToolChevronButton.)
export default function ToolGridActions({ showHide, onHide, onShow }) {
  const { uiColor, toolLabelsEnabled } = useTheme();
  if (!showHide) return null;
  const pill = 'pointer-events-auto h-6 px-3 flex items-center gap-1.5 rounded-lg active:scale-95 transition-transform text-[12px] font-bold';
  const pillStyle = { color: uiColor, background: 'rgba(0,0,0,0.0)', border: '1px solid rgba(255,255,255,0.45)' };
  return (
    <div data-tool-actions className={`absolute left-0 right-0 z-20 flex justify-center items-center gap-1 pointer-events-none ${toolLabelsEnabled ? 'bottom-[7.25rem]' : 'bottom-[5.75rem]'}`}>
      <button onClick={onShow} className={pill} style={pillStyle}>
        <Eye className="w-5 h-5" strokeWidth={2} />
        Show
      </button>
      <button onClick={onHide} className={pill} style={pillStyle}>
        <EyeOff className="w-5 h-5" strokeWidth={2} />
        Hide
      </button>
    </div>
  );
}
