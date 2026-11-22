import { Capacitor } from '@capacitor/core';
import { AxisFiles } from '@/lib/axisFilesPlugin';

// Model files opened with AXIS from another app ("Open with" on Android).
// The native side copies the file into the app's cache and reports it; it is
// read here and queued until the modeler takes it.
const queue = [];
const listeners = new Set();
let started = false;

const notify = () => { for (const listener of listeners) listener(); };

export function startOpenedFiles() {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  AxisFiles.addListener('fileOpened', async ({ name, path, error }) => {
    let item;
    try {
      if (error || !path) throw new Error(error || 'The file could not be opened.');
      const response = await fetch(Capacitor.convertFileSrc(path));
      if (!response.ok) throw new Error('The file could not be opened.');
      item = { file: new File([await response.blob()], name || 'model') };
    } catch (err) {
      item = { error: err?.message || 'The file could not be opened.' };
    }
    queue.push(item);
    notify();
  }).catch(() => {});
}

export const hasOpenedFile = () => queue.length > 0;
export const peekOpenedFile = () => queue[0] || null;
export const takeOpenedFile = () => queue.shift() || null;
export function onOpenedFile(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// TEST BUILD ONLY: lets the browser test hand in a file as if Android had.
window.__axisOpenFile = (file) => { queue.push({ file }); notify(); };
window.__axisOpenDebug = () => ({ queue: queue.length, listeners: listeners.size });
