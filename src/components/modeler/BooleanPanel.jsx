import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { SubtractIcon, UnionIcon, IntersectIcon } from '@/lib/toolIcons';
import { useTheme } from '@/lib/theme';
import { checkBooleanPair } from '@/lib/booleanTools';
import ModelingPanel from '@/components/modeler/ModelingPanel';

export const BOOLEAN_OPERATIONS = {
  subtract: { label: 'Subtract', Icon: SubtractIcon, roles: ['Base object', 'Cutter object'] },
  union: { label: 'Union', Icon: UnionIcon, roles: ['First object', 'Second object'] },
  intersect: { label: 'Intersect', Icon: IntersectIcon, roles: ['First object', 'Second object'] },
};

// What a check depends on: the two objects' placement and shape.
const pairKey = (a, b) => JSON.stringify([a, b].map((mesh) => [
  mesh.id, mesh.position, mesh.rotation, mesh.scale, mesh.vertices.length, mesh.faces.length,
]));

// Subtract / Union / Intersect: header with the tool's icon and name, Cancel
// (X) and Done (check). Below it two boxes, one per object, each with an
// Add button that assigns the selected object (Remove once assigned), and
// between them the button that runs the operation. Buttons stay grey until
// they can be used; a grey button explains what it needs.
export default function BooleanPanel({ operation, managerRef, onPrompt, onApply, onUndoApply, onAppliedChange, onDone, onCancel }) {
  const { uiColor, highlightColor } = useTheme();
  const { label, Icon, roles } = BOOLEAN_OPERATIONS[operation] || BOOLEAN_OPERATIONS.union;
  const [slots, setSlots] = useState([null, null]);
  const [applied, setApplied] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [sceneTick, setSceneTick] = useState(0);
  const [check, setCheck] = useState(null);
  const checkCache = useRef({ key: null, result: null });
  const appliedOnce = useRef(false);

  // Follow the scene: the selected object at once, everything else (moved
  // objects, Undo/Redo) once it settles.
  useEffect(() => {
    let timer = null;
    const onChange = () => {
      const manager = managerRef.current;
      const sel = manager?.selection;
      setSelectedId(sel?.type === 'object' && sel.meshId && manager.getMesh(sel.meshId) ? sel.meshId : null);
      clearTimeout(timer);
      timer = setTimeout(() => setSceneTick((t) => t + 1), 250);
    };
    onChange();
    window.addEventListener('axis-selection-change', onChange);
    return () => { clearTimeout(timer); window.removeEventListener('axis-selection-change', onChange); };
  }, [managerRef]);

  // The applied result can be undone or redone with the top bar buttons;
  // the second object is gone exactly while the result is in the scene.
  // An object deleted before applying is no longer assigned.
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const [first, second] = slots;
    if (applied && second && manager.getMesh(second)) setApplied(false);
    else if (!applied && appliedOnce.current && first && second && manager.getMesh(first) && !manager.getMesh(second)) setApplied(true);
    else if (!applied && slots.some((id) => id && !manager.getMesh(id))) setSlots((prev) => prev.map((id) => (id && manager.getMesh(id) ? id : null)));
  }, [sceneTick]);

  useEffect(() => { onAppliedChange?.(applied); }, [applied, onAppliedChange]);

  // The operation button lights up only when it would succeed.
  useEffect(() => {
    const manager = managerRef.current;
    const a = slots[0] && manager?.getMesh(slots[0]);
    const b = slots[1] && manager?.getMesh(slots[1]);
    if (!a || !b || applied) { setCheck(null); return; }
    const key = pairKey(a, b) + operation;
    if (checkCache.current.key !== key) {
      checkCache.current = { key, result: checkBooleanPair(manager, a.id, b.id, operation) };
    }
    setCheck(checkCache.current.result);
  }, [slots, applied, sceneTick, operation, managerRef]);

  const canAdd = (i) => !slots[i] && !!selectedId && selectedId !== slots[1 - i];
  const ready = !!slots[0] && !!slots[1] && !applied && !!check?.ok;

  const onSlot = (i) => {
    const manager = managerRef.current;
    if (!manager) return;
    if (slots[i]) {
      // Remove: puts back the result first if it was applied.
      if (applied) { onUndoApply?.(); setApplied(false); }
      appliedOnce.current = false;
      setSlots((prev) => prev.map((id, k) => (k === i ? null : id)));
      return;
    }
    if (!selectedId) { onPrompt?.('Select object to add'); return; }
    if (selectedId === slots[1 - i]) { onPrompt?.(`Already added as the ${roles[1 - i].toLowerCase()}`); return; }
    setSlots((prev) => prev.map((id, k) => (k === i ? selectedId : id)));
    manager.clearSelection();
  };

  const onRun = () => {
    if (ready) {
      if (onApply?.(slots[0], slots[1])) { setApplied(true); appliedOnce.current = true; }
      return;
    }
    if (applied) onPrompt?.('Already applied. Tap Remove to undo it.');
    else if (!slots[0] || !slots[1]) onPrompt?.('Add both objects first');
    else if (check?.notTouching) onPrompt?.('Assigned objects must overlap');
    else onPrompt?.(check?.message || 'These objects cannot be combined');
  };

  const buttonStyle = (active) => (active
    ? { color: highlightColor, borderColor: highlightColor }
    : { color: uiColor, opacity: 0.4 });
  const slotBox = (i) => {
    const assigned = !!slots[i];
    return (
      <div className="modeling-value flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-2 py-2">
        <p className="w-full truncate text-center text-[12px] font-semibold leading-snug" style={{ color: uiColor }}>{roles[i]}</p>
        <button type="button" onClick={() => onSlot(i)} aria-label={`${assigned ? 'Remove' : 'Add'} ${roles[i].toLowerCase()}`} className="modeling-value flex h-8 w-full items-center justify-center rounded-lg text-[13px] font-semibold active:scale-95" style={buttonStyle(assigned || canAdd(i))}>
          {assigned ? 'Remove' : 'Add'}
        </button>
      </div>
    );
  };

  return (
    <ModelingPanel label={`${label} controls`}>
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">{label}</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label={`Cancel ${label.toLowerCase()}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}><X className="h-6 w-6" strokeWidth={2.5} /></button>
            <button type="button" onClick={onDone} aria-label={`Close ${label.toLowerCase()}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: highlightColor, borderColor: highlightColor }}><Check className="h-6 w-6" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          {slotBox(0)}
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={onRun} aria-label={label} className="modeling-value flex h-8 items-center justify-center rounded-lg px-3 text-[13px] font-semibold active:scale-95" style={buttonStyle(ready)}>
              {label}
            </button>
          </div>
          {slotBox(1)}
        </div>
      </div>
    </ModelingPanel>
  );
}
