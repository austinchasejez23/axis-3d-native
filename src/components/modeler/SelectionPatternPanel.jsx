import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import SelectionPatternStepper from '@/components/modeler/SelectionPatternStepper';
import ModelingPanel from '@/components/modeler/ModelingPanel';
import { SelectLoopIcon, SelectRingIcon } from '@/lib/toolIcons';

export default function SelectionPatternPanel({ label, skip, offset, onChange, onClose, onCancel }) {
  const { uiColor, highlightColor } = useTheme();
  const [activeKeypad, setActiveKeypad] = useState(null);
  const Icon = label === 'Select Ring' ? SelectRingIcon : SelectLoopIcon;
  const keypad = (name) => ({ keypadOpen: activeKeypad === name, onKeypadOpen: (open = true) => setActiveKeypad(open ? name : null) });
  return (
    <ModelingPanel label={`${label} controls`} keypadOpen={!!activeKeypad}>
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">{label}</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel || onClose} aria-label={`Cancel ${label}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button type="button" onClick={onClose} aria-label={`Apply ${label}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="modeling-value grid grid-cols-2 rounded-lg px-2 py-2">
          <div className="min-w-0 border-r border-white/15 pr-4">
            <div className="mb-1 text-[12px] font-semibold" style={{ color: uiColor }}>Skip</div>
            <SelectionPatternStepper label="Skip" value={skip} onChange={(value) => onChange({ skip: value, offset })} color={uiColor} highlightColor={highlightColor} {...keypad('skip')} />
          </div>
          <div className="min-w-0 pl-4">
            <div className="mb-1 text-[12px] font-semibold" style={{ color: uiColor }}>Offset</div>
            <SelectionPatternStepper label="Offset" value={offset} onChange={(value) => onChange({ skip, offset: value })} color={uiColor} highlightColor={highlightColor} {...keypad('offset')} />
          </div>
        </div>
      </div>
    </ModelingPanel>
  );
}