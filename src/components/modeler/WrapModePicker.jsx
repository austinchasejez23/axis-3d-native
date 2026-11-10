import { Box, Square, Cylinder, Globe, Scissors, LayoutGrid } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const MODES = [
  { id: 'box', label: 'Box', icon: Box },
  { id: 'planar', label: 'Planar', icon: Square },
  { id: 'cylindrical', label: 'Cylinder', icon: Cylinder },
  { id: 'spherical', label: 'Sphere', icon: Globe },
  { id: 'unwrap', label: 'Unwrap', icon: Scissors },
];

// Projection picker for the texture row: how the image wraps around the mesh.
// Unwrap cuts the surface along its seams and lays it flat; UV Editor then lets
// each flattened piece be moved, resized, turned and flipped.
export default function WrapModePicker({ mode, onMode, onEditor, editorEnabled = false }) {
  const { uiColor, highlightColor } = useTheme();
  const button = (id, label, Icon, active, onClick, disabled = false) => (
    <button
      key={id}
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-md border active:scale-95 transition-transform disabled:opacity-40"
      style={{
        color: active ? highlightColor : uiColor,
        borderColor: 'rgba(255,255,255,0.15)',
      }}
    >
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
      <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>
    </button>
  );
  return (
    <div
      className="w-fit p-1.5 rounded-lg border pointer-events-auto"
      style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgb(var(--modeling-sheet))' }}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {MODES.map(({ id, label, icon }) => button(id, label, icon, mode === id, () => onMode(id)))}
        {button('editor', 'UV Editor', LayoutGrid, false, () => onEditor?.(), !editorEnabled)}
      </div>
    </div>
  );
}
