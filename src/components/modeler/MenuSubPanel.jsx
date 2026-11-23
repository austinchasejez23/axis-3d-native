import { useTheme } from '@/lib/theme';
import MenuScreenHeader from './MenuScreenHeader';

// A panel built like the Menu's own screens: the title in the highlight color
// on a header line (with the panel's controls at its right), and the content
// on the lighter card inside, one row per setting.
export default function MenuSubPanel({ title, onBack = undefined, actions = null, children }) {
  const t = useTheme();
  return (
    <div className="pointer-events-auto">
      <MenuScreenHeader
        title={title}
        onBack={onBack}
        color={t.uiColor}
        highlightColor={t.highlightColor}
        borderColor="rgba(255,255,255,0.10)"
        actions={actions}
      />
      <div className="modeling-value m-1.5 rounded-lg px-2.5 py-1">
        <div className="divide-y divide-white/10">{children}</div>
      </div>
    </div>
  );
}

// One setting: its name on the left, its control on the right, like the
// Settings rows.
export function MenuSubRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-white text-[12px] font-medium whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}
