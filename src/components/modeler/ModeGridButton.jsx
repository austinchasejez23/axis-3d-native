import { Wrench } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { ModeIcon } from './BottomToolbar';

// The open mode's own bottom-bar button, kept in its column of the tool grid's
// bottom row while that mode's tools are open, so it can be tapped again to
// close them. Looks like it does in the bottom bar; the grid paints the same
// background behind it as behind the tools.
export default function ModeGridButton({ mode, onPress }) {
  const { highlightColor, toolLabelsEnabled } = useTheme();
  const isTools = mode === 'general';
  const label = isTools ? 'Tools' : `${mode[0].toUpperCase()}${mode.slice(1)}`;
  return (
    <button
      type="button"
      onClick={() => {
        if (!isTools) window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label, mode } }));
        onPress?.();
      }}
      aria-label={isTools ? 'Tools' : `${label} mode`}
      aria-pressed="true"
      style={{ color: highlightColor, textShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
      className={`w-full min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors touch-manipulation ${toolLabelsEnabled ? 'h-14' : 'h-11'}`}
    >
      {isTools ? <Wrench className="w-[25px] h-[25px]" strokeWidth={2.5} /> : <ModeIcon mode={mode} color={highlightColor} />}
      {isTools && toolLabelsEnabled && <span className="text-xs font-semibold">Tools</span>}
    </button>
  );
}
