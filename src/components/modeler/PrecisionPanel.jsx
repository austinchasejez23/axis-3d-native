import { SlidersHorizontal, X, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import ModelingPanel from './ModelingPanel';

export default function PrecisionPanel({ intensity, onChange, onClose }) {
  const t = useTheme();
  return <ModelingPanel label="Precision controls">
    <div className="py-1.5">
      <div className="mb-2 flex items-center gap-2" style={{ color: t.uiColor }}>
        <SlidersHorizontal className="h-5 w-5" />
        <span className="flex-1 text-[16px] font-bold">Precision</span>
        <button aria-label="Close precision panel" onClick={onClose} className="modeling-value rounded-lg p-1"><X className="h-6 w-6" /></button>
        <button aria-label="Done with precision settings" onClick={onClose} className="modeling-value rounded-lg p-1" style={{ color: t.highlightColor }}><Check className="h-6 w-6" /></button>
      </div>
      <div className="modeling-value rounded-lg px-3 py-2">
        <div className="mb-2 flex justify-between text-sm" style={{ color: t.uiColor }}><span>Resistance</span><span>{intensity}%</span></div>
        <input type="range" min="0" max="95" step="1" value={intensity} onChange={e => onChange(Number(e.target.value))} aria-label="Precision resistance" className="w-full" style={{ accentColor: t.highlightColor }} />
      </div>
    </div>
  </ModelingPanel>;
}
