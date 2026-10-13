import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/lib/theme';
import SculptRingOverlay from './SculptRingOverlay';
import SurfaceSheetHeader from './SurfaceSheetHeader';
import ColorTabContent from './ColorTabContent';
import MaterialTabContent from './MaterialTabContent';
import TextureTabContent from './TextureTabContent';
import useChameleon from '@/hooks/use-chameleon';

// Legacy preset PBR values: only used to read initial slider values from
// objects that had a preset applied before presets were removed.
const PRESET_PBR = {
  chrome: { metalness: 100, roughness: 5 },
  matte: { metalness: 0, roughness: 95 },
  silvery: { metalness: 90, roughness: 30 },
};

const ENVS = [
  { id: 'none', label: 'Off' },
  { id: 'studio', label: 'Studio' },
  { id: 'shop', label: 'Shop' },
  { id: 'city', label: 'City' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'darkStudio', label: 'Dark Studio' },
  { id: 'desert', label: 'Desert' },
  { id: 'graffiti', label: 'Graffiti' },
];

// Materials tool: one bottom sheet with Paint · Material · Texture tabs, sitting
// directly above the main bottom bar. Every tab is the same height.
export default function MaterialsPanel({
  meshId, managerRef, onClose, onBack,
  paintTool, paintColor, onPaintTool, onPaintColor, onFill,
  paintSize, onPaintSize, paintSmoothness, onPaintSmoothness, paintOpacity, onPaintOpacity,
  onOpenChange, onPickerOpenChange,
  section, onSectionChange,
  selectionMode, onSelectionMode,
}) {
  const { highlightColor } = useTheme();
  const [clearCoat, setClearCoat] = useState(0);
  const [reflIntensity, setReflIntensity] = useState(60);
  const [reflRoughness, setReflRoughness] = useState(10);
  const [roughness, setRoughness] = useState(50);
  const [metalness, setMetalness] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [emissive, setEmissive] = useState(0);
  const [envId, setEnvId] = useState('none');
  const [tintHue, setTintHue] = useState(0);
  const [tintAmount, setTintAmount] = useState(0);
  const [sizeDragging, setSizeDragging] = useState(false);
  const [colorTarget, setColorTarget] = useState('primary');
  const [multi, setMulti] = useState(false);
  const [softNormalsOn, setSoftNormalsOn] = useState(false);
  const cham = useChameleon(meshId, managerRef);
  const tab = section === 'paint' ? 'paint' : section === 'texture' ? 'texture' : 'material';

  useEffect(() => {
    const mesh = managerRef.current?.getMesh(meshId);
    if (mesh) {
      setClearCoat(mesh.clearCoatEnabled ? Math.round((mesh.clearCoatIntensity ?? 0.5) * 100) : 0);
      setOpacity(Math.round((mesh.opacity ?? 1) * 100));
      setEmissive(Math.round((mesh.emissive ?? 0) * 100));
      setReflIntensity(Math.round((mesh.reflectionEnabled ? (mesh.reflectionIntensity ?? 0.6) : 0) * 50));
      setReflRoughness(Math.round((mesh.reflectionRoughness ?? 0.1) * 100));
      setTintHue(mesh.tintHue ?? 0);
      setTintAmount(Math.round((mesh.tintAmount ?? 0) * 100));
      const pbr = PRESET_PBR[mesh.material?.preset];
      setRoughness(mesh.roughness != null ? Math.round(mesh.roughness * 100) : (pbr?.roughness ?? 50));
      setMetalness(mesh.metalness != null ? Math.round(mesh.metalness * 100) : (pbr?.metalness ?? 0));
      setSoftNormalsOn(!!mesh.smoothShading);
    }
    setEnvId(managerRef.current?.reflectionEnvironment || 'none');
  }, [meshId, managerRef]);

  const changeClearCoat = (v) => { setClearCoat(v); managerRef.current?.setMaterialClearCoat(v / 100); };
  const changeRoughness = (v) => { setRoughness(v); managerRef.current?.setMaterialRoughness(v / 100); };
  const changeMetalness = (v) => { setMetalness(v); managerRef.current?.setMaterialMetalness(v / 100); };
  const changeOpacity = (v) => { setOpacity(v); managerRef.current?.setMaterialOpacity(v / 100); };
  const changeEmissive = (v) => { setEmissive(v); managerRef.current?.setMaterialEmissive(v / 100); };
  const changeTintHue = (h) => { setTintHue(h); managerRef.current?.setMaterialTint(h, tintAmount / 100); };
  const changeTintAmount = (a) => { setTintAmount(a); managerRef.current?.setMaterialTint(tintHue, a / 100); };
  // Reflection strength is deliberately amplified: 100% reaches a more
  // pronounced two-times environment response instead of stopping at unity.
  const changeReflIntensity = (v) => { setReflIntensity(v); managerRef.current?.setReflection(meshId, { enabled: v > 0, intensity: v / 50, roughness: reflRoughness / 100 }); };
  const changeReflRoughness = (v) => { setReflRoughness(v); managerRef.current?.setReflection(meshId, { enabled: reflIntensity > 0, intensity: reflIntensity / 50, roughness: v / 100 }); };
  const setEnv = (id) => { setEnvId(id); managerRef.current?.setReflectionEnvironment(id === 'none' ? null : id); };
  const toggleSoftNormals = () => {
    const manager = managerRef.current;
    if (!manager?.selection.meshId) { toast.error('Select an object first'); return; }
    manager.executeTool('soft_normals');
    const mesh = manager.getMesh(manager.selection.meshId);
    setSoftNormalsOn(!!mesh?.smoothShading);
  };

  const SLIDERS = [
    { id: 'metalness', label: 'Metal', value: metalness, onChange: changeMetalness },
    { id: 'roughness', label: 'Rough', value: roughness, onChange: changeRoughness },
    { id: 'opacity', label: 'Opacity', value: opacity, onChange: changeOpacity },
    { id: 'glow', label: 'Glow', value: emissive, onChange: changeEmissive },
    { id: 'reflect', label: 'Reflect', value: reflIntensity, onChange: changeReflIntensity },
    { id: 'blur', label: 'Blur', value: reflRoughness, onChange: changeReflRoughness },
    { id: 'clearcoat', label: 'Clear coat', value: clearCoat, onChange: changeClearCoat },
  ];

  const goTab = (id) => {
    onOpenChange(null);
    captureBaseline();
    if (id === 'paint') { onSectionChange('paint'); onPickerOpenChange?.(true); return; }
    if (section === 'paint') managerRef.current?.cancelPaintPreview();
    onPickerOpenChange?.(false);
    // Material and Texture apply to whole objects: always in Object mode.
    onSelectionMode?.('object');
    onSectionChange(id === 'texture' ? 'texture' : null);
  };

  // Everything on the Material and Texture tabs changes the object as you drag,
  // so the sheet keeps a baseline of the scene to roll back to. The checkmark
  // turns whatever has changed since that baseline into one undo step and makes
  // the current state the new baseline; X rolls back to it. The scene's
  // reflection environment is not part of a snapshot, so it is kept alongside.
  const baselineRef = useRef(null);
  const captureBaseline = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    baselineRef.current = {
      snapshot: manager.captureSnapshot?.() || null,
      environment: manager.reflectionEnvironment || null,
    };
  }, [managerRef]);
  useEffect(() => { captureBaseline(); }, [captureBaseline]);

  // X, and the back chevron, undo whatever the checkmark has not committed.
  // Brush and spray strokes commit themselves as they are drawn, so the Paint
  // tab only has to drop an uncommitted color preview.
  const cancelPending = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    manager.cancelPaintPreview();
    if (tab === 'paint') return;
    const baseline = baselineRef.current;
    if (!baseline) return;
    if (baseline.environment !== (manager.reflectionEnvironment || null)) {
      manager.setReflectionEnvironment(baseline.environment);
    }
    manager.revertToSnapshot?.(baseline.snapshot);
  }, [managerRef, tab]);

  // The checkmark applies and leaves the sheet open. Paint commits the color to
  // the current selection only; Material and Texture are already on the object,
  // so committing means banking them as an undo step.
  const applyCurrent = () => {
    const manager = managerRef.current;
    if (!manager) return;
    if (tab === 'paint') {
      // onFill prompts for itself when nothing is selected, so let it answer
      // rather than having the checkmark do nothing silently.
      if (paintTool === 'fill') onFill?.();
    } else if (baselineRef.current?.snapshot) {
      manager.pushUndoSnapshot?.(baselineRef.current.snapshot);
    }
    captureBaseline();
  };
  const closeAll = () => {
    cancelPending();
    onPickerOpenChange?.(false);
    onClose?.();
  };
  const goBack = () => {
    cancelPending();
    onPickerOpenChange?.(false);
    onBack?.();
  };

  // Vertex selections have no paintable surface. Edge selections paint their
  // adjacent faces with an independent fade away from each selected edge.
  const strokesBlocked = selectionMode === 'vertex';
  const strokeActive = !multi && (paintTool === 'brush' || paintTool === 'spray') && !strokesBlocked;

  const activeColor = multi ? (colorTarget === 'primary' ? cham.primary : cham.shiftColor) : paintColor;
  const setActiveColor = (c) => {
    if (multi) cham.setColor(colorTarget, c);
    else onPaintColor(c);
    // Fill is live: every color source (wheel, value slider and saved swatches)
    // previews directly on the current selection. The panel checkmark commits
    // that preview as one undoable edit instead of creating an undo entry for
    // every tiny movement around the picker.
    if (paintTool === 'fill' && managerRef.current?.selection.meshId) {
      managerRef.current.previewPaintFill(c, paintOpacity / 100);
    }
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {/* Live brush/spray size preview while a finger is on the Size slider */}
      {sizeDragging && (
        <SculptRingOverlay
          visible
          pixelRadius={managerRef.current?.paintSizeToScreenPixels(paintSize) ?? 24}
          color={highlightColor}
        />
      )}

      {/* The sheet sits directly above the main bottom bar. */}
      <div data-surface-rows className="absolute left-0 right-0 bottom-[3.75rem] safe-bottom pointer-events-auto px-1.5">
        <div className="modeling-sheet rounded-2xl">
          <SurfaceSheetHeader
            tab={tab}
            onTab={goTab}
            onApply={applyCurrent}
            onClose={closeAll}
            onBack={goBack}
          />
          {/* Fixed content height keeps Color, Material and Texture identical. */}
          <div className="px-2 h-[8.25rem] overflow-visible">
            {tab === 'paint' && (
              <ColorTabContent
                color={activeColor}
                onChange={setActiveColor}
                multi={multi}
                colorTarget={colorTarget}
                onColorTarget={setColorTarget}
                strokeActive={strokeActive}
                showSliders
                size={paintSize} smoothness={paintSmoothness} opacity={paintOpacity}
                onSize={onPaintSize} onSmoothness={onPaintSmoothness} onOpacity={onPaintOpacity}
                onSizeActive={setSizeDragging}
                shift={cham.intensity} onShift={cham.setShift}
                paintTool={paintTool}
                strokesBlocked={strokesBlocked}
                onPaintTool={onPaintTool}
                onMulti={() => { setMulti((v) => !v); setColorTarget('primary'); }}
                onRemovePaint={() => {
                  if (managerRef.current?.clearPaint()) toast.success('Paint removed');
                  else toast.error('Select an object first');
                }}
              />
            )}
            {tab === 'material' && (
              <MaterialTabContent
                environments={ENVS} envId={envId} onEnv={setEnv}
                sliders={SLIDERS}
                onSoftNormals={toggleSoftNormals}
                softNormalsOn={softNormalsOn}
                tintHue={tintHue} tintAmount={tintAmount}
                onTintHue={changeTintHue} onTintAmount={changeTintAmount}
              />
            )}
            {tab === 'texture' && (
              <TextureTabContent meshId={meshId} managerRef={managerRef} opacity={opacity} onOpacity={changeOpacity} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}