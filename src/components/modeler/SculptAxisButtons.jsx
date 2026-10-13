import { useTheme } from '@/lib/theme';

const AXES = ['x', 'y', 'z'];

export default function SculptAxisButtons({ activeAxes, onChange }) {
  const { highlightColor } = useTheme();
  const toggle = (axis) => onChange(activeAxes.includes(axis)
    ? activeAxes.filter((item) => item !== axis)
    : [...activeAxes, axis]);

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.06]">
      {AXES.map((axis) => {
        const active = activeAxes.includes(axis);
        return (
          <button
            key={axis}
            onClick={() => toggle(axis)}
            aria-label={`${axis.toUpperCase()} sculpt axis`}
            aria-pressed={active}
            className="h-6 min-w-9 px-2 rounded-md text-[13px] font-semibold uppercase active:scale-95 transition-transform"
            style={{
              color: active ? highlightColor : 'rgba(255,255,255,0.7)',
              background: 'rgba(255,255,255,0.16)',
            }}
          >
            {axis}
          </button>
        );
      })}
    </div>
  );
}