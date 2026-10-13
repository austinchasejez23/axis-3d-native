import { useTheme } from '@/lib/theme';

// Bespoke tool glyphs styled after the user's reference set: thin white
// line-art 3D geometry with the action part rendered in the app highlight
// color (exactly where the reference shows green). Drop-in replacements for
// lucide icons — same props (className, strokeWidth), color via currentColor.

const Svg = ({ className, strokeWidth = 1.8, children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const useHl = () => useTheme().highlightColor;

// Shared iso-cube outline (white).
const CubeOutline = () => (
  <>
    <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" />
    <path d="M4 7.5 L12 12 L20 7.5 M12 12 V21" />
  </>
);

/* ── Object mode ─────────────────────────────────────────────── */

export function MergeCloseIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M10 4 H4 V20 H16 V14" />
      <g stroke={hl} fill={hl}>
        <circle cx="16" cy="4.5" r="1.4" strokeWidth="0" />
        <circle cx="20.5" cy="9" r="1.4" strokeWidth="0" />
        <path d="M14.5 6 L11 9.5 M11 9.5 h2.6 M11 9.5 v-2.6" fill="none" />
        <path d="M19 10.5 L15.5 14 M15.5 14 h2.6 M15.5 14 v-2.6" fill="none" />
      </g>
    </Svg>
  );
}

export function MirrorIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M12 2.5 v19" strokeDasharray="2.5 2.5" />
      <path d="M9 6.5 L3 8.5 V15.5 L9 17.5 Z" />
      <path d="M15 6.5 L21 8.5 V15.5 L15 17.5 Z" stroke={hl} />
    </Svg>
  );
}

export function SoftNormalsIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      {/* Block profile with a quarter-rounded corner. The curved faces are the action. */}
      <path d="M4 19 V11 C4 7.1 7.1 4 11 4 H20" />
      <path d="M4 19 H20 V4" />
      <path d="M7.5 19 V11.2 C7.5 9.2 9.2 7.5 11.2 7.5 H20" stroke={hl} />
      <path d="M11 4 C7.1 4 4 7.1 4 11 M14 4 C8.5 4 4 8.5 4 14" stroke={hl} />
    </Svg>
  );
}

export function CombineIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M10 3.5 H21 V14.5 H14" />
      <rect x="3" y="9.5" width="11" height="11" stroke={hl} />
    </Svg>
  );
}

export function SeparateIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M9.5 4 H4 V20 H9" />
      <path d="M14.5 4 H20 V20 H15" />
      <path d="M12.5 3.5 L11 8 L13.5 12 L10.5 16 L12 20.5" stroke={hl} />
    </Svg>
  );
}

export function DivideIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <CubeOutline />
      <g stroke={hl}>
        <path d="M8 5.25 L16 9.75 V18.75" />
        <path d="M16 5.25 L8 9.75 V18.75" />
      </g>
    </Svg>
  );
}

export function SmoothIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5 a4.5 8.5 0 0 0 0 17 a4.5 8.5 0 0 0 0 -17" />
      <path d="M3.5 12 a8.5 4.5 0 0 0 17 0" />
      <path d="M3.5 12 a8.5 4.5 0 0 1 17 0" />
    </Svg>
  );
}

export function CloneIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <rect x="3" y="3.5" width="10" height="10" />
      <path d="M8.5 16 h5 m-2 -2.5 L14 16 l-2.5 2.5" />
      <rect x="11" y="10.5" width="10" height="10" stroke={hl} />
    </Svg>
  );
}

export function FaceCloneIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <rect x="3" y="3.5" width="10" height="10" />
      <path d="M8.5 16 h5 m-2 -2.5 L14 16 l-2.5 2.5" />
      <rect x="11" y="10.5" width="10" height="10" stroke={hl} fill={hl} />
    </Svg>
  );
}

export function RadialArrayIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7" strokeDasharray="2 2" />
      <rect x="10" y="2" width="4" height="4" rx="0.5" stroke={hl} />
      <rect x="18" y="10" width="4" height="4" rx="0.5" stroke={hl} />
      <rect x="10" y="18" width="4" height="4" rx="0.5" stroke={hl} />
      <rect x="2" y="10" width="4" height="4" rx="0.5" stroke={hl} />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" strokeWidth="0" />
    </Svg>
  );
}

export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5" />
      <path d="M8.5 10.5 V7.5 a3.5 3.5 0 0 1 7 0 v3" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" strokeWidth="0" />
    </Svg>
  );
}

export function DeleteIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 7 h16" />
      <path d="M9.5 7 V5 a1 1 0 0 1 1 -1 h3 a1 1 0 0 1 1 1 v2" />
      <path d="M6 7 l1 13 h10 l1 -13" />
      <path d="M10 11 v6 M14 11 v6" />
    </Svg>
  );
}

