import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { BevelIcon } from '@/lib/toolIcons';
import { BevelRadiusIcon, BevelSegmentsIcon } from './BevelSettingIcons';
import { useTheme } from '@/lib/theme';
import HorizontalChevronStepper from './HorizontalChevronStepper';
import { toolMemory } from '@/lib/toolMemory';
import ModelingPanel from '@/components/modeler/ModelingPanel';

// The default is a conventional equal-width bevel. Smooth rounds its
// multi-segment profile; Sweep restores the original section-bend behavior.
export default function BevelPanel({ onPreview, onApply, onCancel, isPro, onProLock }) {
  const { uiColor, highlightColor } = useTheme();
  const [radius, setRadius] = useState(toolMemory.bevel.radius);
  const [segments, setSegments] = useState(toolMemory.bevel.segments);
  const [smooth, setSmooth] = useState(true);
  const [sweep, setSweep] = useState(false);
  const [activeKeypad, setActiveKeypad] = useState(null);
  const options = (next = {}) => ({ radius, segments, smooth, sweep, ...next });

  useEffect(() => {
    onPreview?.({ radius: toolMemory.bevel.radius, segments: toolMemory.bevel.segments, smooth: true, sweep: false });
  }, []);

  const handleRadius = (v) => { setRadius(v); toolMemory.bevel.radius = v; onPreview?.(options({ radius: v })); };
  const handleSegments = (v) => { setSegments(v); toolMemory.bevel.segments = v; onPreview?.(options({ segments: v })); };
  const toggleSmooth = () => { const next = !smooth; setSmooth(next); onPreview?.(options({ smooth: next })); };
  const toggleSweep = () => {
    if (!isPro) { onProLock?.('Sweep requires AXIS 3D Pro. Base Bevel remains free.'); return; }
    const next = !sweep; setSweep(next); onPreview?.(options({ sweep: next }));
  };

  const txtShadow = '0 1px 3px rgba(0,0,0,0.35)';
  const toggleStyle = (active, disabled = false) => ({
    color: active ? highlightColor : uiColor,
    background: 'transparent',
    opacity: disabled ? 0.4 : 1,
    textShadow: txtShadow,
  });
  const keypad = (name) => ({ keypadOpen: activeKeypad === name, onKeypadOpen: (open = true) => setActiveKeypad(open ? name : null) });

  return (
    <ModelingPanel label="Bevel controls" keypadOpen={!!activeKeypad}>
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <BevelIcon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Bevel</h2>
          </div>
          <button type="button" onClick={toggleSmooth} disabled={sweep} aria-pressed={smooth && !sweep} className="modeling-value flex h-8 w-[3.75rem] shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold active:scale-95" style={toggleStyle(smooth && !sweep, sweep)}>Smooth</button>
          <button type="button" onClick={toggleSweep} aria-pressed={sweep} className="modeling-value relative flex h-8 w-[3.75rem] shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold active:scale-95" style={{ ...toggleStyle(sweep), color: !isPro ? '#fbbf24' : toggleStyle(sweep).color, opacity: !isPro ? 0.62 : 1 }}>Sweep{!isPro && <span className="absolute -right-1 -top-1 rounded bg-amber-400 px-1 text-[8px] font-bold leading-4 text-black">PRO</span>}</button>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label="Cancel bevel" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button type="button" onClick={() => onApply(options())} aria-label="Apply bevel" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="modeling-value grid grid-cols-2 rounded-lg px-2 py-2">
          <div className="min-w-0 border-r border-white/15 pr-4">
            <div className="mb-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: uiColor }}><BevelRadiusIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />Radius (scale units)</div>
            <HorizontalChevronStepper label="Radius" value={radius} onChange={handleRadius} step={0.05} decimals={3} min={0.001} max={1000} color={uiColor} highlightColor={highlightColor} appearance="radial" {...keypad('radius')} />
          </div>
          <div className="min-w-0 pl-4">
            <div className="mb-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: uiColor }}><BevelSegmentsIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />Segments</div>
            <HorizontalChevronStepper label="Segments" value={segments} onChange={handleSegments} step={1} min={1} max={24} color={uiColor} highlightColor={highlightColor} appearance="radial" {...keypad('segments')} />
          </div>
        </div>
      </div>
    </ModelingPanel>
  );
}