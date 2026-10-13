import { PaintBucket, Paintbrush, SprayCan, Blend, Droplet, Droplets } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import LoopingScroller from './LoopingScroller';

const GREY = 'rgba(150,150,150,0.55)';

// Fill · Brush · Spray · Multi · Primary · Shift as one endless, swipeable row
// of icon-only buttons on a single backing strip. Primary and Shift pick which
// Multi color the wheel edits, so they stay grey (inactive) until Multi is on.
export default function PaintToolButtons({ paintTool, multi, strokesBlocked, onPaintTool, onMulti, colorTarget, onColorTarget, onPress }) {
  const { highlightColor } = useTheme();
  const items = [
    { id: 'fill', label: 'Fill', icon: PaintBucket, active: paintTool === 'fill', onClick: () => onPaintTool('fill') },
    { id: 'brush', label: 'Brush', icon: Paintbrush, active: paintTool === 'brush', disabled: strokesBlocked, onClick: () => onPaintTool('brush') },
    { id: 'spray', label: 'Spray', icon: SprayCan, active: paintTool === 'spray', disabled: strokesBlocked, onClick: () => onPaintTool('spray') },
    { id: 'multi', label: 'Multi', flash: 'Color shift', icon: Blend, active: multi, onClick: onMulti },
    { id: 'primary', label: 'Primary color', flash: 'Base color', icon: Droplet, active: multi && colorTarget === 'primary', disabled: !multi, onClick: () => onColorTarget('primary') },
    { id: 'shift', label: 'Shift color', flash: 'Secondary color', icon: Droplets, active: multi && colorTarget === 'shift', disabled: !multi, onClick: () => onColorTarget('shift') },
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
              disabled={it.disabled}
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
