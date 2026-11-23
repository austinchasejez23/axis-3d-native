import { useTheme, theme } from '@/lib/theme';
import { ChoiceButton, PillSwitch } from './CascadeControls';
import MenuSubPanel from './MenuSubPanel';

// Transform gizmo panel, opened beside its row in Menu > Viewport and built
// like the Menu's screens: the on/off switch in the header, World and Local
// below it.
export default function TransformGizmoCascade() {
  const t = useTheme();
  return (
    <MenuSubPanel
      title="Transform gizmo"
      actions={(
        <PillSwitch
          on={t.objectArrowsEnabled}
          onChange={(enabled) => theme.set({ objectArrowsEnabled: enabled })}
          label={`Turn transform gizmo ${t.objectArrowsEnabled ? 'off' : 'on'}`}
          color={t.uiColor}
          highlight={t.highlightColor}
        />
      )}
    >
      <div className="flex items-center gap-1.5 py-1.5">
        <ChoiceButton on={t.gizmoSpace === 'world'} onClick={() => theme.set({ gizmoSpace: 'world' })} label="World" color={t.uiColor} highlight={t.highlightColor} />
        <ChoiceButton on={t.gizmoSpace === 'local'} onClick={() => theme.set({ gizmoSpace: 'local' })} label="Local" color={t.uiColor} highlight={t.highlightColor} />
      </div>
    </MenuSubPanel>
  );
}