export function SubtractIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="12.5" height="12.5" rx="0.5" fill={hl} stroke="none" />
      <circle cx="15.5" cy="15.5" r="7.6" fill="rgba(0,0,0,0.85)" stroke="none" />
      <circle cx="15.5" cy="15.5" r="6.2" fill="currentColor" stroke="none" />
      <path d="M12.3 15.5 h6.4" stroke="#111" strokeWidth="2" />
    </Svg>
  );
}

export function BooleanIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="12" height="12" rx="1" />
      <circle cx="15.5" cy="15.5" r="6" fill={hl} fillOpacity="0.78" stroke={hl} />
      <path d="M12 15.5 h7 M15.5 12 v7" stroke="#111" strokeWidth="1.6" />
    </Svg>
  );
}

export function UnionIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="12" height="12" rx="1" fill="currentColor" fillOpacity="0.45" />
      <circle cx="15.5" cy="15.5" r="6" fill={hl} fillOpacity="0.85" stroke={hl} />
      <path d="M12 15.5 h7 M15.5 12 v7" stroke="#111" strokeWidth="1.6" />
    </Svg>
  );
}

export function IntersectIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="12" height="12" rx="1" />
      <circle cx="15.5" cy="15.5" r="6" />
      <path d="M9.5 9.5 H15 V15 H9.5 Z" fill={hl} stroke="none" />
    </Svg>
  );
}

// Protractor: a half-disc with degree ticks and a highlight-colored arm.
export function ProtractorIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M2.5 16.5 A9.5 9.5 0 0 1 21.5 16.5 Z" />
      <path d="M5.6 10 l1.5 1 M12 7 v1.8 M18.4 10 l-1.5 1 M8.6 7.9 l0.9 1.5 M15.4 7.9 l-0.9 1.5" />
      <path d="M12 16.5 L18.2 10.3" stroke={hl} />
      <circle cx="12" cy="16.5" r="1.1" fill={hl} strokeWidth="0" />
    </Svg>
  );
}

/* ── Face mode ───────────────────────────────────────────────── */

export function DrawFaceIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M10 9.5 L17 13.5 L10 17.5 L3 13.5 Z" />
      <path d="M21 3 L12.5 11.5" />
      <circle cx="12.5" cy="11.5" r="1.4" fill={hl} strokeWidth="0" />
    </Svg>
  );
}

export function DetachIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      {/* Cube whose top face has lifted off, leaving an open rim. */}
      <path d="M4 13 L10 9.6 L16 13 L10 16.4 Z M4 13 V18.6 L10 22 L16 18.6 V13 M10 16.4 V22" />
      {/* The detached face, solid, floating up and away. */}
      <path d="M8 6 L14 2.6 L20 6 L14 9.4 Z" stroke={hl} fill={hl} />
      <path d="M10 11 L11.5 9.8" stroke={hl} strokeDasharray="1 1.6" />
    </Svg>
  );
}

export function ExtrudeIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M4 12.5 V17 L12 21.5 L20 17 V12.5" />
      <path d="M4 12.5 L12 17 L20 12.5 M12 17 V21.5" />
      <path d="M4 12.5 L12 8 L20 12.5 L12 17 Z" stroke={hl} />
      <path d="M12 6 V1.5 m-2.8 2.8 L12 1.5 l2.8 2.8" />
    </Svg>
  );
}

export function FaceExtrudeIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M4 12.5 V17 L12 21.5 L20 17 V12.5" />
      <path d="M4 12.5 L12 17 L20 12.5 M12 17 V21.5" />
      <path d="M4 12.5 L12 8 L20 12.5 L12 17 Z" stroke={hl} fill={hl} />
      <path d="M12 6 V1.5 m-2.8 2.8 L12 1.5 l2.8 2.8" />
    </Svg>
  );
}

/* ── Edge mode ───────────────────────────────────────────────── */

export function CreateFaceBorderIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M8 6.5 H16 L20.5 17.5 H3.5 Z" fill={hl} fillOpacity="0.9" />
    </Svg>
  );
}

export function EdgeBridgeIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M3 7 H9 M15 7 H21 M3 17 H9 M15 17 H21" />
      <path d="M9 7 L15 7 M9 17 L15 17 M9 7 L9 17 M15 7 L15 17" stroke={hl} />
    </Svg>
  );
}

export function FaceBridgeIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M3 6 L8 3 L13 6 L8 9 Z M11 18 L16 15 L21 18 L16 21 Z" />
      <path d="M8 9 L16 15 M13 6 L21 18" stroke={hl} />
    </Svg>
  );
}

export function AddVertexIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M3.5 16.5 L20.5 7.5" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.7" fill={hl} strokeWidth="0" />
      <path d="M12 3.8 V7.2 M10.3 5.5 H13.7" stroke={hl} strokeWidth="2" />
    </Svg>
  );
}

