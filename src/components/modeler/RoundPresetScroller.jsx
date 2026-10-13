import { useTheme } from '@/lib/theme';
import ScrollerTunnelShadows from './ScrollerTunnelShadows';

// Glossy sphere shading laid over a thumbnail so every preset reads as a ball.
export const SPHERE_SHADE =
  'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)';

// Row of round, named thumbnails (materials / textures) that scrolls sideways.
export default function RoundPresetScroller({ items }) {
  const { highlightColor } = useTheme();
  return (
    <div className="relative">
      <div className="overflow-x-auto no-scrollbar" style={{ touchAction: 'pan-x' }}>
        <div className="flex items-start gap-1.5 w-max px-1 pt-0.5">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={it.onClick}
                aria-label={it.label}
                aria-pressed={!!it.active}
                className="shrink-0 w-[60px] flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <span
                  className="relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    background: it.background || 'rgba(255,255,255,0.06)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.16)',
                  }}
                >
                  {it.image && (
                    <img src={it.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" style={{ transform: `scale(${it.zoom ?? 1})` }} />
                  )}
                  {it.sphere && <span className="absolute inset-0" style={{ background: SPHERE_SHADE }} />}
                  {Icon && <Icon className="relative w-5 h-5" style={{ color: it.active ? highlightColor : 'rgb(var(--modeling-ink))' }} strokeWidth={2} />}
                </span>
                <span
                  className="text-[13px] leading-none font-medium whitespace-nowrap max-w-[60px] truncate"
                  style={{ color: it.active ? highlightColor : 'rgba(255,255,255,0.85)' }}
                >
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <ScrollerTunnelShadows />
    </div>
  );
}