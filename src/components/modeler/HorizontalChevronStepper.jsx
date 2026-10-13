import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ModelingNumberPad from './ModelingNumberPad';
import NumericValueField from '@/components/modeler/NumericValueField';

export default function HorizontalChevronStepper({ label, value, onChange, step, decimals = 0, min = 0, max = Infinity, color, highlightColor, boxed = false, appearance, keypadOpen = false, onKeypadOpen }) {
  const [text, setText] = useState(Number(value).toFixed(decimals));
  const replaceNext = useRef(true);
  const signNext = useRef('');
  const pendingText = useRef(text);
  useEffect(() => { if (!keypadOpen) setText(Number(value).toFixed(decimals)); }, [value, decimals, keypadOpen]);
  const apply = (next) => {
    const parsed = Number(next);
    const safe = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    const rounded = Number(safe.toFixed(decimals));
    pendingText.current = rounded.toFixed(decimals);
    setText(pendingText.current);
    if (rounded !== value) onChange(rounded);
  };
  const pressKey = (key) => {
    const current = pendingText.current;
    let next;
    if (key === '+/−') {
      // Flips the shown value; if nothing was typed yet, the first digit after
      // it starts a new number that keeps that sign.
      next = current.startsWith('-') ? current.slice(1) : `-${current}`;
      if (replaceNext.current) signNext.current = next.startsWith('-') ? '-' : '';
    } else {
      const base = replaceNext.current ? signNext.current : current;
      replaceNext.current = false;
      signNext.current = '';
      if (key === 'Backspace') next = base.slice(0, -1);
      else if (key === '.') next = base.includes('.') ? base : `${base || '0'}.`;
      else next = `${base}${key}`;
    }
    pendingText.current = next;
    setText(next);
    // Persist each valid entry immediately, without replacing the in-progress
    // text (including decimal points and leading zeroes).
    if (next.trim() !== '' && next !== '-' && next !== '.' && next !== '-.') {
      const parsed = Number(next);
      if (Number.isFinite(parsed)) {
        const safe = Math.min(max, Math.max(min, parsed));
        onChange(Number(safe.toFixed(decimals)));
      }
    }
  };
  const openPad = () => { pendingText.current = text; replaceNext.current = true; signNext.current = ''; onKeypadOpen?.(); };
  const closePad = () => { apply(pendingText.current); onKeypadOpen?.(false); };
  return (
    <div className={`flex min-w-0 items-center ${appearance === 'radial' ? 'gap-0 rounded-md' : 'justify-start gap-0.5'}`} style={appearance === 'radial' ? { background: 'rgb(var(--modeling-sheet) / 0.65)', boxShadow: 'inset 0 0 0 1px rgb(var(--modeling-border) / 0.16)' } : undefined}>
      <button type="button" onClick={() => apply(value - step)} aria-label={`Decrease ${label}`} className={`flex shrink-0 items-center justify-center active:scale-75 ${appearance === 'radial' ? 'modeling-value h-7 w-7 rounded-md' : 'h-10 w-8'}`} style={{ color: appearance === 'radial' ? highlightColor : color, ...(appearance === 'radial' ? { borderColor: highlightColor } : {}) }}><ChevronLeft className={appearance === 'radial' ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2.5} /></button>
      <NumericValueField label={`${label} value`} value={text} active={keypadOpen} onOpen={openPad} onKey={pressKey} onClose={closePad} color={color} highlightColor={highlightColor} className={`h-7 font-semibold ${appearance === 'radial' ? 'flex-1 !rounded-none !bg-transparent !border-0 text-[16px]' : `flex-none w-14 text-[16px] ${boxed ? '' : '!bg-transparent !border-0'}`}`} />
      <button type="button" onClick={() => apply(value + step)} aria-label={`Increase ${label}`} className={`flex shrink-0 items-center justify-center active:scale-75 ${appearance === 'radial' ? 'modeling-value h-7 w-7 rounded-md' : 'h-10 w-8'}`} style={{ color: appearance === 'radial' ? highlightColor : color, ...(appearance === 'radial' ? { borderColor: highlightColor } : {}) }}><ChevronRight className={appearance === 'radial' ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2.5} /></button>
      <ModelingNumberPad open={keypadOpen} onKey={pressKey} onClose={closePad} decimal={decimals > 0} signed={min < 0} />
    </div>
  );
}