import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTheme } from '@/lib/theme';

// Expands (up) or collapses (down) the hidden tools. It sits in a free spot of
// the tool grid (see chevronCell in toolLayout.js), centred in that spot, on a
// small background like the Help button's, a couple of pixels narrower.
export default function ToolChevronButton({ expanded, onToggle }) {
  const { uiColor, toolLabelsEnabled } = useTheme();
  const Chevron = expanded ? ChevronDown : ChevronUp;
  return (
    <div data-tool-chevron className={`w-full flex items-center justify-center pointer-events-none ${toolLabelsEnabled ? 'h-14' : 'h-11'}`}>
      <button
        type="button"
        aria-label={expanded ? 'Collapse hidden tools' : 'Expand hidden tools'}
        aria-pressed={expanded}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="pointer-events-auto w-[54px] h-9 flex items-center justify-center rounded-xl active:scale-95 transition-transform"
        style={{ color: uiColor, background: 'rgba(9,13,22,0.38)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <Chevron width={30} height={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
