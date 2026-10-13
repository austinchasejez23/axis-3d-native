import { AlertTriangle, X } from 'lucide-react';
import { useTheme } from '@/lib/theme';

// Shown when the 3D view fails to draw on a device. Without this the viewport
// just goes black with no explanation, which is impossible to report or debug.
export default function GraphicsErrorBanner({ message, onClose }) {
  const { highlightColor } = useTheme();
  if (!message) return null;
  return (
    <div className="absolute top-[calc(max(env(safe-area-inset-top,0px),1.75rem)+4.5rem)] left-3 right-14 z-[60]">
      <div
        className="flex items-start gap-2 px-3 py-2.5 rounded-xl border"
        style={{ borderColor: `${highlightColor}66`, background: 'rgba(10,10,12,0.92)' }}
      >
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: highlightColor }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">3D view couldn't render on this device</p>
          <p className="text-xs text-white/70 mt-1 break-words">{message}</p>
        </div>
        <button onClick={onClose} aria-label="Dismiss" className="p-1 active:scale-90">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>
    </div>
  );
}