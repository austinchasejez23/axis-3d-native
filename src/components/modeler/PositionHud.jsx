import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';
import { toDisplayUnit, formatValue3 } from '@/lib/units';

// Every transform HUD readout is limited to 0.000 resolution.
const AXES = ['x', 'y', 'z'];

function HudValue({ value, axis, activeAxis, color, highlightColor }) {
  const sh = '0 1px 3px rgba(0,0,0,0.5)';
  return <span style={{ color: activeAxis === axis ? highlightColor : color, textShadow: sh }} className="inline-block min-w-[5ch] tabular-nums">{formatValue3(value)}</span>;
}

// Context-aware HUD: position while moving, rotation while rotating, dimensions
// while scaling. Tapping it opens the full transform drawer for typed values.
export default function PositionHud({ hud, onOpenTransform }) {
  const { uiColor, highlightColor, unit } = useTheme();
  const h = hud || { action: 'idle', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, activeAxis: null };
  const { action, activeAxis } = h;
  const [mode, setMode] = useState('position');
  // Remember the most recently manipulated axis for each readout mode.
  const lastAxis = useRef({ position: 0, rotation: 0, scale: 0 });

  // A gesture (drag / twist / pinch) shows its own readout live and the HUD then
  // STAYS on it once the gesture ends, so the last movement's values remain on
  // screen instead of snapping back to position.
  const gestureDisplay = action === 'scale' ? 'scale' : action === 'rotate' ? 'rotation' : action === 'move' ? 'position' : null;
  useEffect(() => { if (gestureDisplay) setMode(gestureDisplay); }, [gestureDisplay]);
  const display = gestureDisplay || mode;
  if (activeAxis && AXES.includes(activeAxis)) {
    lastAxis.current[display] = AXES.indexOf(activeAxis);
  }
  const sh = '0 1px 3px rgba(0,0,0,0.5)';

  const rows = display === 'scale'
    ? [{ label: 'W', v: toDisplayUnit(h.sx, unit) }, { label: 'H', v: toDisplayUnit(h.sy, unit) }, { label: 'D', v: toDisplayUnit(h.sz, unit) }]
    : display === 'rotation'
      ? [{ label: 'X', v: h.rx }, { label: 'Y', v: h.ry }, { label: 'Z', v: h.rz }]
      : [{ label: 'X', v: toDisplayUnit(h.x, unit) }, { label: 'Y', v: toDisplayUnit(h.y, unit) }, { label: 'Z', v: toDisplayUnit(h.z, unit) }];

  const openValues = () => onOpenTransform?.({
    section: display === 'scale' ? 'dimensions' : display,
    index: lastAxis.current[display],
  });

  const toggleLabel = display === 'scale' ? 'D' : display === 'rotation' ? 'R' : 'P';
  const unitTag = display === 'rotation' ? '°' : unit;

  return (
    <div className="pointer-events-auto h-7 px-2 flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 font-mono text-[10px] leading-none whitespace-nowrap">
        <div className="flex items-center gap-1">
          <button
            className="pointer-events-auto self-start text-[9px] font-bold"
            style={{ color: highlightColor, textShadow: sh }}
            onClick={() => setMode(display === 'position' ? 'rotation' : display === 'rotation' ? 'scale' : 'position')}
          >
            {toggleLabel}
          </button>
          <span className="text-[8px]" style={{ color: uiColor, opacity: 0.6, textShadow: sh }}>{unitTag}</span>
        </div>
        <button type="button" className="flex items-center gap-1.5 font-mono leading-none whitespace-nowrap" onClick={openValues} aria-label="Open transform values">
          {rows.map((r, i) => {
            const axis = display === 'scale' ? AXES[i] : r.label.toLowerCase();
            return (
              <span key={i} className="flex items-center gap-1">
                <span className="text-[8px] w-2 text-center" style={{ color: uiColor, opacity: 0.6, textShadow: sh }}>{r.label}</span>
                <HudValue value={r.v} axis={axis} activeAxis={activeAxis} color={uiColor} highlightColor={highlightColor} />
              </span>
            );
          })}
        </button>
      </div>
    </div>
  );
}