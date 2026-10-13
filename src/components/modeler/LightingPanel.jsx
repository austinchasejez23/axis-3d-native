import { useEffect, useRef, useState } from 'react';
import { Check, Flashlight, Lightbulb, Sun, X } from 'lucide-react';
import { theme, useTheme } from '@/lib/theme';
import { hexToHsv, hsvToHex } from '@/lib/color';
import ModelingPanel from '@/components/modeler/ModelingPanel';
import InlineSlider from '@/components/modeler/InlineSlider';
import RoundColorPicker from '@/components/modeler/RoundColorPicker';

const TYPES = [
  { id: 'spot', label: 'Spot', Icon: Flashlight },
  { id: 'point', label: 'Point', Icon: Lightbulb },
  { id: 'directional', label: 'Directional', Icon: Sun },
];

// Lighting: same docked sheet as the other tool panels. Every change applies
// live; Check keeps it, X puts the lights back the way they were on opening.
export default function LightingPanel({ state, managerRef, onClose }) {
  const { uiColor, highlightColor, defaultLightingEnabled } = useTheme();
  const [opening] = useState(() => {
    const manager = managerRef.current;
    return manager ? { lights: manager.serializeSceneLights(), selectedId: manager.selectedLightId } : null;
  });
  // Small color wheel that pops up at the left, above the panel (the phone's
  // own color picker covered the whole viewport).
  const [wheelOpen, setWheelOpen] = useState(false);
  const wheelRef = useRef(null);
  const swatchRef = useRef(null);
  useEffect(() => {
    if (!wheelOpen) return undefined;
    const closeOnOutsideTap = (event) => {
      // The swatch toggles the wheel itself; every other tap outside closes it.
      if (wheelRef.current?.contains(event.target) || swatchRef.current?.contains(event.target)) return;
      setWheelOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideTap, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsideTap, true);
  }, [wheelOpen]);
  const light = state?.selected;
  if (!light) return null;
  const manager = managerRef.current;

  const begin = (active) => { if (active) manager?.beginSceneLightControl(); };
  const change = (patch, recordUndo = false) => manager?.updateSelectedSceneLight(patch, recordUndo);
  const cancel = () => {
    if (manager && opening && JSON.stringify(manager.serializeSceneLights()) !== JSON.stringify(opening.lights)) {
      manager.pushUndo();
      manager.restoreSceneLights(opening.lights, opening.selectedId);
      manager.applyShadows();
      manager.editVersion = (manager.editVersion || 0) + 1;
    }
    onClose();
  };

  // Default lighting on shows the fixed studio wash on its own, with the
  // user's own lights kept but switched off. Every control stays live: the
  // first change to a light turns Default off and brings that lighting back.
  const spot = light.type === 'spot';
  const hue = Math.round(hexToHsv(light.color).h);
  const actionBtn = 'modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95';
  const rowBtn = 'modeling-value flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 text-[12px] font-semibold active:scale-95 disabled:opacity-35';
  const lightCount = state.lights.length;

  return (
    <ModelingPanel label="Lighting controls" keypadOpen={false} docked>
      {wheelOpen && (
        <div ref={wheelRef} className="modeling-sheet absolute bottom-[calc(100%+0.5rem)] left-1.5 rounded-2xl p-2"
          onPointerDownCapture={() => begin(true)}>
          <RoundColorPicker color={light.color} onChange={(color) => change({ color })} size={136} />
        </div>
      )}
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Sun className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Lighting</h2>
            {lightCount > 1 && (
              <span className="ml-1 text-[12px] font-semibold leading-none tabular-nums" style={{ opacity: 0.6 }}>
                Light {state.selectedIndex + 1} of {lightCount}
              </span>
            )}
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={cancel} aria-label="Cancel lighting changes" className={actionBtn} style={{ color: uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={onClose} aria-label="Apply lighting" className={actionBtn} style={{ color: highlightColor, borderColor: highlightColor }}>
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
            {TYPES.map(({ id, label, Icon }) => {
              const active = light.type === id;
              return (
                <button key={id} type="button" onClick={() => change({ type: id }, true)} aria-pressed={active}
                  className={rowBtn} style={{ color: active ? highlightColor : uiColor, borderColor: active ? highlightColor : undefined }}>
                  <Icon className="h-4 w-4 shrink-0 max-[359px]:hidden" strokeWidth={1.8} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
          <button ref={swatchRef} type="button" onClick={() => setWheelOpen((open) => !open)} aria-label="Pick light color" aria-expanded={wheelOpen}
            className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
            style={{ borderColor: wheelOpen ? highlightColor : undefined }}>
            <span className="h-5 w-5 rounded-full" style={{ background: light.color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)' }} />
          </button>
        </div>

        <div className="modeling-value mb-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg px-2.5 py-2">
          <InlineSlider grow compact label="Intensity" value={light.intensity} display={light.intensity.toFixed(2)} min={0} max={5} step={0.05}
            onChange={(intensity) => change({ intensity })} onActiveChange={begin} />
          <InlineSlider grow compact label="Range" value={light.range} display={light.range.toFixed(1)} min={1} max={50} step={0.5}
            onChange={(range) => change({ range })} onActiveChange={begin} />
          <InlineSlider grow compact label={spot ? 'Cone' : 'Radius'} value={light.radius} display={spot ? `${Math.round(light.radius)}°` : light.radius.toFixed(1)}
            min={spot ? 5 : 0.1} max={spot ? 85 : 5} step={spot ? 1 : 0.1} disabled={light.type === 'directional'}
            onChange={(radius) => change({ radius })} onActiveChange={begin} />
          <InlineSlider grow compact label="Shadow" value={Math.round(light.shadowIntensity * 100)} display={`${Math.round(light.shadowIntensity * 100)}%`} min={0} max={100}
            disabled={!light.shadows} onChange={(value) => change({ shadowIntensity: value / 100 })} onActiveChange={begin} />
          <InlineSlider grow compact hue label="Hue" value={hue} display={`${hue}°`} min={0} max={360}
            onChange={(value) => change({ color: hsvToHex(value, 100, 100) })} onActiveChange={begin} />
          <InlineSlider grow compact label="Color intensity" value={Math.round(light.colorIntensity * 100)} display={`${Math.round(light.colorIntensity * 100)}%`} min={0} max={100}
            onChange={(value) => change({ colorIntensity: value / 100 })} onActiveChange={begin} />
        </div>

        <div className="grid grid-cols-4 gap-1">
          <button type="button" onClick={() => change({ shadows: !light.shadows }, true)} aria-pressed={!!light.shadows} aria-label="Toggle shadows"
            className={rowBtn} style={{ color: light.shadows ? highlightColor : uiColor, borderColor: light.shadows ? highlightColor : undefined }}>
            <span className="truncate">Shadows</span>
          </button>
          <button type="button" onClick={() => manager?.duplicateSelectedSceneLight()} aria-label="Duplicate light" className={rowBtn} style={{ color: uiColor }}>
            <span className="truncate">Duplicate</span>
          </button>
          <button type="button" disabled={lightCount <= 1} onClick={() => manager?.deleteSelectedSceneLight()} aria-label="Delete light" className={rowBtn} style={{ color: uiColor }}>
            <span className="truncate">Delete</span>
          </button>
          <button type="button" onClick={() => theme.set({ defaultLightingEnabled: !defaultLightingEnabled })}
            aria-pressed={defaultLightingEnabled} aria-label="Toggle default lighting"
            className={rowBtn} style={{ color: defaultLightingEnabled ? highlightColor : uiColor, borderColor: defaultLightingEnabled ? highlightColor : undefined }}>
            <span className="truncate">Default</span>
          </button>
        </div>
      </div>
    </ModelingPanel>
  );
}
