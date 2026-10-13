import { base44 } from '@/api/base44Client';
import { listProjects, loadProject, saveProject } from '@/lib/storage';
import { trackAccountWrite } from '@/lib/accountDeletionState';

const PENDING_KEY = 'axis.cloud.pending';

const pendingIds = () => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
  catch { return []; }
};

const setPending = (ids) => localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(ids)]));
const markPending = (id) => setPending([...pendingIds(), id]);
const clearPending = (id) => setPending(pendingIds().filter((value) => value !== id));

export function backupProjectToCloud(project) {
  return trackAccountWrite(() => performBackup(project));
}

async function performBackup(project) {
  if (!(await base44.auth.isAuthenticated())) return false;
  markPending(project.id);
  const file = new File([JSON.stringify(project)], `${project.id}.json`, { type: 'application/json' });
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  const existing = await base44.entities.CloudBackup.filter({ project_id: project.id }, '-updated_date', 1);
  const data = { project_id: project.id, name: project.name, file_uri, backed_up_at: Date.now() };
  if (existing[0]) await base44.entities.CloudBackup.update(existing[0].id, data);
  else await base44.entities.CloudBackup.create(data);
  clearPending(project.id);
  return true;
}

async function flushPendingBackups() {
  for (const id of pendingIds()) {
    const project = await loadProject(id);
    if (!project) { clearPending(id); continue; }
    const thumbnail = listProjects().find((item) => item.id === id)?.thumbnail || null;
    await backupProjectToCloud({
      id: project.id,
      name: project.name,
      meshes: project.meshes.map((mesh) => mesh.serialize()),
      lights: project.lights || [],
      settings: project.settings || null,
      thumbnail,
    });
  }
}

export function syncCloudBackupsToLocal() {
  return trackAccountWrite(() => performSync());
}

async function performSync() {
  if (!(await base44.auth.isAuthenticated())) return false;
  await flushPendingBackups();
  const local = new Map(listProjects().map((project) => [project.id, project]));
  const backups = await base44.entities.CloudBackup.list('-backed_up_at', 200);
  for (const backup of backups) {
    const localProject = local.get(backup.project_id);
    if (localProject?.locked || (localProject && (localProject.updatedAt || 0) >= backup.backed_up_at)) continue;
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: backup.file_uri });
    const response = await fetch(signed_url);
    if (!response.ok) throw new Error(`Could not restore ${backup.name}`);
    const project = await response.json();
    if (!Array.isArray(project.meshes)) continue;
    await saveProject({ ...project, id: backup.project_id, name: backup.name });
  }
  return true;
}

export async function deleteCloudBackup(projectId) {
  if (!(await base44.auth.isAuthenticated())) return;
  const backups = await base44.entities.CloudBackup.filter({ project_id: projectId });
  await Promise.all(backups.map((backup) => base44.entities.CloudBackup.delete(backup.id)));
  clearPending(projectId);
}