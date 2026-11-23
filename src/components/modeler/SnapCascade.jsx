import { useRef } from 'react';
import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import { ApplyButton, NumericEditor, PillSwitch } from './CascadeControls';
import MenuSubPanel, { MenuSubRow } from './MenuSubPanel';

// Menu > Settings > Snapping, built like the Grid panel: the on/off switch and
// the checkmark in the header, Snap distance and Snap angle always shown
// below. The checkmark applies what is typed and steps back.
export default function SnapCascade({ onBack = undefined, onApply = undefined }) {
  const t = useTheme();
  const drafts = useRef({ distance: '', angle: '' });
  const apply = () => {
    const read = (key) => {
      const value = Number(drafts.current[key]);
      return Number.isFinite(value) && value >= 0 ? value : null;
    };
    const distance = read('distance'), angle = read('angle');
    const patch = {};
    if (distance !== null) patch.snapDistance = fromDisplayUnit(distance, t.unit);
    if (angle !== null) patch.snapAngle = angle;
    if (Object.keys(patch).length) theme.set(patch);
    onApply?.();
  };
  return (
    <MenuSubPanel
      title="Snapping"
      onBack={onBack}
      actions={(
        <>
          <PillSwitch on={t.snapToGrid} onChange={(v) => theme.set({ snapToGrid: v })} label={`Turn snap ${t.snapToGrid ? 'off' : 'on'}`} color={t.uiColor} highlight={t.highlightColor} />
          <ApplyButton onClick={apply} label="Apply snapping" highlight={t.highlightColor} />
        </>
      )}
    >
      <MenuSubRow label="Snap distance">
        <NumericEditor
          value={toDisplayUnit(t.snapDistance, t.unit)}
          unit={t.unit}
          min={0}
          onCommit={(v) => theme.set({ snapDistance: fromDisplayUnit(v, t.unit) })}
          onDraft={(v) => { drafts.current.distance = v; }}
        />
      </MenuSubRow>
      <MenuSubRow label="Snap angle">
        <NumericEditor
          value={t.snapAngle}
          unit="°"
          min={0}
          onCommit={(v) => theme.set({ snapAngle: v })}
          onDraft={(v) => { drafts.current.angle = v; }}
        />
      </MenuSubRow>
    </MenuSubPanel>
  );
}
