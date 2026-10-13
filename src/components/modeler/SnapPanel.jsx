import { useState } from 'react';
import { Magnet, Check, X } from 'lucide-react';
import { useTheme, theme } from '@/lib/theme';
import { fromDisplayUnit, toDisplayUnit } from '@/lib/units';
import HorizontalChevronStepper from './HorizontalChevronStepper';
import ModelingPanel from '@/components/modeler/ModelingPanel';

// Docked the same way as Bevel/Cut/Radial Array/Sculpt: a full-width bar
// anchored to the bottom of the viewport, icon + title on the left, the
// same X/Check action pair on the right as every other tool panel, and the
// same modeling-value styling for the controls underneath. Changes take effect
// immediately; Check keeps them and X restores the values the panel opened with.
export default function SnapPanel({ onClose }) {
  const t = useTheme();
  const [keypadOpen, setKeypadOpen] = useState(null);
  const [initial] = useState(() => ({ snapDistance: t.snapDistance, snapAngle: t.snapAngle }));
  const cancel = () => { theme.set(initial); onClose(); };

  return (
    <ModelingPanel label="Snapping controls" keypadOpen={!!keypadOpen}>
      <div className="py-1.5">
        <div className="mb-1.5 flex items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: t.uiColor }}>
            <Magnet className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Snapping</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel snapping changes"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: t.uiColor }}
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Done with snapping settings"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: t.highlightColor, borderColor: t.highlightColor }}
            >
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="modeling-value grid grid-cols-2 rounded-lg px-2 py-2">
          <div className="min-w-0 border-r border-white/15 pr-4">
            <div className="mb-1 text-[12px] font-semibold" style={{ color: t.uiColor }}>Distance ({t.unit})</div>
            <HorizontalChevronStepper
              label="Snap distance"
              value={toDisplayUnit(t.snapDistance, t.unit)}
              onChange={(v) => theme.set({ snapDistance: fromDisplayUnit(v, t.unit) })}
              step={t.unit === 'in' ? 0.05 : 0.5}
              decimals={3}
              min={0}
              max={toDisplayUnit(20, t.unit)}
              color={t.uiColor}
              highlightColor={t.highlightColor}
              appearance="radial"
              keypadOpen={keypadOpen === 'distance'}
              onKeypadOpen={(open = true) => setKeypadOpen(open ? 'distance' : null)}
            />
          </div>
          <div className="min-w-0 pl-4">
            <div className="mb-1 text-[12px] font-semibold" style={{ color: t.uiColor }}>Angle (°)</div>
            <HorizontalChevronStepper
              label="Snap angle"
              value={t.snapAngle}
              onChange={(v) => theme.set({ snapAngle: v })}
              step={1}
              min={0}
              max={180}
              color={t.uiColor}
              highlightColor={t.highlightColor}
              appearance="radial"
              keypadOpen={keypadOpen === 'angle'}
              onKeypadOpen={(open = true) => setKeypadOpen(open ? 'angle' : null)}
            />
          </div>
        </div>
      </div>
    </ModelingPanel>
  );
}
