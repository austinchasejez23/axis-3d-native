import { forwardRef } from 'react';

const NumericValueField = forwardRef(/** @param {{ label: string, value: string | number, active?: boolean, onOpen: () => void, onKey: (key: string) => void, onClose: () => void, color?: string, highlightColor?: string, className?: string }} props */ function NumericValueField({ label, value, active, onOpen, onKey, onClose, color, highlightColor, className = '' }, ref) {
  return (
    <button ref={ref} type="button" role="textbox" aria-label={label} aria-expanded={active} aria-readonly="true"
      data-numeric-active={active ? 'true' : 'false'}
      onFocus={() => { if (!active) onOpen(); }} onClick={() => { if (!active) onOpen(); }}
      onKeyDown={(event) => {
        if (/^[0-9.]$/.test(event.key) || event.key === 'Backspace' || event.key === '-') {
          event.preventDefault(); onKey(event.key === '-' ? '+/−' : event.key);
        } else if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); onClose(); }
      }}
      className={`modeling-value min-w-0 flex-1 flex items-center justify-center overflow-hidden rounded-md px-1 tabular-nums outline-none ${className}`}
      style={{ color: active ? highlightColor : color }}>
      <span className="truncate">{value || '\u00a0'}</span>
      {active && <span aria-hidden="true" className="modeling-caret shrink-0" />}
    </button>
  );
});
export default NumericValueField;