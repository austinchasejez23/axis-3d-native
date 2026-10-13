// localStorage-backed custom library of user-saved meshes. Each entry stores
// a serialized EditableMesh (plain JSON) so it survives reloads and can be
// re-instantiated via EditableMesh.deserialize.
const KEY = 'gestura_custom_library';

export function listCustomLibrary() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveToCustomLibrary(entry) {
  const list = listCustomLibrary();
  list.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(list));
  return entry;
}

export function deleteFromCustomLibrary(id) {
  const list = listCustomLibrary().filter((e) => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function genCustomId() {
  return 'cust_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}