import { useTheme } from '@/lib/theme';

// Horizontal sheet slider: label on the left, value on the right, track below.
export default function InlineSlider({ label, value, display = undefined, min = 0, max = 100, step = 1, onChange, hue = false, width = 128, grow = false, compact = false, onActiveChange = undefined, disabled = false }) {
  const { highlightColor } = useTheme();
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <div className={`flex flex-col ${compact ? 'gap-0' : 'gap-0.5'} ${grow ? (compact ? 'min-w-0' : 'flex-1 min-w-0') : 'shrink-0'} ${disabled ? 'opacity-45' : ''}`} style={grow ? undefined : { width }}>
      <div className="flex items-center justify-between leading-none" style={{ fontSize: compact ? '11px' : '13px' }}>
        <span className="font-medium text-white/85">{label}</span>
        <span className="font-semibold tabular-nums text-white">{display ?? value}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerDown={() => onActiveChange?.(true)}
        onPointerUp={() => onActiveChange?.(false)}
        onPointerCancel={() => onActiveChange?.(false)}
        className={`gs-slider w-full touch-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${hue ? 'gs-slider-hue' : ''}`}
        style={/** @type {import('react').CSSProperties & { '--gs-accent': string, '--gs-pct': string }} */ ({ '--gs-accent': hue ? `hsl(${value} 100% 50%)` : highlightColor, '--gs-pct': `${pct}%` })}
      />
    </div>
  );
}