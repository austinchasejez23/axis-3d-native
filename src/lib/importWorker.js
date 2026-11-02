import { importModelFile } from './importers';

// A worker owns parsing, mesh reconstruction and topology processing.
// Return only serializable geometry so no Three.js/WebGL objects cross threads.
self.onmessage = async ({ data }) => {
  try {
    const meshes = await importModelFile(data.file);
    self.postMessage({ ok: true, meshes: meshes.map((mesh) => mesh.serialize()) });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Unable to import this model.' });
  }
};
