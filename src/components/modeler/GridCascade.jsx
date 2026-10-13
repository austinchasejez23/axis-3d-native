import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import { NumericEditor, PillSwitch } from './CascadeControls';

// Always show both grid values. The parent menu anchors this panel directly
// beside the Grid row, rather than at the top of the Viewport menu.
export default function GridCascade({ enabled, onToggle, panelStyle, bare = false }) {
  const t = useTheme();

  return (
    <div className="w-full pointer-events-auto">
      <div
        className={`w-full px-2.5 py-1.5 ${bare ? '' : 'rounded-lg border'}`}
        style={bare ? undefined : panelStyle}
      >
        <div className="flex min-h-10 items-center justify-between gap-2 border-b border-white/10">
          <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Grid</span>
          <PillSwitch
            on={enabled}
            onChange={onToggle}
            label={`Turn grid ${enabled ? 'off' : 'on'}`}
            color={t.uiColor}
            highlight={t.highlightColor}
          />
        </div>
        <div className="py-1.5 border-b border-white/10">
          <div className="mb-1 text-[13px] font-semibold" style={{ color: t.uiColor }}>Grid size</div>
          <NumericEditor
            value={toDisplayUnit(t.gridSize, t.unit)}
            unit={t.unit}
            min={0.001}
            onCommit={(value) => theme.set({ gridSize: fromDisplayUnit(value, t.unit) })}
          />
        </div>
        <div className="pt-1.5 pb-0.5">
          <div className="mb-1 text-[13px] font-semibold" style={{ color: t.uiColor }}>Grid step</div>
          <NumericEditor
            value={toDisplayUnit(t.gridSquareSize, t.unit)}
            unit={t.unit}
            min={0.001}
            onCommit={(value) => theme.set({ gridSquareSize: fromDisplayUnit(value, t.unit) })}
          />
        </div>
      </div>
    </div>
  );
}
