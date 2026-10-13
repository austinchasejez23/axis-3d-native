import { EditableMesh } from './EditableMesh';
import { putMeshes, getMeshes, deleteMeshes } from './projectStore';
import { trackAccountWrite } from '@/lib/accountDeletionState';

// localStorage now holds ONLY the Library index — id, name, thumbnail and time.
// The geometry itself lives in IndexedDB (see projectStore.js), so a model of
// any size saves without hitting the ~5 MB localStorage quota.
const STORAGE_KEY = 'forge3d_projects';

export function listProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

// The index is small, but thumbnails are base64 images and can still fill an
// almost-full storage. Shed them rather than lose the save.
function writeIndex(entries, keepId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return;
  } catch {}
  const lean = entries.map((p) => (p.id === keepId ? p : { ...p, thumbnail: null }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lean));
    return;
  } catch {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lean.map((p) => ({ ...p, thumbnail: null }))));
}

export function saveProject(project) {
  return trackAccountWrite(() => persistProject(project));
}

async function persistProject(project) {
  assertProjectsUnlocked([project.id]);
  // Project scene data first: if it cannot be stored, the index must not claim a save.
  await putMeshes(project.id, { meshes: project.meshes, lights: project.lights || [], settings: project.settings || null });
  const projects = listProjects();
  const previous = projects.find(item => item.id === project.id);
  const entry = {
    folderId: previous?.folderId || project.folderId || null,
    locked: previous?.locked || false,
    id: project.id,
    name: project.name,
    thumbnail: project.thumbnail || null,
    updatedAt: Date.now(),
  };
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = entry;
  else projects.push(entry);
  writeIndex(projects, project.id);
  // Saving is asynchronous now, so a screen already showing the model list
  // (the Library) is told to refresh instead of showing a stale list.
  window.dispatchEvent(new Event('axis:projects-changed'));
}

export async function loadProject(id) {
  const data = listProjects().find(p => p.id === id);
  if (!data) return null;
  // Projects saved before the IndexedDB move still carry their meshes inline.
  const stored = (await getMeshes(id)) || data.meshes;
  if (!stored) return null;
  const meshes = Array.isArray(stored) ? stored : stored.meshes;
  if (!meshes) return null;
  return {
    id: data.id,
    name: data.name,
    meshes: meshes.map(m => EditableMesh.deserialize(m)),
    lights: Array.isArray(stored) ? [] : (stored.lights || []),
    settings: Array.isArray(stored) ? null : (stored.settings || null),
  };
}

export function assertProjectsUnlocked(ids) {
  if (listProjects().some(project => ids.includes(project.id) && project.locked)) throw new Error('Unlock the selected models first.');
}

export function setProjectsLocked(ids, locked) {
  writeIndex(listProjects().map(project => ids.includes(project.id) ? { ...project, locked } : project));
  window.dispatchEvent(new Event('axis:projects-changed'));
}

export function moveProjects(ids, folderId) {
  assertProjectsUnlocked(ids);
  writeIndex(listProjects().map(project => ids.includes(project.id) ? { ...project, folderId } : project));
  window.dispatchEvent(new Event('axis:projects-changed'));
}

export function deleteProject(id) {
  assertProjectsUnlocked([id]);
  writeIndex(listProjects().filter(p => p.id !== id));
  window.dispatchEvent(new Event('axis:projects-changed'));
  return deleteMeshes(id);
}

export async function removeAccountProjectCopies(projectIds) {
  const ids = new Set(projectIds);
  for (const id of ids) await deleteMeshes(id);
  writeIndex(listProjects().filter((project) => !ids.has(project.id)));
  // Pending jobs belong to the session being deleted and must never re-upload.
  localStorage.removeItem('axis.cloud.pending');
  window.dispatchEvent(new Event('axis:projects-changed'));
}

export async function duplicateProject(id) {
  const projects = listProjects();
  const original = projects.find(p => p.id === id);
  if (!original) return null;
  const copy = {
    ...original,
    meshes: undefined,
    id: generateProjectId(),
    name: `${original.name} copy`,
    locked: false,
    updatedAt: Date.now(),
  };
  delete copy.meshes;
  const sceneData = (await getMeshes(id)) || original.meshes;
  if (sceneData) await putMeshes(copy.id, sceneData);
  writeIndex([...listProjects(), copy], copy.id);
  window.dispatchEvent(new Event('axis:projects-changed'));
  return copy;
}

export function generateProjectId() {
  return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}