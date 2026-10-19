import assert from 'node:assert/strict';
import { getMeshes, putMeshes, deleteMeshes } from '../src/lib/projectStore.js';

// Exercise the actual IndexedDB adapter, not a stand-in for its openDb logic.
// A transient database error must not permanently poison its cached promise.
const original = globalThis.indexedDB;
let openCount = 0;
let closeCount = 0;
let latestDb;
let failOnce = true;
const objects = new Map();

const makeTransaction = () => {
  const tx = { oncomplete: null, onerror: null, onabort: null };
  const complete = (request, operation) => {
    queueMicrotask(() => {
      try {
        request.result = operation();
        tx.oncomplete?.();
      } catch (error) {
        request.error = error;
        tx.error = error;
        tx.onerror?.();
      }
    });
    return request;
  };
  tx.objectStore = () => ({
    put(data, key) {
      return complete({}, () => { objects.set(key, data); return key; });
    },
    get(key) {
      return complete({}, () => objects.get(key));
    },
    delete(key) {
      return complete({}, () => objects.delete(key));
    },
  });
  return tx;
};
const createDb = () => ({
  objectStoreNames: { contains: () => true },
  createObjectStore: () => {},
  transaction: () => makeTransaction(),
  close: () => { closeCount++; },
  onversionchange: null,
});
globalThis.indexedDB = {
  open: (name, version) => {
    assert.equal(name, 'axis3d');
    assert.equal(version, 1);
    openCount++;
    const req = { result: createDb(), error: null };
    queueMicrotask(() => {
      if (failOnce) {
        failOnce = false;
        req.error = new Error('Transient IndexedDB open failure');
        req.onerror?.();
      } else {
        latestDb = req.result;
        req.onsuccess?.();
      }
    });
    return req;
  },
};

try {
  await assert.rejects(getMeshes('test'), /Transient IndexedDB open failure/);
  const model = { meshes: [{ id: 1, name: 'Local model' }] };
  await putMeshes('test', model);
  assert.deepEqual(await getMeshes('test'), model);
  assert.equal(openCount, 2, 'Storage must retry after an initial open failure');

  latestDb.onversionchange();
  assert.equal(closeCount, 1);
  assert.deepEqual(await getMeshes('test'), model);
  assert.equal(openCount, 3, 'Storage must reopen after a database version change');

  await deleteMeshes('test');
  assert.equal(await getMeshes('test'), undefined);
  console.log('PASS: IndexedDB recovers from open errors and version changes without losing local model data');
} finally {
  if (original === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = original;
}
