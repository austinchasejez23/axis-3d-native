import { useTheme } from '@/lib/theme';

// The picked-up tool's icon riding under the finger while it is being moved,
// so the drag is visible before it lands in its new slot.
export default function ToolDragGhost({ icon: Icon, label, pointer }) {
  const { highlightColor } = useTheme();
  if (!Icon || !pointer) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none flex flex-col items-center justify-center rounded-lg w-14 h-14"
      style={{
        left: pointer.x,
        top: pointer.y,
        transform: 'translate(-50%, -50%) scale(1.15)',
        color: highlightColor,
        background: 'rgba(10,10,12,0.85)',
        boxShadow: `0 0 0 1.5px ${highlightColor}, 0 6px 18px rgba(0,0,0,0.6)`,
      }}
    >
      <Icon className="w-7 h-7" strokeWidth={1.3} />
      <span className="text-[8px] leading-tight text-center px-0.5 text-white">{label}</span>
    </div>
  );
}