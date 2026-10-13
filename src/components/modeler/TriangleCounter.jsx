import { Circle, Minus, Square, Triangle } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const icons = { object: Triangle, vertex: Circle, edge: Minus, face: Square };

export default function TriangleCounter({ metric = { type: 'object', count: 0, label: '0 selected triangles' } }) {
  const { uiColor } = useTheme();
  const Icon = icons[metric.type] || Triangle;
  return (
    <div
      className="absolute top-[calc(max(env(safe-area-inset-top,0px),1.75rem)+3.75rem)] left-[6px] w-16 z-30 flex items-center justify-center gap-1 pointer-events-none font-mono text-[10px] tabular-nums"
      style={{ color: uiColor, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
      aria-label={metric.label}
    >
      <Icon className="w-3 h-3" strokeWidth={1.6} />
      <span>{metric.count.toLocaleString()}</span>
    </div>
  );
}