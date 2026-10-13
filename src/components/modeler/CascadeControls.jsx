import { useEffect, useState } from 'react';

export function NumericEditor({ value, unit, min, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-20 h-8 rounded-md border border-white/20 bg-white/10 px-2 text-right text-white text-[13px] font-mono outline-none"
      />
      <span className="w-6 text-white/50 text-[13px] font-mono">{unit}</span>
    </div>
  );
}

export function PillSwitch({ on, onChange, label, color, highlight }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-label={label}
      aria-pressed={on}
      className="h-8 min-w-12 rounded-md border px-2 active:scale-95 transition-transform"
      style={{
        color: on ? highlight : color,
        borderColor: on ? highlight : 'rgba(255,255,255,0.22)',
        background: on ? `${highlight}18` : 'rgba(255,255,255,0.05)',
      }}
    >
      <span className="text-[13px] font-semibold">{on ? 'On' : 'Off'}</span>
    </button>
  );
}