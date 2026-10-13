import { useRef } from 'react';
import { hexToHsv, hsvToHex } from '@/lib/color';

export default function ColorPicker({ color, onChange, squareClass = 'aspect-square', showHex = true, verticalHue = false }) {
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const { h, s, v } = hexToHsv(color || '#000000');
  const hueHex = hsvToHex(h, 100, 100);

  const trackPointer = (ref, onMove) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => {
      const rect = ref.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      onMove(x, y);
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onSVDown = trackPointer(svRef, (x, y) => onChange(hsvToHex(h, x * 100, (1 - y) * 100)));
  const onHueDown = trackPointer(hueRef, (x, y) => onChange(hsvToHex((verticalHue ? y : x) * 360, s, v)));

  const hueControl = (
    <div
      ref={hueRef}
      onPointerDown={onHueDown}
      className={`relative shrink-0 rounded-full cursor-pointer touch-none ${verticalHue ? 'w-4 self-stretch' : 'w-full h-3'}`}
      style={{ background: verticalHue
        ? 'linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
        : 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
    >
      <div
        className={`absolute w-4 h-4 rounded-full border-2 border-white shadow pointer-events-none ${verticalHue ? 'left-1/2 -translate-x-1/2 -translate-y-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2'}`}
        style={verticalHue ? { top: `${(h / 360) * 100}%` } : { left: `${(h / 360) * 100}%` }}
      />
    </div>
  );

  return (
    <div className={verticalHue ? 'flex items-stretch gap-2' : 'space-y-2'}>
      {verticalHue && hueControl}
      <div
        ref={svRef}
        onPointerDown={onSVDown}
        className={`relative ${verticalHue ? 'flex-1 min-w-0' : 'w-full'} ${squareClass} rounded-lg cursor-pointer touch-none`}
        style={{
          backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
        }}
      >
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${s}%`, top: `${100 - v}%` }}
        />
      </div>
      {!verticalHue && hueControl}
      {showHex && (
        <input
          aria-label="Hex color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-7 px-2 rounded-md bg-white/10 text-white text-[11px] font-mono outline-none"
        />
      )}
    </div>
  );
}