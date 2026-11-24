import { useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { useTheme, theme } from '@/lib/theme';
import { playClick } from '@/lib/clickSound';
import { ApplyButton, CancelButton, PillSwitch } from './CascadeControls';
import MenuSubPanel, { MenuSubRow } from './MenuSubPanel';

// Menu > Settings > Sound: the button click sound. Changes are heard right
// away; the checkmark keeps them and the X puts back what was set before.
export default function SoundCascade({ onClose }) {
  const t = useTheme();
  const opened = useRef({ soundEnabled: t.soundEnabled, soundVolume: t.soundVolume });
  const cancel = () => { theme.set(opened.current); onClose(); };
  return (
    <MenuSubPanel
      title="Sound"
      icon={Volume2}
      actions={(
        <>
          <ApplyButton onClick={onClose} label="Apply sound" highlight={t.highlightColor} />
          <CancelButton onClick={cancel} label="Cancel sound" color={t.uiColor} />
        </>
      )}
    >
      <MenuSubRow label="Click sound">
        <PillSwitch on={t.soundEnabled} onChange={(v) => theme.set({ soundEnabled: v })} label={`Turn click sound ${t.soundEnabled ? 'off' : 'on'}`} color={t.uiColor} highlight={t.highlightColor} />
      </MenuSubRow>
      <MenuSubRow label="Volume">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={t.soundVolume}
            disabled={!t.soundEnabled}
            aria-label="Click volume"
            onChange={(e) => theme.set({ soundVolume: parseFloat(e.target.value) })}
            onPointerUp={(e) => { if (t.soundEnabled) playClick(parseFloat(e.currentTarget.value)); }}
            className="w-28 disabled:opacity-40"
            style={{ accentColor: t.highlightColor }}
          />
          <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-white/60">{Math.round(t.soundVolume * 100)}%</span>
        </div>
      </MenuSubRow>
    </MenuSubPanel>
  );
}
