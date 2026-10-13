import { useState } from 'react';
import { Check, X, Layers, Move3D, CircleDot } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { toDisplayUnit, fromDisplayUnit } from '@/lib/units';
import { toolMemory } from '@/lib/toolMemory';
import { RadialArrayIcon } from '@/lib/toolIcons';
import HorizontalChevronStepper from './HorizontalChevronStepper';
import ModelingPanel from '@/components/modeler/ModelingPanel';

export default function RadialArrayPanel({ onPreview, onApply, onCancel }) {
  const { uiColor, highlightColor, unit } = useTheme();
  const [values, setValues] = useState(() => ({ ...toolMemory.radialArray }));
  const [keypadOpen, setKeypadOpen] = useState(false);
  const update = (change) => {
    const next = { ...values, ...change };
    setValues(next);
    toolMemory.radialArray = next;
    onPreview(next);
  };
  const buttonStyle = (active) => ({ color: active ? highlightColor : uiColor });
  return (
    <ModelingPanel label="Radial array controls" keypadOpen={keypadOpen}>
      <div className="py-1.5">
        <div className="mb-1.5 flex items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5">
            <RadialArrayIcon className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: uiColor }} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none" style={{ color: uiColor }}>Radial Array</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label="Cancel radial array"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button type="button" onClick={() => onApply(values)} aria-label="Apply radial array"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="modeling-value rounded-lg px-2.5 py-1.5">
          <div className="grid grid-cols-2">
            <div className="min-w-0 border-r border-white/15 pr-3">
              <div className="mb-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: uiColor }}><Layers className="h-3.5 w-3.5 shrink-0 opacity-80" />Count</div>
              <HorizontalChevronStepper label="Count" value={values.count} onChange={(count) => update({ count })} step={1} min={2} max={64} color={uiColor} highlightColor={highlightColor} appearance="radial" keypadOpen={keypadOpen} onKeypadOpen={(open = true) => setKeypadOpen(open)} />
            </div>
            <div className="min-w-0 pl-3">
              <div className="mb-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: uiColor }}><CircleDot className="h-3.5 w-3.5 shrink-0 opacity-80" />Radius ({unit})</div>
              <HorizontalChevronStepper label="Radius" value={toDisplayUnit(values.radius ?? 3, unit)} onChange={(radius) => update({ radius: fromDisplayUnit(radius, unit) })} step={toDisplayUnit(0.25, unit)} decimals={unit === 'in' ? 2 : 1} min={0} max={toDisplayUnit(1000, unit)} color={uiColor} highlightColor={highlightColor} appearance="radial" keypadOpen={keypadOpen} onKeypadOpen={(open = true) => setKeypadOpen(open)} />
            </div>
          </div>
          <div className="mt-1.5 flex items-center border-t border-white/10 pt-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex shrink-0 items-center gap-1 text-[12px] font-semibold" style={{ color: uiColor }}><Move3D className="h-3.5 w-3.5 shrink-0 opacity-80" />Axis</div>
              <div className="grid w-[7.5rem] grid-cols-3 gap-1">
                {['x', 'y', 'z'].map((axis) => <button type="button" key={axis} onClick={() => update({ axis })} aria-pressed={values.axis === axis} className="modeling-value h-8 rounded-md text-[14px] font-bold uppercase active:scale-95" style={buttonStyle(values.axis === axis)}>{axis}</button>)}
              </div>
            </div>
            <button type="button" onClick={() => update({ follow: !values.follow })} aria-pressed={values.follow}
              className="modeling-value ml-3 flex h-8 min-w-[4.5rem] shrink-0 items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition-colors active:scale-95"
              style={buttonStyle(values.follow)}>Follow</button>
          </div>
        </div>
      </div>
    </ModelingPanel>
  );
}