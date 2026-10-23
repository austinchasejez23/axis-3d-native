import { PaintBucket, Paintbrush, SprayCan, Pipette } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import LoopingScroller from './LoopingScroller';

const GREY = 'rgba(150,150,150,0.55)';

// Fill, Brush, Spray and Eyedropper. Color shift is retired.
export default function PaintToolButtons({ paintTool, strokesBlocked, onPaintTool, onPress, eyedropper, onEyedropper }) {
  const { highlightColor } = useTheme();
  const items = [
    { id: 'fill', label: 'Fill', icon: PaintBucket, active: paintTool === 'fill', onClick: () => onPaintTool('fill') },
    { id: 'brush', label: 'Brush', icon: Paintbrush, active: paintTool === 'brush', disabled: strokesBlocked, onClick: () => onPaintTool('brush') },
    { id: 'spray', label: 'Spray', icon: SprayCan, active: paintTool === 'spray', disabled: strokesBlocked, onClick: () => onPaintTool('spray') },
    { id: 'eyedropper', label: 'Eyedropper', flash: 'Eyedropper', icon: Pipette, active: !!eyedropper, onClick: () => onEyedropper?.() },
  ];
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      <LoopingScroller shadows shadowAlpha={0.82} className="px-1 py-0.5" itemClass="pr-1" innerClass="items-center">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              onClick={it.disabled ? undefined : () => { onPress?.(it.id, it.flash || it.label); it.onClick(); }}
              // aria-disabled, not disabled: a disabled button swallows the touch,
              // so a swipe starting on a grey tool would not move the strip.
              aria-disabled={it.disabled || undefined}
              aria-label={it.label}
              aria-pressed={!!it.active}
              className="w-9 h-8 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
              style={{
                color: it.disabled ? GREY : it.active ? highlightColor : 'rgba(255,255,255,0.9)',
                background: 'transparent',
              }}
            >
              <Icon className="w-6 h-6" strokeWidth={1.8} />
            </button>
          );
        })}
      </LoopingScroller>
    </div>
  );
}
