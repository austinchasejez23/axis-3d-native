import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/lib/theme';
import SculptRingOverlay from './SculptRingOverlay';
import SurfaceSheetHeader from './SurfaceSheetHeader';
import ColorTabContent from './ColorTabContent';
import MaterialTabContent from './MaterialTabContent';
import TextureTabContent from './TextureTabContent';

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
  const [softNormalsOn, setSoftNormalsOn] = useState(false);
  const tab = section === 'paint' ? 'paint' : section === 'texture' ? 'texture' : 'material';

  // Read every material slider from the object (on open, and after Default).
  const loadFromMesh = useCallback(() => {
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
  }, [meshId, managerRef]);
  useEffect(() => {
    loadFromMesh();
    setEnvId(managerRef.current?.reflectionEnvironment || 'none');
  }, [loadFromMesh, managerRef]);

  // Whether Material / Texture have changed anything since the last Apply, so
  // Apply and the checkmark only add an undo step when there is something new.
  const dirtyRef = useRef(false);
  const markDirty = () => { dirtyRef.current = true; };

  const changeClearCoat = (v) => { setClearCoat(v); markDirty(); managerRef.current?.setMaterialClearCoat(v / 100); };
  const changeRoughness = (v) => { setRoughness(v); markDirty(); managerRef.current?.setMaterialRoughness(v / 100); };
  const changeMetalness = (v) => { setMetalness(v); markDirty(); managerRef.current?.setMaterialMetalness(v / 100); };
  const changeOpacity = (v) => { setOpacity(v); markDirty(); managerRef.current?.setMaterialOpacity(v / 100); };
  const changeEmissive = (v) => { setEmissive(v); markDirty(); managerRef.current?.setMaterialEmissive(v / 100); };
  const changeTintHue = (h) => { setTintHue(h); markDirty(); managerRef.current?.setMaterialTint(h, tintAmount / 100); };
  const changeTintAmount = (a) => { setTintAmount(a); markDirty(); managerRef.current?.setMaterialTint(tintHue, a / 100); };
  // Reflection strength is deliberately amplified: 100% reaches a more
  // pronounced two-times environment response instead of stopping at unity.
  const changeReflIntensity = (v) => { setReflIntensity(v); markDirty(); managerRef.current?.setReflection(meshId, { enabled: v > 0, intensity: v / 50, roughness: reflRoughness / 100 }); };
  const changeReflRoughness = (v) => { setReflRoughness(v); markDirty(); managerRef.current?.setReflection(meshId, { enabled: reflIntensity > 0, intensity: reflIntensity / 50, roughness: v / 100 }); };
  const setEnv = (id) => { setEnvId(id); markDirty(); managerRef.current?.setReflectionEnvironment(id === 'none' ? null : id); };
  const toggleSoftNormals = () => {
    const manager = managerRef.current;
    if (!manager?.selection.meshId) { toast.error('Select an object first'); return; }
    manager.executeTool('soft_normals');
    markDirty();
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
    dirtyRef.current = false;
  }, [managerRef]);
  useEffect(() => { captureBaseline(); }, [captureBaseline]);

  // Paint session. Strokes and a Fill preview stay pending until Apply; the
  // engine announces each finished stroke so the buttons below can update.
  const [, setPaintTick] = useState(0);
  const bumpPaint = useCallback(() => setPaintTick((t) => t + 1), []);
  useEffect(() => {
    window.addEventListener('axis-paint-pending', bumpPaint);
    return () => window.removeEventListener('axis-paint-pending', bumpPaint);
  }, [bumpPaint]);
  // Selecting other faces/edges on the same object doesn't change props, so
  // listen for selection changes to keep the Apply highlight in step.
  useEffect(() => {
    window.addEventListener('axis-selection-change', bumpPaint);
    return () => window.removeEventListener('axis-selection-change', bumpPaint);
  }, [bumpPaint]);

  // What Apply last painted: which selection, in which color. Apply is
  // highlighted only while the current selection and color still match it;
  // picking another color or selecting something else clears the highlight.
  const lastApplyRef = useRef(null);
  const selectionKey = () => {
    const manager = managerRef.current;
    if (!manager) return '';
    const sel = manager.selection;
    const group = manager.isGroupMode?.() ? [...manager.selectedMeshIds].sort().join(',') : '';
    return `${sel.meshId}|${sel.type}|${[...(sel.indices || [])].sort((a, b) => a - b).join(',')}|${group}`;
  };
  // Undo steps that Apply pushed this session, by identity. Undo only ever
  // reverses one of these, and only while it is still the top of the history,
  // so it can never reach back past the paint into an unrelated edit.
  const appliedRef = useRef([]);
  const topOfHistory = () => {
    const stack = managerRef.current?.undoStack || [];
    return stack[stack.length - 1];
  };
  const recordApplied = (action) => {
    const before = topOfHistory();
    action();
    const after = topOfHistory();
    if (after && after !== before) appliedRef.current.push(after);
  };

  // Apply: commit pending strokes and, with Fill, colour the selection. Paint
  // never lands any other way, and the sheet stays open.
  const applyPaint = () => {
    const manager = managerRef.current;
    if (!manager?.selection.meshId) return;
    recordApplied(() => manager.commitPendingPaint?.());
    if (paintTool === 'fill') recordApplied(() => onFill?.());
    lastApplyRef.current = { key: selectionKey(), color: activeColor };
    bumpPaint();
  };

  // Undo: a showing Fill preview first, then unapplied strokes newest first,
  // then paint applied in this session.
  const undoPaint = () => {
    const manager = managerRef.current;
    if (!manager) return;
    if (manager.hasPaintPreview?.()) manager.cancelPaintPreview();
    else if (!manager.undoPendingStroke?.()) {
      const last = appliedRef.current[appliedRef.current.length - 1];
      if (last && topOfHistory() === last) {
        manager.undo();
        appliedRef.current.pop();
        lastApplyRef.current = null;
      }
    }
    bumpPaint();
  };

  const liveManager = managerRef.current;
  const lastApplied = appliedRef.current[appliedRef.current.length - 1];
  const canApply = !!meshId;
  const canUndo = !!liveManager && (
    !!liveManager.hasPaintPreview?.()
    || !!liveManager.hasPendingPaint?.()
    || (!!lastApplied && topOfHistory() === lastApplied)
  );

  // X, and the back chevron: everything not applied is rolled back — pending
  // strokes and a Fill preview on any tab, plus Material and Texture changes
  // since the last baseline.
  const cancelPending = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    manager.cancelPaintPreview();
    manager.cancelPendingPaint?.();
    if (tab === 'paint') return;
    const baseline = baselineRef.current;
    if (!baseline) return;
    if (baseline.environment !== (manager.reflectionEnvironment || null)) {
      manager.setReflectionEnvironment(baseline.environment);
    }
    manager.revertToSnapshot?.(baseline.snapshot);
  }, [managerRef, tab]);

  // The checkmark keeps everything and closes: the same as Apply on the Paint
  // tab, and on Material and Texture it banks the live changes as one undo step.
  const applyAndClose = () => {
    const manager = managerRef.current;
    if (manager) {
      if (tab === 'paint') {
        if (manager.selection.meshId) applyPaint();
        else manager.commitPendingPaint?.();
      } else {
        keepSurfaceChanges();
      }
    }
    onPickerOpenChange?.(false);
    onClose?.();
  };
  // Material / Texture Apply: keep what has changed as one undo step and make
  // it the new point X rolls back to. The sheet stays open.
  const keepSurfaceChanges = () => {
    const manager = managerRef.current;
    if (!manager) return;
    manager.commitPendingPaint?.();
    if (dirtyRef.current && baselineRef.current?.snapshot) manager.pushUndoSnapshot?.(baselineRef.current.snapshot);
    captureBaseline();
  };
  // Default: material sliders back to a new object's values (X still undoes it).
  const resetMaterial = () => {
    if (!managerRef.current?.resetMaterialDefaults?.()) { toast.error('Select an object first'); return; }
    markDirty();
    loadFromMesh();
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
  const strokeActive = (paintTool === 'brush' || paintTool === 'spray') && !strokesBlocked;

  const activeColor = paintColor;
  const applied = !!lastApplyRef.current && !!liveManager
    && lastApplyRef.current.key === selectionKey()
    && lastApplyRef.current.color === activeColor
    && !liveManager.hasPendingPaint?.()
    && !liveManager.hasPaintPreview?.();
  const setActiveColor = (c) => {
    onPaintColor(c);
    // Fill previews live: every color source (wheel, value slider and saved
    // swatches) shows on the current selection, but only Apply (or the
    // checkmark) commits it, as one undoable edit rather than an undo entry
    // for every tiny movement around the picker.
    if (paintTool === 'fill' && managerRef.current?.selection.meshId) {
      managerRef.current.previewPaintFill(c, paintOpacity / 100);
    }
  };

  // Eyedropper: armed from the paint tool row; the next tap on the model takes
  // that spot's color (as if picked on the wheel) and the eyedropper turns off.
  const [eyedropper, setEyedropper] = useState(false);
  const pickRef = useRef(null);
  pickRef.current = (hex) => { setActiveColor(hex); setEyedropper(false); };
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager?.setEyedropper) return undefined;
    manager.setEyedropper(eyedropper && tab === 'paint' ? (hex) => pickRef.current?.(hex) : null);
    return () => manager.setEyedropper(null);
  }, [eyedropper, tab, managerRef]);
  useEffect(() => { if (tab !== 'paint') setEyedropper(false); }, [tab]);

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
            onApply={applyAndClose}
            onClose={closeAll}
            onBack={goBack}
          />
          {/* Fixed content height keeps Paint, Material and Texture identical.
              Paint sets it: the 118px wheel row plus the slider strip below. */}
          <div className="px-2 h-[12rem] overflow-visible">
            {tab === 'paint' && (
              <ColorTabContent
                color={activeColor}
                onChange={setActiveColor}
                strokeActive={strokeActive}
                showSliders
                size={paintSize} smoothness={paintSmoothness} opacity={paintOpacity}
                onSize={onPaintSize} onSmoothness={onPaintSmoothness} onOpacity={onPaintOpacity}
                onSizeActive={setSizeDragging}
                paintTool={paintTool}
                strokesBlocked={strokesBlocked}
                onPaintTool={onPaintTool}
                onApply={applyPaint}
                onUndo={undoPaint}
                canApply={canApply}
                applied={applied}
                eyedropper={eyedropper}
                onEyedropper={() => setEyedropper((v) => !v)}
                canUndo={canUndo}
                onRemovePaint={() => {
                  // Remove paint wipes the layer, so unapplied strokes go first
                  // and the pending record stays in step with the pixels.
                  managerRef.current?.cancelPendingPaint?.();
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
                onDefault={resetMaterial}
                onApply={keepSurfaceChanges}
                canApply={canApply}
              />
            )}
            {tab === 'texture' && (
              <TextureTabContent
                meshId={meshId}
                managerRef={managerRef}
                opacity={opacity}
                onOpacity={changeOpacity}
                onChange={markDirty}
                onApply={keepSurfaceChanges}
                canApply={canApply}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}