export function SplitIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <CubeOutline />
      <path d="M12 3 L20 16.5 L12 12 Z" stroke={hl} />
    </Svg>
  );
}

export function DrawCutIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <CubeOutline />
      <path d="M7 6 Q12 11 17 6.5" stroke={hl} />
      <path d="M21.5 2.5 L18 6" />
    </Svg>
  );
}

export function BevelIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      {/* Cube with its front vertical edge chamfered into a highlighted bevel face. */}
      <path d="M4 7.5 L12 3 L20 7.5 L14 11 H10 Z" />
      <path d="M4 7.5 V16.5 L10 20 V11 M20 7.5 V16.5 L14 20 V11" />
      <path d="M10 11 H14 V20 H10 Z" stroke={hl} fill={hl} fillOpacity="0.25" />
    </Svg>
  );
}

export function SelectRingIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <CubeOutline />
      <path d="M4 10 L12 14.5 L20 10" stroke={hl} />
      <path d="M13.5 13 l2 6 l1.2 -2.3 l2.3 -1.2 Z" fill="currentColor" strokeWidth="0" />
    </Svg>
  );
}

export function SelectLoopIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <CubeOutline />
      <path d="M4 7.5 L12 12 V21" stroke={hl} />
      <path d="M13.5 12.5 l2 6 l1.2 -2.3 l2.3 -1.2 Z" fill="currentColor" strokeWidth="0" />
    </Svg>
  );
}

export function CutLoopIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <CubeOutline />
      <path d="M8 5.25 L16 9.75 V18.75 L8 14.25 Z" stroke={hl} />
    </Svg>
  );
}

/* ── Vertex mode ─────────────────────────────────────────────── */

export function CreateFaceVerticesIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M8 7.5 H16 L20 17 H4 Z" />
      <circle cx="4" cy="17" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="20" cy="17" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="8" cy="7.5" r="1.5" fill={hl} strokeWidth="0" />
      <circle cx="16" cy="7.5" r="1.5" fill={hl} strokeWidth="0" />
    </Svg>
  );
}

export function ConnectIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <path d="M5 6.5 H19 M5 17.5 H19" />
      <g stroke={hl}>
        <path d="M12 9 V15" />
        <path d="M9.8 11 L12 8.8 L14.2 11" />
        <path d="M9.8 13 L12 15.2 L14.2 13" />
      </g>
    </Svg>
  );
}

export function TargetMergeIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="18.5" r="1.5" fill="currentColor" strokeWidth="0" />
      <path d="M7.5 16.5 L16 8 M16 8 l-4.2 0.7 M16 8 l-0.7 4.2" />
      <circle cx="19" cy="5" r="2" fill={hl} strokeWidth="0" />
    </Svg>
  );
}

export function MergeIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <circle cx="4.5" cy="18" r="1.4" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="20" r="1.4" fill="currentColor" strokeWidth="0" />
      <circle cx="19.5" cy="18" r="1.4" fill="currentColor" strokeWidth="0" />
      <path d="M6 15.5 L10 9.5 M10 9.5 l-3 0.3 M10 9.5 l-0.3 3" />
      <path d="M18 15.5 L14 9.5 M14 9.5 l3 0.3 M14 9.5 l0.3 3" />
      <circle cx="12" cy="5.5" r="2" fill={hl} strokeWidth="0" />
    </Svg>
  );
}

// Measure: the distance between two tapped points — two dots joined by a
// highlight-colored ruler line with perpendicular tick marks.
export function MeasureIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <circle cx="4.5" cy="19.5" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="19.5" cy="4.5" r="1.5" fill={hl} strokeWidth="0" />
      <g stroke={hl}>
        <path d="M5.6 18.4 L18.4 5.6" />
        <path d="M8.2 14.2 L9.8 15.8 M11.2 11.2 L12.8 12.8 M14.2 8.2 L15.8 9.8" />
      </g>
    </Svg>
  );
}

// Reflection: a sun ray bouncing off a surface — the sun, the incoming ray and
// the surface line in white, the bounced ray and its filled arrowhead in the
// highlight color. Compact variant of the reference (baseline ends align
// with the sun and the bounce path).
export function ReflectionIcon(props) {
  const hl = useHl();
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="4.8" r="2.1" />
      <path d="M7.5 1.2 v1 M7.5 7.4 v1 M3.9 4.8 h1 M10.1 4.8 h1 M9.3 3 l0.7 -0.7 M5.7 3 l-0.7 -0.7 M9.3 6.6 l0.7 0.7 M5.7 6.6 l-0.7 0.7" />
      <path d="M9.2 6.6 L13.4 19.9" />
      <path d="M4.5 20.9 H19" />
      <path d="M13.4 19.9 L17.6 15.7" stroke={hl} />
      <path d="M18.9 14.4 L16.8 14.9 L18.4 16.5 Z" fill={hl} strokeWidth="0" />
    </Svg>
  );
}