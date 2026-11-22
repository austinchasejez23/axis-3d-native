import { useRef } from 'react';
import { Check } from 'lucide-react';
import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import { NumericEditor, PillSwitch } from './CascadeControls';

// Always show both grid values. The parent menu anchors this panel directly
// beside the Grid row, rather than at the top of the Viewport menu.
// Sized like the Snap panel beside it: p-1 around 36px rows with px-2.
// The checkmark applies the typed Grid size and Grid step and closes the
// panel, like the checkmark on the other panels.
export default function GridCascade({ enabled, onToggle, onApply = undefined, bare = false, panelStyle = undefined }) {
  const t = useTheme();
  const drafts = useRef({ size: '', step: '' });
  const apply = () => {
    const read = (key) => {
      const value = Number(drafts.current[key]);
      return Number.isFinite(value) && value >= 0.001 ? fromDisplayUnit(value, t.unit) : null;
    };
    const size = read('size'), step = read('step');
    const patch = {};
    if (size !== null) patch.gridSize = size;
    if (step !== null) patch.gridSquareSize = step;
    if (Object.keys(patch).length) theme.set(patch);
    onApply?.();
  };

  return (
    <div className="w-fit p-1 pointer-events-auto">
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid</span>
        <div className="flex items-center gap-2">
          <PillSwitch
            on={enabled}
            onChange={onToggle}
            label={`Turn grid ${enabled ? 'off' : 'on'}`}
            color={t.uiColor}
            highlight={t.highlightColor}
          />
          <button
            type="button"
            onClick={apply}
            aria-label="Apply grid"
            className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
            style={{ color: t.highlightColor, borderColor: t.highlightColor }}
          >
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid size</span>
        <NumericEditor
          value={toDisplayUnit(t.gridSize, t.unit)}
          unit={t.unit}
          min={0.001}
          onCommit={(value) => theme.set({ gridSize: fromDisplayUnit(value, t.unit) })}
          onDraft={(value) => { drafts.current.size = value; }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid step</span>
        <NumericEditor
          value={toDisplayUnit(t.gridSquareSize, t.unit)}
          unit={t.unit}
          min={0.001}
          onCommit={(value) => theme.set({ gridSquareSize: fromDisplayUnit(value, t.unit) })}
          onDraft={(value) => { drafts.current.step = value; }}
        />
      </div>
    </div>
  );
}
