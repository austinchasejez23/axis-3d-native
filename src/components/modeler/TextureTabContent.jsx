import { useState, useEffect, useRef } from 'react';
import { Plus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/lib/theme';
import { TEXTURE_PRESETS } from '@/lib/texturePresets';
import RoundPresetScroller from './RoundPresetScroller';
import SurfaceSliderRow from './SurfaceSliderRow';
import InlineSlider from './InlineSlider';
import WrapModePicker from './WrapModePicker';
import SheetActionButton from './SheetActionButton';

// Texture tab, top to bottom: None, Add (upload) and every texture preset as
// round thumbnails; Merge, Seamless, Wrap and Apply; then Scale / Rotation /
// Opacity sliders along the bottom of the sheet. `onChange` tells the sheet
// something changed, so Apply and the checkmark know there is work to keep.
export default function TextureTabContent({ meshId, managerRef, opacity, onOpacity, onChange, onApply, canApply }) {
  const { highlightColor } = useTheme();
  const fileInputRef = useRef(null);
  const [scale, setScale] = useState(0.25);
  const [rotation, setRotation] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [mergeColor, setMergeColor] = useState(false);
  const [uvMode, setUvMode] = useState('box');
  const [wrapOpen, setWrapOpen] = useState(false);
  const [activeUrl, setActiveUrl] = useState(null);

  useEffect(() => {
    const mesh = managerRef.current?.getMesh(meshId);
    const t = mesh?.textureTransform;
    setScale(t?.scale ?? 0.25);
    setRotation(((t?.rotation ?? 0) * 180) / Math.PI);
    setMirror(!!t?.mirror);
    setMergeColor(!!mesh?.textureMergeColor);
    setUvMode(mesh?.uvMode || 'box');
  }, [meshId, managerRef]);

  const applyScale = (v) => { setScale(v); managerRef.current?.setTextureScale(meshId, v); onChange?.(); };
  const applyRotation = (deg) => { setRotation(deg); managerRef.current?.setTextureRotation(meshId, (deg * Math.PI) / 180); onChange?.(); };
  const applyUvMode = (m) => { setUvMode(m); managerRef.current?.setUVMode(m); onChange?.(); };
  const applyMirror = () => { const on = !mirror; setMirror(on); managerRef.current?.setTextureMirror(meshId, on); onChange?.(); };
  const applyMerge = () => { const on = !mergeColor; setMergeColor(on); managerRef.current?.setTextureMergeColor(on); onChange?.(); };
  const changeOpacity = (v) => { onOpacity(v); onChange?.(); };

  const items = [
    { id: 'none', label: 'None', icon: Ban, onClick: () => { managerRef.current?.clearTexture(); setActiveUrl(null); onChange?.(); toast.success('Texture removed'); } },
    { id: 'add', label: 'Add', icon: Plus, onClick: () => fileInputRef.current?.click() },
    ...TEXTURE_PRESETS.map((t) => ({
      id: t.id,
      label: t.label,
      image: t.url,
      sphere: true,
      active: activeUrl === t.url,
      onClick: () => {
        if (managerRef.current?.applyTextureUrl(t.url)) { setActiveUrl(t.url); onChange?.(); toast.success(`${t.label} applied`); }
        else toast.error('Select an object first');
      },
    })),
  ];

  const chip = (label, active, onClick) => (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="h-8 min-w-0 flex-1 px-1 rounded-lg text-[13px] font-medium whitespace-nowrap truncate active:scale-95"
      style={{ color: active ? highlightColor : 'rgba(255,255,255,0.85)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (managerRef.current?.applyTextureToSelection(f)) { setActiveUrl(null); onChange?.(); toast.success('Texture applied'); }
            else toast.error('Select an object first');
          }
          e.target.value = '';
        }}
      />
      <RoundPresetScroller items={items} />
      <div className="relative flex-1 flex items-center gap-1.5">
        {chip('Merge', mergeColor, applyMerge)}
        {chip('Seamless', mirror, applyMirror)}
        {chip('Wrap', wrapOpen, () => setWrapOpen((v) => !v))}
        <SheetActionButton label="Apply" ariaLabel="Apply texture changes" onClick={onApply} disabled={!canApply} primary />
        {wrapOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-10">
            <WrapModePicker mode={uvMode} onMode={(m) => { applyUvMode(m); setWrapOpen(false); }} />
          </div>
        )}
      </div>
      <SurfaceSliderRow scrollPadTop>
        <InlineSlider label="Scale" value={scale} display={scale.toFixed(2)} min={0.1} max={8} step={0.05} onChange={applyScale} />
        <InlineSlider label="Rotation" value={rotation} display={`${Math.round(rotation)}°`} min={0} max={360} onChange={applyRotation} />
        <InlineSlider label="Opacity" value={opacity} min={0} max={100} onChange={changeOpacity} />
      </SurfaceSliderRow>
    </div>
  );
}