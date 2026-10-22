import { useTheme } from '@/lib/theme';

// Text button for the Material and Texture action rows, matching Paint's
// Apply / Undo. `primary` draws it in the highlight color (Apply); `active`
// marks a toggle that is on, in the highlight color like the texture toggles.
export default function SheetActionButton({ label, onClick, disabled = false, primary = false, active = false, ariaLabel = undefined }) {
  const { uiColor, highlightColor } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || label}
      aria-pressed={active === undefined ? undefined : !!active}
      className="modeling-value flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-[13px] font-semibold active:scale-95 disabled:opacity-35 disabled:active:scale-100"
      style={{ color: primary || active ? highlightColor : uiColor, borderColor: primary && !disabled ? highlightColor : undefined }}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
