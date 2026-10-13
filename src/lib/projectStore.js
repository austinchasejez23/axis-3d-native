// Model geometry lives in IndexedDB, not localStorage.
// localStorage is capped at roughly 5 MB per site, which a dense model
// (100k+ triangles) blows past on its own — that is why saving used to fail.
// IndexedDB holds hundreds of megabytes and stores objects structurally, with
// no JSON string to build, so big models save quickly as well as reliably.
const DB_NAME = 'axis3d';
const STORE = 'projectMeshes';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.onabort = t.onerror = () => reject(t.error || req?.error);
    t.oncomplete = () => resolve(req?.result);
  }));
}

export function putMeshes(id, meshes) {
  return tx('readwrite', (store) => store.put(meshes, id));
}

export function getMeshes(id) {
  return tx('readonly', (store) => store.get(id));
}

export function deleteMeshes(id) {
  return tx('readwrite', (store) => store.delete(id));
}