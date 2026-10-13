import { useRef } from 'react';
import { hexToHsv, hsvToHex } from '@/lib/color';

// Round color picker: a full-spectrum HSV wheel (hue = angle, saturation =
// distance from the center) wrapped in a 360° ring that acts as the brightness
// slider — it starts at the selected color and fades to black around the loop.
const RING = 10;

// ring={false} drops the brightness ring so the wheel fills the whole size
// (Paint pairs it with a separate vertical brightness slider instead).
export default function RoundColorPicker({ color, onChange, size = 130, ring = true }) {
  const wheelRef = useRef(null);
  const ringRef = useRef(null);
  const { h, s, v } = hexToHsv(color || '#000000');
  const fullColor = hsvToHex(h, s, 100);

  const track = (ref, handler) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => {
      const r = ref.current.getBoundingClientRect();
      handler(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2), r.width / 2);
    };
    move(e);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Clockwise from straight up, matching a CSS conic gradient.
  const angleOf = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

  const onWheelDown = track(wheelRef, (dx, dy, radius) => {
    const dist = Math.min(1, Math.hypot(dx, dy) / radius);
    onChange(hsvToHex(angleOf(dx, dy), dist * 100, v));
  });
  const onRingDown = track(ringRef, (dx, dy) => {
    onChange(hsvToHex(h, s, 100 - (angleOf(dx, dy) / 360) * 100));
  });

  const innerInset = ring ? RING + 4 : 0;
  const wheelSize = size - innerInset * 2;
  const rad = (deg) => (deg - 90) * Math.PI / 180;
  const thumbAngle = rad(h);
  const thumbDist = (s / 100) * (wheelSize / 2);
  const ringDegrees = (1 - v / 100) * 360;
  const ringAngle = rad(ringDegrees);
  const ringRadius = (size - RING) / 2;

  return (
    <div className="relative touch-none select-none" style={{ width: size, height: size }}>
      {ring && <div
        ref={ringRef}
        onPointerDown={onRingDown}
        className="absolute inset-0 rounded-full cursor-pointer"
        style={{
          background: `conic-gradient(${fullColor} 0deg, #000000 360deg)`,
          WebkitMask: `radial-gradient(circle closest-side, transparent calc(100% - ${RING}px), #000 calc(100% - ${RING}px))`,
          mask: `radial-gradient(circle closest-side, transparent calc(100% - ${RING}px), #000 calc(100% - ${RING}px))`,
        }}
      />}
      <div
        ref={wheelRef}
        onPointerDown={onWheelDown}
        className="absolute rounded-full cursor-pointer overflow-hidden"
        style={{
          inset: innerInset,
          backgroundImage:
            'radial-gradient(circle closest-side, #ffffff, rgba(255,255,255,0) 70%), conic-gradient(#ff0000 0deg, #ffff00 60deg, #00ff00 120deg, #00ffff 180deg, #0000ff 240deg, #ff00ff 300deg, #ff0000 360deg)',
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: '#000000', opacity: 1 - v / 100 }}
        />
        <span
          aria-hidden="true"
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: wheelSize / 2 + Math.cos(thumbAngle) * thumbDist,
            top: wheelSize / 2 + Math.sin(thumbAngle) * thumbDist,
          }}
        />
      </div>
      {ring && <span
        aria-hidden="true"
        className="absolute w-1.5 h-6 rounded-full bg-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: size / 2 + Math.cos(ringAngle) * ringRadius,
          top: size / 2 + Math.sin(ringAngle) * ringRadius,
          transform: `translate(-50%, -50%) rotate(${ringDegrees}deg)`,
        }}
      />}
    </div>
  );
}