// Screen-center brush-size gauge shown while tuning the Sculpt size slider.
// Purely a visual scale reference — not tied to the model surface, and never
// shown during actual sculpting (only while the slider is being adjusted).
export default function SculptRingOverlay({ visible, pixelRadius, color }) {
  const d = Math.max(8, pixelRadius * 2);
  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
      <div
        className="rounded-full border-2"
        style={{
          width: d,
          height: d,
          borderColor: color,
          opacity: visible ? 0.9 : 0,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  );
}