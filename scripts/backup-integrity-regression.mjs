import assert from 'node:assert/strict';
import { serializeBackup, deserializeBackup, BACKUP_MAX_BYTES } from '../src/lib/backupEnvelope.js';

// No real Supabase requests, accounts, payments or device data in these tests.
const project = {
  name: 'Test curve 🛠',
  thumbnail: 'data:image/jpeg;base64,AQIDBA==',
  scene: {
    meshes: [
      {
        name: 'Reference image plane', vertices: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 }, { id: 3, x: 0, y: 1, z: 0 }],
        faces: [[1, 2, 3]],
        referenceUrl: 'data:image/png;base64,AAECAwQFBg==',
        textureTransform: { scale: 1.3, rotation: 0.7, mirror: true },
        paintLayer: { strokes: [{ color: '#ff0000', size: 17 }] },
        clearCoatIntensity: 0.6, smoothShading: true,
      },
    ],
    lights: [{ type: 'spot', intensity: 1.5, color: '#ffffff' }],
    settings: { gridVisible: false, highlightColor: '#22ff33' },
  },
};
const before = structuredClone(project);
const encoded = await serializeBackup(project);
const envelope = JSON.parse(encoded);
assert.equal(envelope.schemaVersion, 2);
assert.match(envelope.checksumSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(await deserializeBackup(encoded), project);
assert.deepEqual(project, before, 'Serializing must never mutate local geometry/settings');
assert.equal((await deserializeBackup(encoded)).scene.meshes[0].referenceUrl, project.scene.meshes[0].referenceUrl);

const tampered = structuredClone(envelope);
tampered.project.scene.meshes[0].vertices[1].x = 999;
await assert.rejects(() => deserializeBackup(JSON.stringify(tampered)), /integrity check/);

const tamperedImage = structuredClone(envelope);
tamperedImage.project.scene.meshes[0].referenceUrl = 'data:image/png;base64,AA==';
await assert.rejects(() => deserializeBackup(JSON.stringify(tamperedImage)), /integrity check/);

const missingHash = structuredClone(envelope);
delete missingHash.checksumSha256;
await assert.rejects(() => deserializeBackup(JSON.stringify(missingHash)), /checksum/);

await assert.rejects(() => deserializeBackup(encoded.slice(0, -11)), /corrupted or incomplete/);
await assert.rejects(() => deserializeBackup('not-json'), /corrupted/);
await assert.rejects(() => deserializeBackup('{}'), /not supported/);
await assert.rejects(() => deserializeBackup(JSON.stringify({ schemaVersion: 2, project: { scene: { meshes: [{}] } }, checksumSha256: envelope.checksumSha256 })), /invalid mesh/);

const legacy = JSON.stringify({ schemaVersion: 1, project });
assert.deepEqual(await deserializeBackup(legacy), project, 'Previous test APK backups must still be restorable');
const huge = 'x'.repeat(BACKUP_MAX_BYTES + 1);
await assert.rejects(() => deserializeBackup(huge), /too large/);

console.log('Verified backups: scene geometry, paint, reference images, lights, settings, corruption, size and legacy restores passed.');
