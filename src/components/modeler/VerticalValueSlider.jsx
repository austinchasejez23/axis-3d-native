import { useRef } from 'react';
import { hexToHsv, hsvToHex } from '@/lib/color';

// Vertical brightness (intensity) slider: the selected color at the top
// fading to black at the bottom. Drag anywhere on the track. Same 10px
// thickness as the brightness ring it replaces.
export default function VerticalValueSlider({ color, onChange, height = 120, width = 10 }) {
  const trackRef = useRef(null);
  const { h, s, v } = hexToHsv(color || '#000000');
  // Pure black carries no hue, so remember the last real hue/saturation —
  // dragging back up from black returns to the same color.
  const lastHS = useRef({ h, s });
  if (v > 0) lastHS.current = { h, s };
  const fullColor = hsvToHex(lastHS.current.h, lastHS.current.s, 100);

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => {
      const r = trackRef.current.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      onChange(hsvToHex(lastHS.current.h, lastHS.current.s, (1 - t) * 100));
    };
    move(e);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Brightness"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      onPointerDown={onPointerDown}
      className="relative shrink-0 rounded-full cursor-pointer touch-none select-none"
      style={{
        width,
        height,
        background: `linear-gradient(to bottom, ${fullColor}, #000000)`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 h-1.5 w-6 rounded-full bg-white pointer-events-none"
        style={{
          top: `${(1 - v / 100) * 100}%`,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}
