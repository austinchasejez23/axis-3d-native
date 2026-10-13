export default function ModelingPanel({ label, keypadOpen, docked = false, children }) {
  const restingBottom = docked ? 'calc(0.375rem + var(--axis-safe-bottom, env(safe-area-inset-bottom, 0px)))' : 'calc(4.375rem + var(--axis-safe-bottom, env(safe-area-inset-bottom, 0px)))';
  return (
    <section aria-label={label} className="modeling-panel absolute left-0 right-0 z-[70] px-1.5 pointer-events-auto"
      style={{ bottom: keypadOpen ? 'var(--modeling-keypad-height, 10.5rem)' : restingBottom }}
      onPointerDown={(event) => event.stopPropagation()}>
      <div className="modeling-sheet rounded-2xl px-2">{children}</div>
    </section>
  );
}