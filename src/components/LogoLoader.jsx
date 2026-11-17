// The app's loading animation: a cube like the app icon (black, with glowing
// blue edges) turning in place about its upright axis, so each side comes
// round in turn. `label` (optional) sits under it. When it isn't spinning,
// `turn` sets the cube's angle in degrees (the Library's pull to refresh turns
// it with the pull).
const EDGE = '62, 168, 255';
const FACES = ['rotateY(0deg)', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'];

export default function LogoLoader({ width = 120, label = '', spinning = true, turn = 0, style = undefined, className = '' }) {
  const size = Math.round(width / 1.6);
  const inset = Math.max(2, Math.round(size * 0.07));
  const line = Math.max(1.5, size * 0.03);
  const glow = Math.max(3, size * 0.09);
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} style={style}>
      <div aria-hidden="true" className="flex items-center justify-center" style={{ width, height: Math.round(size * 1.5), perspective: size * 5 }}>
        <div style={{ width: size, height: size, position: 'relative', transformStyle: 'preserve-3d', transform: 'rotateX(-24deg)' }}>
          <div
            className={spinning ? 'axis-cube-turn' : ''}
            style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: spinning ? undefined : `rotateY(${turn}deg)` }}
          >
            {FACES.map((face) => (
              <div
                key={face}
                style={{
                  position: 'absolute', inset: 0, boxSizing: 'border-box', padding: inset,
                  transform: `${face} translateZ(${size / 2}px)`, backfaceVisibility: 'hidden',
                  background: 'linear-gradient(145deg, #10141c, #05070b)',
                }}
              >
                <div style={{
                  width: '100%', height: '100%', boxSizing: 'border-box',
                  border: `${line}px solid rgb(${EDGE})`,
                  boxShadow: `0 0 ${glow}px rgba(${EDGE}, 0.9), inset 0 0 ${glow}px rgba(${EDGE}, 0.45)`,
                }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {label && <span className="text-sm font-medium text-white">{label}</span>}
    </div>
  );
}
