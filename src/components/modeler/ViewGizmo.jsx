import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';

// Camera orientation gizmo. X/Y/Z always refer to world axes, not the
// selection's local transform. Colored, lettered disks mark positive axes;
// small hollow disks mark their negative counterparts. It remains display-only
// and follows the camera without causing React re-renders during gestures.
const S = 54, C = S / 2, R = 19;
const AXES = [
  { id: 'x', label: 'X', vector: [1, 0, 0], color: '#f16b6b' },
  { id: 'y', label: 'Y', vector: [0, 1, 0], color: '#64d991' },
  { id: 'z', label: 'Z', vector: [0, 0, 1], color: '#65aaff' },
];
const RINGS = [
  { id: 'equator', point: (a) => [Math.cos(a), 0, Math.sin(a)], opacity: 0.23 },
  { id: 'meridianA', point: (a) => [Math.cos(a), Math.sin(a), 0], opacity: 0.16 },
  { id: 'meridianB', point: (a) => [0, Math.cos(a), Math.sin(a)], opacity: 0.16 },
];

// camera.matrixWorld is column-major: its first three basis columns are the
// camera's right, up and backward vectors in world coordinates. Dotting a
// world-axis direction into them puts the marker in the correct screen position.
function project(vector, e) {
  const [x, y, z] = vector;
  return {
    x: C + (x * e[0] + y * e[1] + z * e[2]) * R,
    y: C - (x * e[4] + y * e[5] + z * e[6]) * R,
    depth: x * e[8] + y * e[9] + z * e[10],
  };
}

function setPosition(node, point) {
  if (!node) return;
  node.setAttribute('cx', String(point.x));
  node.setAttribute('cy', String(point.y));
}

export default function ViewGizmo({ managerRef, coverRef = undefined, hidden = false }) {
  const { highlightColor } = useTheme();
  const svgRef = useRef(null);
  const ringRefs = useRef([]);
  const axisRefs = useRef({});

  useEffect(() => {
    let frame;
    const last = new Float32Array(9).fill(NaN);
    const tick = () => {
      const camera = managerRef.current?.camera;
      if (camera) {
        const e = camera.matrixWorld.elements;
        const current = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
        if (current.some((value, index) => value !== last[index])) {
          current.forEach((value, index) => { last[index] = value; });

          for (let i = 0; i < RINGS.length; i++) {
            const ring = RINGS[i];
            let path = '';
            for (let k = 0; k <= 32; k++) {
              const point = project(ring.point(k * Math.PI / 16), e);
              path += `${k ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
            }
            ringRefs.current[i]?.setAttribute('d', path);
          }

          const ordered = [];
          for (const axis of AXES) {
            const positive = project(axis.vector, e);
            const negative = project(axis.vector.map((value) => -value), e);
            const group = axisRefs.current[axis.id];
            if (!group) continue;

            const positiveLine = group.querySelector('[data-axis-positive-line]');
            const negativeLine = group.querySelector('[data-axis-negative-line]');
            for (const [line, endpoint, opacity] of [
              [positiveLine, positive, positive.depth >= 0 ? 0.95 : 0.4],
              [negativeLine, negative, negative.depth >= 0 ? 0.7 : 0.2],
            ]) {
              if (!line) continue;
              line.setAttribute('x2', String(endpoint.x));
              line.setAttribute('y2', String(endpoint.y));
              line.setAttribute('opacity', String(opacity));
            }

            const positiveDot = group.querySelector('[data-axis-positive-dot]');
            const negativeDot = group.querySelector('[data-axis-negative-dot]');
            const label = group.querySelector('[data-axis-label]');
            setPosition(positiveDot, positive);
            setPosition(negativeDot, negative);
            if (positiveDot) positiveDot.setAttribute('opacity', positive.depth >= 0 ? '1' : '0.48');
            if (negativeDot) negativeDot.setAttribute('opacity', negative.depth >= 0 ? '0.75' : '0.3');
            if (label) {
              label.setAttribute('x', String(positive.x));
              label.setAttribute('y', String(positive.y));
              label.setAttribute('opacity', positive.depth >= 0 ? '1' : '0.65');
            }
            ordered.push({ group, depth: positive.depth });
          }
          // SVG painters order matters where multiple axis markers overlap:
          // the directions facing the camera are painted on top.
          ordered.sort((a, b) => a.depth - b.depth);
          for (const { group } of ordered) svgRef.current?.appendChild(group);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [managerRef]);

  return (
    <svg
      ref={(node) => { svgRef.current = node; if (coverRef) coverRef.current = node; }}
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      className="absolute right-[7px] z-30 pointer-events-none"
      style={{
        // Directly under Undo, above the information button.
        top: 'calc(env(safe-area-inset-top, 0px) + 108px)',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
        visibility: hidden ? 'hidden' : undefined,
      }}
      role="img"
      aria-label="World axis orientation: X red, Y green, Z blue; filled ends are positive and hollow ends are negative."
    >
      <circle cx={C} cy={C} r={R + 5} fill="none" stroke={highlightColor} strokeOpacity="0.28" strokeWidth="0.9" />
      {RINGS.map((ring, index) => (
        <path
          key={ring.id}
          ref={(node) => { ringRefs.current[index] = node; }}
          fill="none"
          stroke="white"
          strokeOpacity={ring.opacity}
          strokeWidth="0.9"
        />
      ))}
      {AXES.map((axis) => (
        <g key={axis.id} ref={(node) => { axisRefs.current[axis.id] = node; }}>
          <line data-axis-negative-line x1={C} y1={C} x2={C} y2={C} stroke={axis.color} strokeWidth="1.2" strokeDasharray="2 2" />
          <line data-axis-positive-line x1={C} y1={C} x2={C} y2={C} stroke={axis.color} strokeWidth="1.7" />
          <circle data-axis-negative-dot cx={C} cy={C} r="3.3" fill="#15191f" stroke={axis.color} strokeWidth="1.3" />
          <circle data-axis-positive-dot cx={C} cy={C} r="6.4" fill={axis.color} stroke="#10151c" strokeWidth="0.9" />
          <text data-axis-label x={C} y={C} dominantBaseline="central" textAnchor="middle" fill="#10151c" fontSize="9" fontWeight="800">
            {axis.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
