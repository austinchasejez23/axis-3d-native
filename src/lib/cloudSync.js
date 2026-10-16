import { listProjects, saveProject, generateProjectId } from './storage';
import { getMeshes } from './projectStore';
import { cloudRequest, getCloudIdentity } from './supabaseTest';
import { BACKUP_MAX_BYTES, serializeBackup, deserializeBackup } from './backupEnvelope';

const BUCKET = 'axis-model-backups';

function assertUuid(value) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) {
    throw new Error('Invalid cloud project identifier.');
  }
  return value;
}

function objectEndpoint(path) {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  return '/storage/v1/object/' + BUCKET + '/' + safePath;
}

export async function listCloudBackups() {
  await getCloudIdentity();
  const records = await cloudRequest('/rest/v1/axis_cloud_projects?select=id,client_project_id,name,storage_path,updated_at&order=updated_at.desc');
  return Array.isArray(records) ? records : [];
}

// Upload is EXPLICIT. Autosave remains strictly local, including when online.
export async function backupLocalProject(localId) {
  const user = await getCloudIdentity();
  const local = listProjects().find(item => item.id === localId);
  if (!local) throw new Error('Local model no longer exists.');
  const scene = await getMeshes(localId) || local.meshes;
  if (!scene) throw new Error('Local geometry was not found. Nothing was uploaded.');
  const serializedScene = Array.isArray(scene) ? { meshes: scene, lights: [], settings: null } : scene;
  if (!Array.isArray(serializedScene.meshes)) throw new Error('The local model cannot be backed up safely.');
  const json = await serializeBackup({ name: local.name, scene: serializedScene, thumbnail: local.thumbnail || null });
  const filter = encodeURIComponent(localId);
  const rows = await cloudRequest('/rest/v1/axis_cloud_projects?select=id,storage_path&client_project_id=eq.' + filter + '&limit=1');
  const previous = rows?.[0];
  const id = previous ? assertUuid(previous.id) : crypto.randomUUID();
  const path = user.id + '/' + id + '.json';
  // Existing paths must match their metadata; never permit an arbitrary overwrite.
  if (previous && previous.storage_path !== path) throw new Error('Cloud backup path did not match expected owner.');
  await cloudRequest(objectEndpoint(path), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: json,
  });
  const row = { id, user_id: user.id, client_project_id: localId, name: local.name, storage_path: path };
  if (previous) {
    await cloudRequest('/rest/v1/axis_cloud_projects?id=eq.' + id, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { name: local.name, updated_at: new Date().toISOString() },
    });
  } else {
    await cloudRequest('/rest/v1/axis_cloud_projects', {
      method: 'POST', headers: { Prefer: 'return=minimal' }, body: row,
    });
  }
  return local.name;
}

// Restores as a NEW local ID. Never overwrite a user's existing local work.
export async function restoreCloudBackup(record, maxProjects) {
  const user = await getCloudIdentity();
  const id = assertUuid(record.id);
  const expected = user.id + '/' + id + '.json';
  if (record.storage_path !== expected) throw new Error('Unexpected backup path. Restore cancelled.');
  if (listProjects().length >= maxProjects) throw new Error('The Free project limit is reached. No models were overwritten.');
  const response = await cloudRequest(objectEndpoint(expected), { raw: true });
  const reportedBytes = Number(response.headers.get('content-length'));
  if (reportedBytes > BACKUP_MAX_BYTES) throw new Error('This cloud backup exceeds the safe restore size.');
  // Verify before writing ANY geometry to IndexedDB or touching the library.
  const project = await deserializeBackup(await response.text());
  // The model limit may change while an upload/restore is in flight.
  if (listProjects().length >= maxProjects) throw new Error('The Free project limit is reached. No models were overwritten.');
  const name = String(project.name || record.name || 'Restored model').slice(0, 255);
  const scene = project.scene;
  await saveProject({
    id: generateProjectId(), name: name + ' (restored)',
    meshes: scene.meshes, lights: Array.isArray(scene.lights) ? scene.lights : [],
    settings: scene.settings || null,
    thumbnail: typeof project.thumbnail === 'string' && project.thumbnail.length < 300000 && /^data:image\/(?:png|jpeg|webp);base64,/i.test(project.thumbnail) ? project.thumbnail : null,
  });
  return name;
}

export async function deleteCloudBackup(record) {
  const user = await getCloudIdentity();
  const id = assertUuid(record.id);
  const expected = user.id + '/' + id + '.json';
  if (record.storage_path !== expected) throw new Error('Unexpected backup owner.');
  await cloudRequest(objectEndpoint(expected), { method: 'DELETE' });
  await cloudRequest('/rest/v1/axis_cloud_projects?id=eq.' + id, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  });
}
