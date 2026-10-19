import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';
import { toDisplayUnit, fromDisplayUnit } from '@/lib/units';
import { X } from 'lucide-react';
import TransformValueRow from './TransformValueRow';

// Editable position / rotation / scale for the selected object. Values update
// the object live; Apply commits a single undoable step, Cancel reverts.
export default function TransformDrawer({ meshId, managerRef, onClose, onApplied = undefined, onRegisterApply, focus, hud }) {
  // focus = { section: 'position' | 'rotation' | 'scale', index: 0 | 1 | 2 }
  const isFocused = (section, index) => !!focus && focus.section === section && focus.index === index;
  const { uiColor, highlightColor, unit } = useTheme();
  const read = () => managerRef.current?.getSelectionTransform(meshId) || null;
  const [pos, setPos] = useState(() => { const t = read(); return t ? t.position.map((v) => toDisplayUnit(v, unit)) : [0, 0, 0]; });
  const [rot, setRot] = useState(() => { const t = read(); return t ? t.rotation : [0, 0, 0]; });
  const [scl, setScl] = useState(() => { const t = read(); return t ? t.scale : [1, 1, 1]; });
  const [dims, setDims] = useState(() => { const b = managerRef.current?.getSelectionBounds(); return b ? [b.sx,b.sy,b.sz].map(v => toDisplayUnit(v,unit)) : [0,0,0]; });
  const [snapshot, setSnapshot] = useState(null);
  const [activeKeypad, setActiveKeypad] = useState(null);
  const groupRotationRef = useRef([...rot]);
  const groupScaleRef = useState(() => [1, 1, 1])[0];
  const keypad = (name) => ({ keypadOpen: activeKeypad === name, onKeypadOpen: (open) => setActiveKeypad(open ? name : null) });
  useEffect(() => {
    const transform = read();
    if (!transform) return;
    setPos(transform.position.map((v) => toDisplayUnit(v, unit)));
    setRot(transform.rotation);
    if (managerRef.current?.isGroupMode()) groupRotationRef.current = [...transform.rotation];
    if (managerRef.current?.selection.type === 'object') setScl(transform.scale);
    const bounds = managerRef.current?.getSelectionBounds();
    if (bounds) setDims([bounds.sx,bounds.sy,bounds.sz].map(v => toDisplayUnit(v,unit))); 
  }, [meshId, hud, unit]);

  useEffect(() => {
    setSnapshot(managerRef.current?.captureSnapshot());
  }, []);

  const applyLive = (np, nr, ns) => {
    const manager = managerRef.current;
    const position = manager?.isGroupMode()
      ? manager.getObjectTransform(meshId)?.position
      : np.map((v) => fromDisplayUnit(v, unit));
    manager?.setObjectTransformLive(meshId, { position, rotation: nr, scale: ns });
  };

  const editPos = (i, v) => {
    const n = [...pos];
    n[i] = v;
    setPos(n);
    managerRef.current?.setSelectionPositionLive(n.map((value) => fromDisplayUnit(value, unit)));
  };
  const editRot = (i, v) => {
    const n = [...rot];
    n[i] = v;
    setRot(n);
    const manager = managerRef.current;
    if (manager?.isGroupMode()) {
      const delta = (v - groupRotationRef.current[i]) * Math.PI / 180;
      if (Math.abs(delta) > 1e-9) {
        manager.rotateGroupAxis(delta, ['x', 'y', 'z'][i]);
        groupRotationRef.current[i] = v;
      }
    } else {
      manager?.setObjectRotationLive(n[0], n[1], n[2]);
    }
  };
  const editScl = (i, v) => {
    const n = [...scl];
    n[i] = Math.max(0.01, v);
    const manager = managerRef.current;
    if (manager?.isGroupMode()) {
      const previous = Math.max(0.01, groupScaleRef[i]);
      const factor = n[i] / previous;
      if (Math.abs(factor - 1) > 1e-9) {
        manager.scaleGroupAxis(['x', 'y', 'z'][i], factor);
        groupScaleRef[i] = n[i];
      }
    } else if (manager?.selection.type === 'object') {
      applyLive(pos, rot, n);
    } else {
      const previous = Math.max(0.01, scl[i]);
      manager?.scaleSelectionAxis(['x', 'y', 'z'][i], n[i] / previous);
    }
    setScl(n);
  };

  const editDim = (i, v) => {
    if (!Number.isFinite(v) || v <= 0) return;
    const manager = managerRef.current;
    const bounds = manager?.getSelectionBounds();
    const current = bounds ? [bounds.sx,bounds.sy,bounds.sz][i] : 0;
    if (current <= 1e-8) return;
    const factor = fromDisplayUnit(v,unit) / current;
    manager?.scaleSelectionAxis(['x','y','z'][i], factor);
    setDims(previous => previous.map((value,index) => index === i ? v : value));
  };

  const apply = () => {
    if (managerRef.current && snapshot) managerRef.current.pushUndoSnapshot(snapshot);
    onApplied?.();
    onClose?.();
  };
  const cancel = () => {
    if (managerRef.current && snapshot) managerRef.current.restoreSnapshot(snapshot);
    onClose?.();
  };

  // The parent uses this when the canvas (or another control) dismisses the
  // drawer. Dismissal commits; only the explicit Cancel controls restore.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    onRegisterApply?.(() => applyRef.current());
    return () => onRegisterApply?.(null);
  }, [onRegisterApply]);

  const panelStyle = { borderColor: 'rgb(var(--modeling-border) / 0.10)', background: 'rgb(var(--modeling-sheet) / 0.94)', bottom: activeKeypad ? 'var(--modeling-keypad-height, 10.5rem)' : 0 };

  return (
    <div aria-label="Transform controls"
      className="modeling-panel absolute left-0 top-[max(env(safe-area-inset-top,0px),1.75rem)] z-50 w-[34vw] max-w-[132px] overflow-y-auto border-r p-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-auto"
      style={panelStyle}
    >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold" style={{ color: highlightColor }}>Transform</span>
          <button onClick={cancel} style={{ color: uiColor }} className="active:scale-90"><X className="w-4 h-4" /></button>
        </div>
        <div className={activeKeypad ? "flex min-h-[30rem] flex-col justify-between gap-2 pb-5" : "space-y-2"}>
          <div>
            <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: uiColor, opacity: 0.7 }}>Position ({unit})</div>
            <div className="space-y-1">
              <TransformValueRow label="X" value={pos[0]} onChange={(v) => editPos(0, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('position', 0)} {...keypad('position-x')} />
              <TransformValueRow label="Y" value={pos[1]} onChange={(v) => editPos(1, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('position', 1)} {...keypad('position-y')} />
              <TransformValueRow label="Z" value={pos[2]} onChange={(v) => editPos(2, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('position', 2)} {...keypad('position-z')} />
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: uiColor, opacity: 0.7 }}>Rotation (°)</div>
            <div className="space-y-1">
              <TransformValueRow label="X" value={rot[0]} onChange={(v) => editRot(0, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('rotation', 0)} {...keypad('rotation-x')} />
              <TransformValueRow label="Y" value={rot[1]} onChange={(v) => editRot(1, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('rotation', 1)} {...keypad('rotation-y')} />
              <TransformValueRow label="Z" value={rot[2]} onChange={(v) => editRot(2, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('rotation', 2)} {...keypad('rotation-z')} />
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: uiColor, opacity: 0.7 }}>Dimensions ({unit})</div>
            <div className="space-y-1">
              {['W','H','D'].map((axis,i) => <TransformValueRow key={axis} label={axis} value={dims[i]} onChange={(v) => editDim(i,v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('dimensions',i) || isFocused('scale',i)} {...keypad(`dimensions-${axis}`)} />)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase mb-1" style={{ color: uiColor, opacity: 0.7 }}>Scale</div>
            <div className="space-y-1">
              <TransformValueRow label="X" value={scl[0]} onChange={(v) => editScl(0, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('scale', 0)} {...keypad('scale-x')} />
              <TransformValueRow label="Y" value={scl[1]} onChange={(v) => editScl(1, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('scale', 1)} {...keypad('scale-y')} />
              <TransformValueRow label="Z" value={scl[2]} onChange={(v) => editScl(2, v)} color={uiColor} highlightColor={highlightColor} autoFocus={isFocused('scale', 2)} {...keypad('scale-z')} />
            </div>
          </div>
        </div>
        <div className={`flex gap-1.5 mt-2 ${activeKeypad ? 'mb-3' : ''}`}>
          <button onClick={cancel} className="flex-1 h-8 rounded-md text-[12px] font-semibold border" style={{ color: uiColor, borderColor: 'rgba(255,255,255,0.2)' }}>Cancel</button>
          <button onClick={apply} className="flex-1 h-8 rounded-md text-[12px] font-semibold" style={{ color: uiColor }}>Apply</button>
        </div>
    </div>
  );
}