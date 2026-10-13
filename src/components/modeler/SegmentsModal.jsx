import { useState, useEffect, useRef } from 'react';
import { Check, X, Grid3x3, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { toDisplayUnit, fromDisplayUnit } from '@/lib/units';
import ModelingNumberPad from '@/components/modeler/ModelingNumberPad';
import NumericValueField from '@/components/modeler/NumericValueField';
import ModelingPanel from '@/components/modeler/ModelingPanel';
import { segmentMinimum } from '@/lib/primitives';

function ParamControl({ label, value, step, min, onChange, color, highlightColor, active, onOpen, onKey, onClose, dividerClass = '' }) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : min;
  const change = (delta) => onChange(Math.max(min, safe + delta));
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center ${dividerClass}`}>
      <span className="mb-1 w-full pl-1 text-left text-[12px] font-semibold" style={{ color }}>{label}</span>
      <div className="flex w-full min-w-0 items-center justify-center gap-0 rounded-md" style={{ background: 'rgb(var(--modeling-sheet) / 0.65)', boxShadow: 'inset 0 0 0 1px rgb(var(--modeling-border) / 0.16)' }}>
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => change(-step)} className="modeling-value flex h-7 w-7 shrink-0 items-center justify-center rounded-md active:scale-75" style={{ color: highlightColor, borderColor: highlightColor }}><ChevronLeft className="h-5 w-5" strokeWidth={2.5} /></button>
        <NumericValueField label={label} value={active?.text ?? safe.toFixed(2)} active={!!active} onOpen={onOpen} onKey={onKey} onClose={onClose} color={color} highlightColor={highlightColor} className="h-7 !rounded-none !bg-transparent !border-0 text-[16px] font-semibold" />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => change(step)} className="modeling-value flex h-7 w-7 shrink-0 items-center justify-center rounded-md active:scale-75" style={{ color: highlightColor, borderColor: highlightColor }}><ChevronRight className="h-5 w-5" strokeWidth={2.5} /></button>
      </div>
    </div>
  );
}

export default function SegmentsModal({ values, onChange, onApply, onCancel }) {
  const { uiColor, highlightColor, unit } = useTheme();
  const isHelix = values.primitiveType === 'helix';
  const isTorus = values.primitiveType === 'torus';
  const params = values.primitiveParams || {};
  const updateParam = (key, value) => onChange({ ...values, primitiveParams: { ...params, [key]: value } });
  const [activeAxis, setActiveAxis] = useState(null);
  const [paramDraft, setParamDraft] = useState('');
  const replaceNext = useRef(true);
  const txtShadow = '0 1px 3px rgba(0,0,0,0.35)';
  const axes = ['x', 'y', 'z'];
  const minFor = (axis) => segmentMinimum(values.primitiveType, axis);

  const [text, setText] = useState({
    x: String(values.x),
    y: String(values.y),
    z: String(values.z),
  });

  useEffect(() => {
    setText({ x: String(values.x), y: String(values.y), z: String(values.z) });
  }, [values.x, values.y, values.z]);

  const commit = (draft = text) => {
    const next = Object.fromEntries(axes.map((axis) => [axis, Math.max(minFor(axis), parseInt(draft[axis], 10) || 1)]));
    setText(Object.fromEntries(axes.map((axis) => [axis, String(next[axis])])));
    if (axes.some((axis) => next[axis] !== values[axis])) onChange({ ...values, ...next });
  };

  const step = (axis, delta) => {
    const current = parseInt(text[axis], 10) || values[axis];
    commit({ ...text, [axis]: String(Math.max(minFor(axis), current + delta)) });
  };

  const openKeypad = (axis) => {
    setActiveAxis(axis);
    replaceNext.current = true;
  };

  const pressKey = (key) => {
    if (!activeAxis) return;
    if (activeAxis.startsWith('param:')) {
      const name = activeAxis.slice(6);
      const current = replaceNext.current ? '' : paramDraft;
      replaceNext.current = false;
      const next = key === 'Clear' ? '' : key === 'Backspace' ? current.slice(0, -1) : key === '.' ? (current.includes('.') ? current : `${current || '0'}.`) : `${current}${key}`;
      setParamDraft(next);
      const parsed = Number(next);
      if (next !== '' && Number.isFinite(parsed)) updateParam(name, name === 'innerDiameter' || name === 'height' ? fromDisplayUnit(parsed, unit) : parsed);
      return;
    }
    const replace = replaceNext.current;
    replaceNext.current = false;
    setText((draft) => {
      const current = replace ? '' : draft[activeAxis];
      const nextText = key === 'Clear' ? '' : key === 'Backspace' ? current.slice(0, -1) : current + key;
      const nextDraft = { ...draft, [activeAxis]: nextText };
      const parsed = parseInt(nextText, 10);
      if (Number.isFinite(parsed) && parsed >= minFor(activeAxis)) {
        onChange({ ...values, [activeAxis]: parsed });
      }
      return nextDraft;
    });
  };

  const finishEntry = () => {
    if (!activeAxis?.startsWith('param:')) commit();
    setActiveAxis(null);
  };
  const openParam = (name, displayValue) => {
    setParamDraft(Number(displayValue).toFixed(2));
    replaceNext.current = true;
    setActiveAxis(`param:${name}`);
  };

  const applyAndClose = () => {
    if (!activeAxis?.startsWith('param:')) commit();
    onApply();
  };

  return (
    <ModelingPanel label="Segments editor" keypadOpen={!!activeAxis}>
      <div className="py-2">
        <div className="mb-2 flex items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Grid3x3 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Segments</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel segments"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: uiColor }}
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={applyAndClose}
              aria-label="Apply segments"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: highlightColor, borderColor: highlightColor }}
            >
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="modeling-value grid grid-cols-3 rounded-lg px-2 py-2">
          {axes.map((axis, index) => (
            <div
              key={axis}
              className={`flex min-w-0 flex-col items-center justify-center ${index === 0 ? 'pr-1.5' : index === 1 ? 'px-1.5' : 'pl-1.5'}`}
            >
              <span
                className="mb-1 w-full pl-1 text-left text-[12px] font-semibold"
                style={{ color: uiColor, textShadow: txtShadow }}
              >
                Axis {axis}
              </span>

              <div className="flex w-full min-w-0 items-center justify-center gap-0 rounded-md" style={{ background: 'rgb(var(--modeling-sheet) / 0.65)', boxShadow: 'inset 0 0 0 1px rgb(var(--modeling-border) / 0.16)' }}>
                <button type="button" aria-label={`Decrease axis ${axis}`} onClick={() => step(axis, -1)} className="modeling-value flex h-7 w-7 shrink-0 items-center justify-center rounded-md active:scale-75" style={{ color: highlightColor, borderColor: highlightColor }}><ChevronLeft className="h-5 w-5" strokeWidth={2.5} /></button>
              <NumericValueField
                label={`Axis ${axis.toUpperCase()} segments`}
                value={text[axis]}
                active={activeAxis === axis}
                onOpen={() => openKeypad(axis)}
                onKey={pressKey}
                onClose={finishEntry}
                color={uiColor}
                highlightColor={highlightColor}
                className="h-7 !rounded-none !bg-transparent !border-0 text-[16px] font-semibold"
              />
                <button type="button" aria-label={`Increase axis ${axis}`} onClick={() => step(axis, 1)} className="modeling-value flex h-7 w-7 shrink-0 items-center justify-center rounded-md active:scale-75" style={{ color: highlightColor, borderColor: highlightColor }}><ChevronRight className="h-5 w-5" strokeWidth={2.5} /></button>
              </div>
            </div>
          ))}
        </div>

        {(isHelix || isTorus) && (
          <div className="mt-1.5">
            <div className={`modeling-value grid ${isHelix ? 'grid-cols-3' : 'grid-cols-1'} rounded-lg px-2 py-2`}>
              {isHelix && <ParamControl dividerClass="pr-1.5" label="Turns" value={params.turns ?? 1} step={0.25} min={0.25} onChange={(v) => updateParam('turns', v)} color={uiColor} highlightColor={highlightColor} active={activeAxis === 'param:turns' ? { text: paramDraft } : null} onOpen={() => openParam('turns', params.turns ?? 1)} onKey={pressKey} onClose={finishEntry} />}
              <ParamControl dividerClass={isHelix ? 'px-1.5' : ''} label="Inside Dia." value={toDisplayUnit(params.innerDiameter ?? 0.5, unit)} step={toDisplayUnit(0.05, unit)} min={toDisplayUnit(0.02, unit)} onChange={(v) => updateParam('innerDiameter', fromDisplayUnit(v, unit))} color={uiColor} highlightColor={highlightColor} active={activeAxis === 'param:innerDiameter' ? { text: paramDraft } : null} onOpen={() => openParam('innerDiameter', toDisplayUnit(params.innerDiameter ?? 0.5, unit))} onKey={pressKey} onClose={finishEntry} />
              {isHelix && <ParamControl dividerClass="pl-1.5" label="Height" value={toDisplayUnit(params.height ?? 0.5, unit)} step={toDisplayUnit(0.05, unit)} min={0} onChange={(v) => updateParam('height', fromDisplayUnit(v, unit))} color={uiColor} highlightColor={highlightColor} active={activeAxis === 'param:height' ? { text: paramDraft } : null} onOpen={() => openParam('height', toDisplayUnit(params.height ?? 0.5, unit))} onKey={pressKey} onClose={finishEntry} />}
            </div>
          </div>
        )}

        <ModelingNumberPad open={!!activeAxis} onKey={pressKey} onClose={finishEntry} decimal={activeAxis?.startsWith('param:')} />
      </div>
    </ModelingPanel>
  );
}