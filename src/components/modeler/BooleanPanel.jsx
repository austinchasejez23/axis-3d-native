import { Check, X } from 'lucide-react';
import { SubtractIcon, UnionIcon, IntersectIcon } from '@/lib/toolIcons';
import { useTheme } from '@/lib/theme';
import ModelingPanel from '@/components/modeler/ModelingPanel';

export const BOOLEAN_OPERATIONS = {
  subtract: {
    label: 'Subtract',
    Icon: SubtractIcon,
    hint: 'Select the object to keep first, then the object to cut away. Tap Apply.',
    prompts: ['Select the object to keep first', 'Now select the object to cut away', 'Tap Apply to subtract'],
  },
  union: {
    label: 'Union',
    Icon: UnionIcon,
    hint: 'Select two objects, then tap Apply to join them into one.',
    prompts: ['Select the first object', 'Select the second object', 'Tap Apply to join them'],
  },
  intersect: {
    label: 'Intersect',
    Icon: IntersectIcon,
    hint: 'Select two objects, then tap Apply to keep only where they overlap.',
    prompts: ['Select the first object', 'Select the second object', 'Tap Apply to keep the overlap'],
  },
};

// The prompt that matches how many objects are selected so far.
export function booleanPrompt(operation, selectedCount) {
  const prompts = (BOOLEAN_OPERATIONS[operation] || BOOLEAN_OPERATIONS.union).prompts;
  return prompts[Math.min(Math.max(0, selectedCount), 2)];
}

// Subtract / Union / Intersect: header with the tool's icon and name, Cancel
// (X) and Done (check); below it a short instruction and the Apply button.
export default function BooleanPanel({ operation, onApply, onDone, onCancel }) {
  const { uiColor, highlightColor } = useTheme();
  const { label, Icon, hint } = BOOLEAN_OPERATIONS[operation] || BOOLEAN_OPERATIONS.union;
  return (
    <ModelingPanel label={`${label} controls`}>
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">{label}</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label={`Cancel ${label.toLowerCase()}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button type="button" onClick={onDone} aria-label={`Close ${label.toLowerCase()}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="modeling-value flex items-center gap-3 rounded-lg px-2 py-2">
          <p className="min-w-0 flex-1 text-[12px] font-semibold leading-snug" style={{ color: uiColor }}>{hint}</p>
          <button type="button" onClick={onApply} aria-label={`Apply ${label.toLowerCase()}`} className="modeling-value flex h-8 shrink-0 items-center justify-center rounded-lg px-4 text-[13px] font-semibold active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}>Apply</button>
        </div>
      </div>
    </ModelingPanel>
  );
}
