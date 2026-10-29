import { useTheme } from '@/lib/theme';
import ProBadge from '@/components/pro/ProBadge';
import { helpIntercept } from '@/lib/helpMode';

// Tool icons are transparent. A shared backdrop is painted behind contiguous
// occupied slots by GlassToolRow, and follows tool rearrangement.
export default function GridToolButton({ icon: Icon, label, announceLabel = undefined, mode = undefined, active = false, locked = false, onClick = undefined, fullWidth = false, nowrap = false, iconClassName = 'w-7 h-7', labelClassName = 'text-[8px]', iconStrokeWidth = 1.3 }) {
  const { uiColor, highlightColor, toolLabelsEnabled } = useTheme();
  return (
    <button
      onClick={(event) => {
        if (helpIntercept({ label, announceLabel, mode })) return;
        window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: announceLabel || label, icon: Icon, mode } }));
        onClick?.(event);
      }}
      aria-label={label}
      aria-pressed={!!active}
      style={{ color: locked ? '#fbbf24' : active ? highlightColor : uiColor, opacity: locked ? 0.62 : 1, textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}
      className={`${fullWidth ? 'w-full' : 'w-1/6'} relative pointer-events-auto flex flex-col items-center justify-center rounded-lg active:scale-95 transition-all ${toolLabelsEnabled ? 'h-14 gap-0.5' : 'h-11'}`}
    >
      {locked && <ProBadge />}
      {Icon && <Icon className={`${iconClassName} shrink-0`} strokeWidth={iconStrokeWidth} />}
      {toolLabelsEnabled && (
        <span
          className={`w-full min-h-4 ${labelClassName} leading-tight text-center px-0.5 ${nowrap ? 'whitespace-nowrap' : 'break-words'}`}
          /* Inline size beats the global 13px minimum so long labels
             (e.g. "Orientation") stay on one line inside a narrow cell. */
          style={nowrap ? { fontSize: '9px' } : undefined}
        >
          {label}
        </span>
      )}
    </button>
  );
}