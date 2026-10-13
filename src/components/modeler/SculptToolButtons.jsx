import { ArrowDownToLine, ArrowUpFromLine, Move, Waves } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const TOOLS = [
  { id: 'push', label: 'Push', icon: ArrowDownToLine },
  { id: 'pull', label: 'Pull', icon: ArrowUpFromLine },
  { id: 'move', label: 'Move', icon: Move },
  { id: 'smooth', label: 'Smooth', icon: Waves },
];

export default function SculptToolButtons({ tool, onTool }) {
  const { highlightColor } = useTheme();
  return (
    <div className="grid grid-cols-4 gap-1">
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const active = tool === id;
        return (
          <button
            key={id}
            onClick={() => onTool(id)}
            aria-pressed={active}
            className="h-8 rounded-lg flex items-center justify-center gap-1 text-[13px] font-semibold active:scale-95 transition-transform"
            style={{
              color: active ? highlightColor : 'rgba(255,255,255,0.9)',
              background: 'rgba(255,255,255,0.16)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)',
            }}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}