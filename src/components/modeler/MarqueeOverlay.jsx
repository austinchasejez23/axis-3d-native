import { useTheme } from '@/lib/theme';

export default function MarqueeOverlay({ rect }) {
  const { highlightColor } = useTheme();
  if (!rect) return null;
  const { x, y, w, h } = rect;
  const left = Math.min(x, x + w);
  const top = Math.min(y, y + h);
  const width = Math.abs(w);
  const height = Math.abs(h);
  return (
    <div
      className="absolute z-20 pointer-events-none border-2 rounded-sm"
      style={{ left, top, width, height, borderColor: highlightColor, backgroundColor: `${highlightColor}1a` }}
    />
  );
}