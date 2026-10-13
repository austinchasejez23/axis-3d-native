import { Box, Square, Cylinder, Globe } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const MODES = [
  { id: 'box', label: 'Box', icon: Box },
  { id: 'planar', label: 'Planar', icon: Square },
  { id: 'cylindrical', label: 'Cylinder', icon: Cylinder },
  { id: 'spherical', label: 'Sphere', icon: Globe },
];

// Projection picker for the texture row: how the image wraps around the mesh.
export default function WrapModePicker({ mode, onMode }) {
  const { uiColor, highlightColor } = useTheme();
  return (
    <div
      className="w-fit p-1.5 rounded-lg border pointer-events-auto"
      style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgb(var(--modeling-sheet))' }}
    >
      <div className="flex gap-1.5">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onMode(id)}
            className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-md border active:scale-95 transition-transform"
            style={{
              color: mode === id ? highlightColor : uiColor,
              borderColor: 'rgba(255,255,255,0.15)',
            }}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}