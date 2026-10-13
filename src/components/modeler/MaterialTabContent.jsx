import { SoftNormalsIcon } from '@/lib/toolIcons';
import { useTheme } from '@/lib/theme';
import { ENV_URLS } from '@/lib/sceneReflections';
import RoundPresetScroller from './RoundPresetScroller';
import SurfaceSliderRow from './SurfaceSliderRow';
import InlineSlider from './InlineSlider';

// Material tab: the reflection environments as reflective spheres (with the
// Soft Norms icon button beside them), then every material property as an
// inline slider.
export default function MaterialTabContent({ environments, envId, onEnv, sliders, onSoftNormals, softNormalsOn, tintHue, tintAmount, onTintHue, onTintAmount }) {
  const { uiColor, highlightColor } = useTheme();
  const items = environments.map((e) => ({
    id: e.id,
    label: e.label,
    image: ENV_URLS[e.id],
    zoom: 1.9,
    sphere: true,
    background: e.id === 'none' ? 'radial-gradient(circle at 40% 35%, #f2f2f2, #8a8a8a 70%, #3a3a3a)' : undefined,
    active: envId === e.id,
    onClick: () => onEnv(e.id),
  }));
  return (
    <div>
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <RoundPresetScroller items={items} />
        </div>
        <button
          type="button"
          onClick={onSoftNormals}
          aria-label={softNormalsOn ? 'Hard normals' : 'Soft normals'}
          aria-pressed={softNormalsOn}
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg active:scale-95 transition-all"
          style={{ color: softNormalsOn ? highlightColor : uiColor, textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}
        >
          <SoftNormalsIcon className="h-7 w-7" strokeWidth={1.3} />
        </button>
      </div>
      <SurfaceSliderRow scrollPadTop>
        {sliders.map((s) => (
          <InlineSlider key={s.id} label={s.label} value={s.value} min={0} max={100} onChange={s.onChange} />
        ))}
        <InlineSlider label="Tint" value={tintHue} display="Hue" min={0} max={360} onChange={onTintHue} hue />
        <InlineSlider label="Tint amount" value={tintAmount} min={0} max={100} onChange={onTintAmount} />
      </SurfaceSliderRow>
    </div>
  );
}