import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ModelingNumberPad from '@/components/modeler/ModelingNumberPad';
import NumericValueField from '@/components/modeler/NumericValueField';

export default function SelectionPatternStepper({ label, value, onChange, color, highlightColor, keypadOpen = false, onKeypadOpen }) {
  const [text, setText] = useState(String(value));
  const replaceNext = useRef(true);
  useEffect(() => { if (!keypadOpen) setText(String(value)); }, [value, keypadOpen]);
  const apply = (next) => {
    const parsed = Number(next);
    const safe = Number.isFinite(parsed) ? Math.round(Math.min(99, Math.max(0, parsed))) : value;
    setText(String(safe));
    if (safe !== value) onChange(safe);
  };
  const pressKey = (key) => {
    const base = replaceNext.current ? '' : text;
    replaceNext.current = false;
    if (key === 'Backspace') setText(base.slice(0, -1));
    else if (/^[0-9]$/.test(key)) setText(`${base}${key}`);
  };
  const openPad = () => { replaceNext.current = true; onKeypadOpen?.(true); };
  const closePad = () => { apply(text); onKeypadOpen?.(false); };
  return (
    <div className="flex min-w-0 items-center gap-0 rounded-md" style={{ background: 'rgb(var(--modeling-sheet) / 0.65)', boxShadow: 'inset 0 0 0 1px rgb(var(--modeling-border) / 0.16)' }}>
      <button type="button" onClick={() => apply(value - 1)} aria-label={`Decrease ${label}`} className="modeling-value flex h-7 w-7 shrink-0 items-center justify-center rounded-md active:scale-75" style={{ color: highlightColor, borderColor: highlightColor }}><ChevronLeft className="h-5 w-5" strokeWidth={2.5} /></button>
      <NumericValueField label={`${label} value`} value={text} active={keypadOpen} onOpen={openPad} onKey={pressKey} onClose={closePad} color={color} highlightColor={highlightColor} className="h-7 flex-1 !rounded-none !bg-transparent !border-0 text-[16px] font-semibold" />
      <button type="button" onClick={() => apply(value + 1)} aria-label={`Increase ${label}`} className="modeling-value flex h-7 w-7 shrink-0 items-center justify-center rounded-md active:scale-75" style={{ color: highlightColor, borderColor: highlightColor }}><ChevronRight className="h-5 w-5" strokeWidth={2.5} /></button>
      <ModelingNumberPad open={keypadOpen} onKey={pressKey} onClose={closePad} />
    </div>
  );
}