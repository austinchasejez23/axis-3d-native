// The transform readout's values. Kept outside React state so a transform
// updating them on every frame re-renders only the parts that show them, not
// the whole Modeler screen.
import { useSyncExternalStore } from 'react';

let current = { action: 'idle', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, label: 'Pos. (in)', activeAxis: null };
const listeners = new Set();

function same(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!Object.is(a[k], b[k])) return false;
  return true;
}

export function setHudValues(next) {
  // Unchanged values: nothing to redraw.
  if (!next || same(current, next)) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHud() {
  return useSyncExternalStore(subscribe, () => current);
}

export function useHudAction() {
  return useSyncExternalStore(subscribe, () => current.action);
}
