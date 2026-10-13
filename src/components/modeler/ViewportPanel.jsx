import { useTheme, theme } from '@/lib/theme';
import { Axis3D, Box, Grid3X3, Palette, Ruler, Tags } from 'lucide-react';

// Match the main menu's exact row dimensions, icon size, text size and spacing.
function ViewportRow({ label, icon: Icon, onClick, color, pressed }) {
  return (
    <button
      type="button"
      onClick={(event) => onClick?.(event)}
      aria-pressed={pressed}
      className="w-full h-12 flex items-center gap-3 pl-3 pr-3 text-left active:scale-95 transition-transform touch-none"
      style={{ color }}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={1.8} />
      <span className="text-[14px] font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}

export default function ViewportPanel({ gridEnabled, dimensionsEnabled, onGrid, onToggleDimensions, onColors }) {
  const t = useTheme();
  const toggle = (label, icon, enabled, onChange) => (
    <ViewportRow
      key={label}
      label={label}
      icon={icon}
      pressed={enabled}
      onClick={() => onChange(!enabled)}
      color={enabled ? t.highlightColor : t.uiColor}
    />
  );

  const divider = () => <div className="h-px mx-2" style={{ background: 'rgba(255,255,255,0.10)' }} />;

  return (
    <div>
      <ViewportRow label="Grid" icon={Grid3X3} color={gridEnabled ? t.highlightColor : t.uiColor} onClick={onGrid} />
      {divider()}
      {toggle('Tool labels', Tags, t.toolLabelsEnabled, (enabled) => theme.set({ toolLabelsEnabled: enabled }))}
      {divider()}
      {toggle('Wireframe', Box, t.wireframeEnabled, (enabled) => theme.set({ wireframeEnabled: enabled }))}
      {divider()}
      {toggle('Object arrows', Axis3D, t.objectArrowsEnabled, (enabled) => theme.set({ objectArrowsEnabled: enabled }))}
      {divider()}
      {toggle('Dimensions', Ruler, dimensionsEnabled, onToggleDimensions)}
      {divider()}
      <ViewportRow label="Colors" icon={Palette} color={t.uiColor} onClick={onColors} />
    </div>
  );
}
