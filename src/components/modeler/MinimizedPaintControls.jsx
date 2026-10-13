import { X } from 'lucide-react';

export default function MinimizedPaintControls({ color, onReopen, onClose }) {
  return (
    <div
      data-minimized-paint
      className="absolute right-2 bottom-[3.75rem] z-40 safe-bottom flex items-center gap-1.5 pointer-events-auto"
    >
      <button
        onClick={onReopen}
        aria-label="Reopen Paint"
        className="w-10 h-10 rounded-full border-2 border-white shadow-lg active:scale-95"
        style={{ background: color }}
      />
      <button
        onClick={onClose}
        aria-label="Close Paint"
        className="w-9 h-9 rounded-full flex items-center justify-center text-white border border-white/30 bg-black/80 active:scale-95"
      >
        <X className="w-5 h-5" strokeWidth={2} />
      </button>
    </div>
  );
}