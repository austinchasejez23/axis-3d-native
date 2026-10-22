import { ENV_URLS } from '@/lib/sceneReflections';
import RoundPresetScroller from './RoundPresetScroller';
import SurfaceSliderRow from './SurfaceSliderRow';
import InlineSlider from './InlineSlider';
import SheetActionButton from './SheetActionButton';

// Material tab, top to bottom: the reflection environments as reflective
// spheres; Soft Norms, Default and Apply; then every material property as an
// inline slider along the bottom of the sheet.
export default function MaterialTabContent({ environments, envId, onEnv, sliders, onSoftNormals, softNormalsOn, tintHue, tintAmount, onTintHue, onTintAmount, onDefault, onApply, canApply }) {
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
    <div className="h-full flex flex-col">
      <RoundPresetScroller items={items} />
      <div className="flex-1 flex items-center gap-1.5">
        {/* Toggle: highlighted while the selected object has soft normals. */}
        <SheetActionButton label="Soft Norms" ariaLabel="Soft normals" active={softNormalsOn} onClick={onSoftNormals} />
        <SheetActionButton label="Default" ariaLabel="Reset material to default" onClick={onDefault} disabled={!canApply} />
        <SheetActionButton label="Apply" ariaLabel="Apply material changes" onClick={onApply} disabled={!canApply} primary />
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
