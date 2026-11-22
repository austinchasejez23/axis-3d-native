import { useTheme, theme } from '@/lib/theme';
import { PillSwitch } from './CascadeControls';

// Beside the Transform gizmo row in Menu > Viewport, laid out like the Grid
// panel: the name with its on/off switch, then World and Local below it.
export default function TransformGizmoCascade() {
  const t = useTheme();
  const option = (id, label) => {
    const on = t.gizmoSpace === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => theme.set({ gizmoSpace: id })}
        aria-pressed={on}
        className="flex-1 h-8 min-w-12 rounded-md border px-2 active:scale-95 transition-transform"
        style={{
          color: on ? t.highlightColor : t.uiColor,
          borderColor: on ? t.highlightColor : 'rgba(255,255,255,0.22)',
          background: on ? `${t.highlightColor}18` : 'rgba(255,255,255,0.05)',
        }}
      >
        <span className="text-[13px] font-semibold">{label}</span>
      </button>
    );
  };

  return (
    <div className="w-fit p-1 pointer-events-auto">
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Transform gizmo</span>
        <PillSwitch
          on={t.objectArrowsEnabled}
          onChange={(enabled) => theme.set({ objectArrowsEnabled: enabled })}
          label={`Turn transform gizmo ${t.objectArrowsEnabled ? 'off' : 'on'}`}
          color={t.uiColor}
          highlight={t.highlightColor}
        />
      </div>
      <div className="flex items-center gap-2 h-9 px-2">
        {option('world', 'World')}
        {option('local', 'Local')}
      </div>
    </div>
  );
}
