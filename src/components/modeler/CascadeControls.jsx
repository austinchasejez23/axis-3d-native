import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

// Controls for the menu's side panels, styled like the Settings controls
// (the Units buttons): outlined, the chosen one in the highlight color.

// `onDraft` (optional) hears every edit, so a panel's checkmark can apply
// what is typed even when the field never loses focus.
export function NumericEditor({ value, unit, min, onCommit, onDraft = undefined }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); onDraft?.(String(value)); }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next >= min) onCommit(next);
    else setDraft(String(value));
  };
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step="any"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onDraft?.(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-16 h-7 text-[12px] rounded-md border border-white/20 bg-transparent px-2 text-right text-white font-mono outline-none"
      />
      <span className="w-5 text-[11px] font-semibold text-white/60">{unit}</span>
    </div>
  );
}

export function PillSwitch({ on, onChange, label, color, highlight }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-label={label}
      aria-pressed={on}
      className="h-7 min-w-10 rounded-md border px-2 text-[11px] font-semibold active:scale-95 transition-transform"
      style={{ color: on ? highlight : color, borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }}
    >
      {on ? 'On' : 'Off'}
    </button>
  );
}

// Two or more choices side by side; the chosen one in the highlight color.
export function ChoiceButton({ on, onClick, label, color, highlight }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex-1 h-7 rounded-md border px-2 text-[11px] font-semibold active:scale-95 transition-transform"
      style={{ color: on ? highlight : color, borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }}
    >
      {label}
    </button>
  );
}

// Applies what is typed in the panel (and closes it), like the checkmark on
// the other panels.
export function ApplyButton({ onClick, label, highlight }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border active:scale-95 transition-transform"
      style={{ color: highlight, borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }}
    >
      <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
    </button>
  );
}

// Puts back what the panel changed (and closes it), like the X on the other
// panels.
export function CancelButton({ onClick, label, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border active:scale-95 transition-transform"
      style={{ color, borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }}
    >
      <X className="h-[18px] w-[18px]" strokeWidth={2.5} />
    </button>
  );
}
