import { useState } from 'react';
import { Gauge, Boxes, Zap } from 'lucide-react';
import { useTheme, theme } from '@/lib/theme';
import ColorPicker from './ColorPicker';
import { setRenderBoostManual } from '@/lib/renderBoost';

// Color setting row: tapping the swatch opens the in-app color picker inline
// (live preview as you drag). The default swatch restores the default color.
export function ColorRow({ label, value, onChange, defaultColor }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-white text-[12px] font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-white/50 text-[10px] font-mono uppercase">{value}</span>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={`Pick ${label.toLowerCase()} color`}
            className="w-7 h-7 rounded-lg border border-white/20 active:scale-95 transition-transform"
            style={{ backgroundColor: value }}
          />
        </div>
      </div>
      {open && (
        <div className="mt-1.5">
          <ColorPicker color={value} onChange={onChange} />
          {defaultColor && (
            <button
              onClick={() => onChange(defaultColor)}
              aria-label={`Default ${label.toLowerCase()} color`}
              className="mt-1.5 w-full h-7 rounded-lg border border-white/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span className="w-4 h-4 rounded border border-white/30" style={{ backgroundColor: defaultColor }} />
              <span className="text-white/80 text-[12px] font-medium">Default</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ToggleSliderRow({ label, enabled, intensity, onToggle, onIntensity, highlightColor }) {
  return (
    <div className="py-0.5">
      <LabelToggleRow label={label} enabled={enabled} onToggle={onToggle} highlightColor={highlightColor} />
      {enabled && (
        <div className="flex items-center gap-2 mt-0.5">
          <input type="range" min={0} max={1} step={0.05} value={intensity} onChange={(e) => onIntensity(parseFloat(e.target.value))} className="flex-1" style={{ accentColor: highlightColor }} />
          <span className="text-white/50 text-[10px] w-6 text-right tabular-nums">{Math.round(intensity * 100)}%</span>
        </div>
      )}
    </div>
  );
}

// Label-as-toggle: no separate switch — the label itself highlights in the
// accent color when the setting is on.
export function LabelToggleRow({ label, icon: Icon, enabled, onToggle, highlightColor, uiColor = '#ffffff' }) {
  const color = enabled ? highlightColor : uiColor;
  return (
    <button
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      className="w-full flex min-h-11 items-center gap-3 py-2.5 active:scale-95 transition-transform"
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} style={{ color }} />}
      <span className="text-[13px] font-semibold" style={{ color }}>{label}</span>
    </button>
  );
}

export function ToggleRow({ label, enabled, onToggle, highlightColor }) {
  return (
    <LabelToggleRow label={label} enabled={enabled} onToggle={onToggle} highlightColor={highlightColor} />
  );
}

function UnitRow({ unit, onChange, highlightColor, uiColor }) {
  const opts = [{ id: 'mm', label: 'mm' }, { id: 'in', label: 'in' }];
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-white text-[12px] font-medium">Units</span>
      <div className="flex gap-1">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="px-2 h-7 rounded-md text-[11px] font-semibold border active:scale-95"
            style={{
              color: unit === o.id ? highlightColor : uiColor,
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.2)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPanel({ onGestures, onSnapping }) {
  const t = useTheme();
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-white/60 text-[10px] font-semibold uppercase">Project</span>
      </div>
      <div className="divide-y divide-white/10">
        <UnitRow unit={t.unit} onChange={(v) => theme.set({ unit: v })} highlightColor={t.highlightColor} uiColor={t.uiColor} />
      </div>
      <div className="flex items-center gap-2 mt-2 mb-0.5">
        <span className="text-white/60 text-[10px] font-semibold uppercase">Performance</span>
      </div>
      <div className="divide-y divide-white/10">
        <LabelToggleRow label="Edit boost" icon={Zap} enabled={t.hideDetailWhileEditing} onToggle={(v) => theme.set({ hideDetailWhileEditing: v })} highlightColor={t.highlightColor} uiColor={t.uiColor} />
        <LabelToggleRow label="Render boost" icon={Gauge} enabled={t.renderBoostEnabled} onToggle={setRenderBoostManual} highlightColor={t.highlightColor} uiColor={t.uiColor} />
        <LabelToggleRow label="Focus render boost" icon={Boxes} enabled={t.focusRenderBoostEnabled} onToggle={(v) => theme.set({ focusRenderBoostEnabled: v })} highlightColor={t.highlightColor} uiColor={t.uiColor} />
      </div>
      {(onGestures || onSnapping) && (
        <>
          <div className="flex items-center gap-2 mt-2 mb-0.5">
            <span className="text-white/60 text-[10px] font-semibold uppercase">Input</span>
          </div>
          <div className="divide-y divide-white/10">
            {onGestures && (
              <button onClick={onGestures} className="w-full flex items-center justify-between py-1.5 active:scale-95 transition-transform">
                <span className="text-[12px] font-medium" style={{ color: t.uiColor }}>Gestures</span>
                <span className="text-[12px]" style={{ color: t.uiColor, opacity: 0.6 }}>›</span>
              </button>
            )}
            {onSnapping && (
              <button onClick={onSnapping} className="w-full flex items-center justify-between py-1.5 active:scale-95 transition-transform">
                <span className="text-[12px] font-medium" style={{ color: t.snapToGrid ? t.highlightColor : t.uiColor }}>Snapping</span>
                <span className="text-[12px]" style={{ color: t.uiColor, opacity: 0.6 }}>›</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}