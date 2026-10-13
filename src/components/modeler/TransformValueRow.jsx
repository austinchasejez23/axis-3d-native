import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import HudNumberPad from './HudNumberPad';
import NumericValueField from '@/components/modeler/NumericValueField';
import { formatValue3 } from '@/lib/units';

const formatValue = formatValue3;

export default function TransformValueRow({ label, value, onChange, color, highlightColor, step = 0.1, autoFocus = false, keypadOpen = false, onKeypadOpen }) {
  const adjust = (direction) => {
    const next = Math.round((value + direction * step) * 1e12) / 1e12;
    setDraft(formatValue(next));
    onChange(next);
  };
  const inputRef = useRef(null);
  // What is typed is kept as text while the field is focused, so "1." or "0.0"
  // survive until the next digit arrives — re-rendering the parsed number on
  // every keystroke used to swallow the decimal point.
  const [draft, setDraft] = useState(formatValue(value));
  useEffect(() => { if (!keypadOpen) setDraft(formatValue(value)); }, [value, keypadOpen]);
  const replaceNext = useRef(true);
  // +/− pressed before typing flips the shown value; the first digit after it
  // then starts a new number that keeps that sign.
  const signNext = useRef('');
  const openPad = () => { replaceNext.current = true; signNext.current = ''; onKeypadOpen?.(true); };
  const pressKey = (key) => setDraft((current) => {
    if (key === '+/−') {
      const flipped = current.startsWith('-') ? current.slice(1) : `-${current}`;
      if (replaceNext.current) signNext.current = flipped.startsWith('-') ? '-' : '';
      const flippedNumber = Number(flipped);
      if (flipped !== '-' && Number.isFinite(flippedNumber)) onChange(flippedNumber);
      return flipped;
    }
    const base = replaceNext.current ? signNext.current : current;
    replaceNext.current = false;
    signNext.current = '';
    let next;
    if (key === 'Backspace') next = base.slice(0, -1);
    else if (key === '.') next = base.includes('.') ? base : `${base || '0'}.`;
    else next = `${base}${key}`;
    const number = Number(next);
    if (next !== '' && next !== '-' && Number.isFinite(number)) onChange(number);
    return next;
  });
  const closePad = () => {
    const number = Number(draft);
    if (Number.isFinite(number)) onChange(number);
    onKeypadOpen?.(false);
  };

  // The field the user tapped in the HUD opens focused with its value selected,
  // so typing replaces it straight away.
  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    const el = inputRef.current;
    el.focus();
    openPad();
  }, [autoFocus]);

  return (
    <div className="flex items-center gap-1">
      <span className="w-3 text-center text-[10px]" style={{ color: keypadOpen ? highlightColor : color }}>{label}</span>
      <NumericValueField ref={inputRef} label={`${label} value`} value={draft} active={keypadOpen} onOpen={openPad} onKey={pressKey} onClose={closePad} color={color} highlightColor={highlightColor} className="h-8 text-[11px]" />
      <div className="flex flex-col gap-0.5">
        <button type="button" onClick={() => adjust(1)} aria-label={`Increase ${label}`} className="flex h-[15px] w-6 items-center justify-center rounded bg-white/10 active:scale-90">
          <ChevronUp className="h-3 w-3" style={{ color }} />
        </button>
        <button type="button" onClick={() => adjust(-1)} aria-label={`Decrease ${label}`} className="flex h-[15px] w-6 items-center justify-center rounded bg-white/10 active:scale-90">
          <ChevronDown className="h-3 w-3" style={{ color }} />
        </button>
      </div>
      <HudNumberPad open={keypadOpen} onKey={pressKey} onClose={closePad} decimal signed />
    </div>
  );
}