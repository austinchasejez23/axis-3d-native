import { EditableMesh } from './EditableMesh';
import { importModelFile } from './importers';

// Import on a separate thread so parsing and quad reconstruction cannot block
// camera gestures and controls. A worker uses the same importer as the
// synchronous fallback; there is no separate modeling algorithm to maintain.
/**
 * @param {File} file
 * @param {{ createWorker?: () => Worker }} [options]
 */
export async function importModelFileOffThread(file, { createWorker } = {}) {
  if (typeof Worker === 'undefined' && !createWorker) return importModelFile(file);

  let worker;
  try {
    worker = createWorker
      ? createWorker()
      : new Worker(new URL('./importWorker.js', import.meta.url), { type: 'module' });
  } catch {
    // Older shells may not support module workers. Keep importing functional.
    return importModelFile(file);
  }

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => (value) => {
      if (done) return;
      done = true;
      worker.terminate();
      fn(value);
    };
    const succeed = finish(resolve);
    const fail = finish(reject);
    const unsupported = finish(() => {
      // A worker may be blocked by the native WebView or CSP even though
      // Worker exists. Fall back rather than making local import unusable.
      importModelFile(file).then(resolve, reject);
    });
    worker.onmessage = ({ data }) => {
      if (!data?.ok) {
        const message = data?.error || 'Model import failed.';
        // Some WebViews provide the Web Worker API but not image decoding
        // APIs needed by FBX/glTF loaders. In that specific case let the
        // existing on-screen importer parse the file rather than rejecting it.
        if (/(createImageBitmap|ImageBitmap|ImageLoader|HTMLImageElement|document is not defined|OffscreenCanvas)/i.test(message)) {
          unsupported();
        } else {
          fail(new Error(message));
        }
        return;
      }
      try {
        succeed(data.meshes.map((mesh) => EditableMesh.deserialize(mesh)));
      } catch (error) {
        fail(error);
      }
    };
    worker.onerror = (event) => {
      event?.preventDefault?.();
      unsupported();
    };
    worker.onmessageerror = () => unsupported();
    try {
      worker.postMessage({ file });
    } catch {
      unsupported();
    }
  });
}
