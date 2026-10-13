import { useTheme } from '@/lib/theme';

// Renders the in-progress free-draw polyline (screen space) for the Draw face tool.
export default function DrawOverlay({ draw }) {
  const { highlightColor } = useTheme();
  if (!draw || !draw.active || !draw.points || draw.points.length === 0) return null;
  const pts = draw.points;
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-40">
      {pts.length > 1 && (
        <polyline points={poly} fill="none" stroke={highlightColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      )}
      {draw.nearStart && pts.length > 1 && (
        <line x1={last.x} y1={last.y} x2={first.x} y2={first.y} stroke={highlightColor} strokeWidth={2.5} opacity={0.6} strokeDasharray="4 3" />
      )}
      <circle cx={first.x} cy={first.y} r={draw.nearStart ? 11 : 6} fill={draw.nearStart ? highlightColor : 'none'} stroke={highlightColor} strokeWidth={2.5} opacity={0.9} />
    </svg>
  );
}