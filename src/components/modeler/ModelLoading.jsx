// Shown while a saved model is being opened: the AXIS arrows turning in the
// middle of the screen, with no background, so a long load does not look
// like a crash.
const ARROW_COLOR = '#1AC0FF';

export default function ModelLoading() {
  return (
    <div role="status" aria-label="Loading model" className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
      <div className="h-[180px] w-[180px] animate-spin" style={{ animationDuration: '1.2s' }}>
        <svg
          viewBox="-235 -235 470 470"
          className="h-full w-full"
          style={{ filter: `drop-shadow(0 0 6px ${ARROW_COLOR}cc) drop-shadow(0 0 16px ${ARROW_COLOR}66)` }}
          aria-hidden="true"
        >
          <g stroke={ARROW_COLOR} strokeWidth="8" strokeLinecap="butt" fill="none">
            <line x1="0" y1="0" x2="0" y2="-76" />
            <line x1="0" y1="-83" x2="0" y2="-89" />
            <line x1="0" y1="-96" x2="0" y2="-99" />
            <line x1="0" y1="-106" x2="0" y2="-112" />
            <line x1="0" y1="-119" x2="0" y2="-125" />
            <line x1="0" y1="-133" x2="0" y2="-203" />
            <line x1="0" y1="0" x2="-69.1" y2="31.64" />
            <line x1="-74.56" y1="34.14" x2="-80.92" y2="37.05" />
            <line x1="-86.38" y1="39.55" x2="-92.74" y2="42.46" />
            <line x1="-99.11" y1="45.37" x2="-154.57" y2="70.77" />
            <line x1="0" y1="0" x2="69.1" y2="31.64" />
            <line x1="74.56" y1="34.14" x2="80.92" y2="37.05" />
            <line x1="86.38" y1="39.55" x2="92.74" y2="42.46" />
            <line x1="99.11" y1="45.37" x2="154.57" y2="70.77" />
          </g>
          <g fill={ARROW_COLOR}>
            <circle cx="0" cy="0" r="4" />
            <polygon points="0,-229 17,-201 -17,-201" />
            <polygon points="-178.21,81.59 -159.83,54.48 -145.67,85.39" />
            <polygon points="178.21,81.59 145.67,85.39 159.83,54.48" />
          </g>
        </svg>
      </div>
    </div>
  );
}
