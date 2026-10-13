import { useState } from 'react';
import { useTheme, theme } from '@/lib/theme';
import SliderRowButton from './SliderRowButton';

// Manual gesture-control tuning: the tap-select buffer distance, rotation and
// scale sensitivity, plus the underlying tap / hold / pinch calibration.
export default function GesturePanel() {
  const t = useTheme();
  const [open, setOpen] = useState(null);
  const toggle = (id) => setOpen((v) => (v === id ? null : id));
  const reachPct = Math.round(t.gestureSelectReach * 1000) / 10;
  const rotPct = Math.round(t.gestureRotateSensitivity * 100);
  const scalePct = Math.round(t.gestureScaleSensitivity * 100);

  return (
    <div style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}>
      <div className="divide-y divide-white/10">
        <SliderRowButton
          variant="flat" floating
          label="Select buffer" value={reachPct} display={`${reachPct}%`} min={0.5} max={10} step={0.5}
          active={open === 'reach'} onToggle={() => toggle('reach')}
          onChange={(v) => theme.set({ gestureSelectReach: v / 100 })} length={110}
        />
        <SliderRowButton
          variant="flat" floating
          label="Rotation speed" value={rotPct} display={`${rotPct}%`} min={10} max={300} step={5}
          active={open === 'rotate'} onToggle={() => toggle('rotate')}
          onChange={(v) => theme.set({ gestureRotateSensitivity: v / 100 })} length={110}
        />
        <SliderRowButton
          variant="flat" floating
          label="Scale speed" value={scalePct} display={`${scalePct}%`} min={10} max={300} step={5}
          active={open === 'scale'} onToggle={() => toggle('scale')}
          onChange={(v) => theme.set({ gestureScaleSensitivity: v / 100 })} length={110}
        />
        <SliderRowButton
          variant="flat" floating
          label="Tap tolerance" value={t.gestureMoveThreshold} display={`${t.gestureMoveThreshold}px`} min={2} max={20} step={1}
          active={open === 'tap'} onToggle={() => toggle('tap')}
          onChange={(v) => theme.set({ gestureMoveThreshold: v })} length={110}
        />
        <SliderRowButton
          variant="flat" floating
          label="Hold delay" value={t.gestureHoldDelay} display={`${t.gestureHoldDelay}ms`} min={200} max={1200} step={50}
          active={open === 'hold'} onToggle={() => toggle('hold')}
          onChange={(v) => theme.set({ gestureHoldDelay: v })} length={110}
        />
        <SliderRowButton
          variant="flat" floating
          label="Pinch threshold" value={t.gesturePinchThreshold} display={`${t.gesturePinchThreshold}px`} min={2} max={24} step={1}
          active={open === 'pinch'} onToggle={() => toggle('pinch')}
          onChange={(v) => theme.set({ gesturePinchThreshold: v })} length={110}
        />
      </div>

      <button
        onClick={() => theme.set({ gestureMoveThreshold: 5, gestureHoldDelay: 500, gestureSelectReach: 0.025, gesturePinchThreshold: 6, gestureRotateSensitivity: 1, gestureScaleSensitivity: 1 })}
        className="mt-1 w-full h-7 rounded-md text-[11px] font-semibold border active:scale-95"
        style={{ color: t.uiColor, borderColor: 'rgba(255,255,255,0.2)' }}
      >
        Reset to defaults
      </button>
    </div>
  );
}