// Edge fades that hint a strip scrolls sideways. Defaults are the full-strength
// fades the Material and Texture tabs use; pass a smaller width/alpha for a
// slighter hint.
export default function ScrollerTunnelShadows({ width = 32, alpha = 0.82 }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 z-10 pointer-events-none"
        style={{ width, background: `linear-gradient(to right, rgba(0,0,0,${alpha}), rgba(0,0,0,0))` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 z-10 pointer-events-none"
        style={{ width, background: `linear-gradient(to left, rgba(0,0,0,${alpha}), rgba(0,0,0,0))` }}
      />
    </>
  );
}
