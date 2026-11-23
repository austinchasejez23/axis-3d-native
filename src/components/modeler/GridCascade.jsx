import { useRef } from 'react';
import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import { ApplyButton, NumericEditor, PillSwitch } from './CascadeControls';
import MenuSubPanel, { MenuSubRow } from './MenuSubPanel';

// Grid panel, opened beside the Grid row in Menu > Viewport and built like
// the Menu's screens. The header holds the on/off switch and the checkmark,
// which applies the typed Grid size and Grid step and closes the panel.
export default function GridCascade({ enabled, onToggle, onApply = undefined, onBack = undefined }) {
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
    <MenuSubPanel
      title="Grid"
      onBack={onBack}
      actions={(
        <>
          <PillSwitch on={enabled} onChange={onToggle} label={`Turn grid ${enabled ? 'off' : 'on'}`} color={t.uiColor} highlight={t.highlightColor} />
          <ApplyButton onClick={apply} label="Apply grid" highlight={t.highlightColor} />
        </>
      )}
    >
      <MenuSubRow label="Grid size">
        <NumericEditor
          value={toDisplayUnit(t.gridSize, t.unit)}
          unit={t.unit}
          min={0.001}
          onCommit={(value) => theme.set({ gridSize: fromDisplayUnit(value, t.unit) })}
          onDraft={(value) => { drafts.current.size = value; }}
        />
      </MenuSubRow>
      <MenuSubRow label="Grid step">
        <NumericEditor
          value={toDisplayUnit(t.gridSquareSize, t.unit)}
          unit={t.unit}
          min={0.001}
          onCommit={(value) => theme.set({ gridSquareSize: fromDisplayUnit(value, t.unit) })}
          onDraft={(value) => { drafts.current.step = value; }}
        />
      </MenuSubRow>
    </MenuSubPanel>
  );
}
