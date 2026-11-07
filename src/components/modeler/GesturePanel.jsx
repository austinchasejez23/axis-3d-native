import { useTheme, theme } from '@/lib/theme';
import InlineSlider from './InlineSlider';

// Gesture tuning. Each setting is a labelled slider with a short plain-language
// description underneath, so nobody has to guess what a setting does.
function GestureSetting({ label, description, ...slider }) {
  return (
    <div className="py-1.5">
      <InlineSlider label={label} grow {...slider} />
      <p className="mt-1 text-[10px] leading-snug text-white/55">{description}</p>
    </div>
  );
}

export default function GesturePanel() {
  const t = useTheme();
  const reachPct = Math.round(t.gestureSelectReach * 1000) / 10;
  const rotPct = Math.round(t.gestureRotateSensitivity * 100);
  const scalePct = Math.round(t.gestureScaleSensitivity * 100);

  return (
    <div>
      <div className="divide-y divide-white/10">
        <GestureSetting
          label="Grab distance" value={reachPct} display={`${reachPct}%`} min={0.5} max={10} step={0.5}
          onChange={(v) => theme.set({ gestureSelectReach: v / 100 })}
          description="How close to your selection a drag can start and still move it, instead of moving the camera."
        />
        <GestureSetting
          label="Rotation speed" value={rotPct} display={`${rotPct}%`} min={10} max={300} step={5}
          onChange={(v) => theme.set({ gestureRotateSensitivity: v / 100 })}
          description="How fast a selection turns when you rotate it."
        />
        <GestureSetting
          label="Scale speed" value={scalePct} display={`${scalePct}%`} min={10} max={300} step={5}
          onChange={(v) => theme.set({ gestureScaleSensitivity: v / 100 })}
          description="How fast a selection grows or shrinks when you resize it."
        />
        <GestureSetting
          label="Tap steadiness" value={t.gestureMoveThreshold} display={`${t.gestureMoveThreshold}px`} min={2} max={20} step={1}
          onChange={(v) => theme.set({ gestureMoveThreshold: v })}
          description="How far your finger can slide during a tap before it counts as a drag. Higher is more forgiving."
        />
        <GestureSetting
          label="Hold delay" value={t.gestureHoldDelay} display={`${t.gestureHoldDelay}ms`} min={200} max={1200} step={50}
          onChange={(v) => theme.set({ gestureHoldDelay: v })}
          description="How long you press and hold before a hold action starts."
        />
        <GestureSetting
          label="Pinch start" value={t.gesturePinchThreshold} display={`${t.gesturePinchThreshold}px`} min={2} max={24} step={1}
          onChange={(v) => theme.set({ gesturePinchThreshold: v })}
          description="How far your fingers must move together or apart before a pinch begins."
        />
      </div>

      <button
        onClick={() => theme.set({ gestureMoveThreshold: 5, gestureHoldDelay: 400, gestureSelectReach: 0.025, gesturePinchThreshold: 6, gestureRotateSensitivity: 1, gestureScaleSensitivity: 1 })}
        className="mt-1 w-full h-7 rounded-md text-[11px] font-semibold border active:scale-95"
        style={{ color: t.uiColor, borderColor: 'rgba(255,255,255,0.2)' }}
      >
        Reset to defaults
      </button>
    </div>
  );
}
