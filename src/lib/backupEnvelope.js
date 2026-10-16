// AXIS cloud backup envelope. Kept independent from the modeler engine.
// v1 backups made by the first Supabase test APK remain readable.
// v2 adds SHA-256 over the exact canonical serialized project payload.
// The checksum detects accidental corruption, not a malicious cloud administrator.

export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
const encoder = new TextEncoder();

function assertProjectShape(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error('The cloud backup does not contain a project.');
  }
  const scene = project.scene;
  if (!scene || !Array.isArray(scene.meshes)) {
    throw new Error('The cloud backup does not contain readable model geometry.');
  }
  for (const mesh of scene.meshes) {
    if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) {
      throw new Error('The cloud backup contains an invalid mesh. No local project was changed.');
    }
  }
  return project;
}

async function sha256Hex(value) {
  // Capacitor serves its bundled app from a secure origin, providing Web Crypto.
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure backup verification is unavailable on this device.');
  }
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function serializeBackup(project) {
  assertProjectShape(project);
  // Normalize first so the checksum covers the same data that is uploaded.
  const projectJSON = JSON.stringify(project);
  if (!projectJSON) throw new Error('Model serialization failed.');
  const canonical = JSON.parse(projectJSON);
  const digest = await sha256Hex(projectJSON);
  const serialized = JSON.stringify({ schemaVersion: 2, project: canonical, checksumSha256: digest });
  if (encoder.encode(serialized).byteLength > BACKUP_MAX_BYTES) {
    throw new Error('This model exceeds the 50 MB test-backup limit.');
  }
  return serialized;
}

export async function deserializeBackup(json) {
  if (typeof json !== 'string' || encoder.encode(json).byteLength > BACKUP_MAX_BYTES) {
    throw new Error('The cloud backup is too large to restore safely.');
  }
  let data;
  try { data = JSON.parse(json); }
  catch { throw new Error('The cloud backup is corrupted or incomplete. No local project was changed.'); }

  if (data?.schemaVersion !== 1 && data?.schemaVersion !== 2) {
    throw new Error('This backup format is not supported by this Axis version.');
  }
  const project = assertProjectShape(data.project);

  if (data.schemaVersion === 2) {
    if (!/^[0-9a-f]{64}$/.test(data.checksumSha256 || '')) {
      throw new Error('The backup checksum is missing or invalid.');
    }
    const digest = await sha256Hex(JSON.stringify(project));
    if (digest !== data.checksumSha256) {
      throw new Error('The cloud backup failed its integrity check. No local project was changed.');
    }
  }
  return project;
}
