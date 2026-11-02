import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import { NumericEditor, PillSwitch } from './CascadeControls';

// Always show both grid values. The parent menu anchors this panel directly
// beside the Grid row, rather than at the top of the Viewport menu.
// Sized like the Snap panel beside it: p-1 around 36px rows with px-2.
export default function GridCascade({ enabled, onToggle, bare = false, panelStyle = undefined }) {
  const t = useTheme();

  return (
    <div className="w-fit p-1 pointer-events-auto">
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid</span>
        <PillSwitch
          on={enabled}
          onChange={onToggle}
          label={`Turn grid ${enabled ? 'off' : 'on'}`}
          color={t.uiColor}
          highlight={t.highlightColor}
        />
      </div>
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid size</span>
        <NumericEditor
          value={toDisplayUnit(t.gridSize, t.unit)}
          unit={t.unit}
          min={0.001}
          onCommit={(value) => theme.set({ gridSize: fromDisplayUnit(value, t.unit) })}
        />
      </div>
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid step</span>
        <NumericEditor
          value={toDisplayUnit(t.gridSquareSize, t.unit)}
          unit={t.unit}
          min={0.001}
          onCommit={(value) => theme.set({ gridSquareSize: fromDisplayUnit(value, t.unit) })}
        />
      </div>
    </div>
  );
}
