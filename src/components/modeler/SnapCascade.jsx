import { useState } from 'react';
import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import { NumericEditor, PillSwitch } from './CascadeControls';

export default function SnapCascade() {
  const t = useTheme();
  const [sub, setSub] = useState(null);
  const rowColor = (id) => (sub === id ? t.highlightColor : t.uiColor);
  return (
    <div className="w-fit p-1 pointer-events-auto">
      <div className="flex items-center justify-between gap-2 h-9 px-2">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: t.uiColor }}>Snap</span>
        <PillSwitch on={t.snapToGrid} onChange={(v) => theme.set({ snapToGrid: v })} label={`Turn snap ${t.snapToGrid ? 'off' : 'on'}`} color={t.uiColor} highlight={t.highlightColor} />
      </div>
      <button onClick={() => setSub(sub === 'distance' ? null : 'distance')} className="w-full h-9 flex items-center px-2 active:scale-95 transition-transform">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: rowColor('distance') }}>Snap distance</span>
      </button>
      {sub === 'distance' && (
        <div className="px-2 pb-2">
          <NumericEditor value={toDisplayUnit(t.snapDistance, t.unit)} unit={t.unit} min={0} onCommit={(v) => theme.set({ snapDistance: fromDisplayUnit(v, t.unit) })} />
        </div>
      )}
      <button onClick={() => setSub(sub === 'angle' ? null : 'angle')} className="w-full h-9 flex items-center px-2 active:scale-95 transition-transform">
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: rowColor('angle') }}>Snap angle</span>
      </button>
      {sub === 'angle' && (
        <div className="px-2 pb-2">
          <NumericEditor value={t.snapAngle} unit="°" min={0} onCommit={(v) => theme.set({ snapAngle: v })} />
        </div>
      )}
    </div>
  );
}