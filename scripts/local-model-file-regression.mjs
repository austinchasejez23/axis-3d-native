// Regression checks for real model file bytes and local-save API behavior.
// Uses esbuild to resolve Vite-style extensionless internal imports in Node.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { unzipSync, strFromU8 } from 'fflate';
import * as THREE from 'three';

const directory = await mkdtemp(join(tmpdir(), 'axis-local-files-'));
const sources = [
  'src/lib/importers.js', 'src/lib/exporters.js', 'src/lib/exporters3d.js',
  'src/lib/EditableMesh.js',
];
await build({
  entryPoints: sources,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: directory,
  outExtension: { '.js': '.mjs' },
  logLevel: 'silent',
});
const get = async (name) => import(pathToFileURL(join(directory, name + '.mjs')).href);
const { importModelFile } = await get('importers');
const { exportOBJ, exportFBX, downloadFile } = await get('exporters');
const { exportSTL, exportGLB, export3MF } = await get('exporters3d');
const { EditableMesh } = await get('EditableMesh');

const makeFile = (name, data) => {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  return {
    name,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer,
  };
};
const span = (mesh, axis) => Math.max(...mesh.vertices.map(v => v[axis]))
  - Math.min(...mesh.vertices.map(v => v[axis]));
const approx = (got, wanted, message) =>
  assert.ok(Math.abs(got - wanted) < 1e-3, `${message}: ${got} vs ${wanted}`);

const objFile = makeFile('part.obj', [
  'o Workpiece', 'v 100 200 300', 'v 120 200 300',
  'v 100 240 300', 'f 1 2 3', '',
].join('\n'));
const [original] = await importModelFile(objFile);
approx(span(original, 'x'), 20, 'Import must preserve X dimensions');
approx(span(original, 'y'), 40, 'Import must preserve Y dimensions');
assert.equal(original.faces.length, 1);

const roundtrip = async (extension, bytes) => {
  const [mesh] = await importModelFile(makeFile(`part.${extension}`, bytes));
  assert.equal(mesh.faces.length, 1, `${extension} must roundtrip faces`);
  approx(span(mesh, 'x'), 20, `${extension} X`);
  approx(span(mesh, 'y'), 40, `${extension} Y`);
};

await roundtrip('obj', exportOBJ([original]));
await roundtrip('stl', exportSTL([original]));
await roundtrip('glb', exportGLB([original]));
await roundtrip('fbx', exportFBX([original]));
const zipped = unzipSync(export3MF([original]));
const xml = strFromU8(zipped['3D/3dmodel.model']);
assert.match(xml, /<triangle /);
assert.match(xml, /<vertex /);
assert.ok(zipped['[Content_Types].xml']);
console.log('PASS: OBJ, STL, GLB, FBX geometry roundtrips and valid 3MF archive');

// Geometry-only imports retain the editable mesh and draw neutral wireframes.
// No source normals or materials are transferred to the imported object.
const objForGeometry = (geometry) => {
  const g = geometry.toNonIndexed();
  const pos = g.attributes.position;
  const lines = ['o TestMesh'];
  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}`);
  }
  for (let i = 0; i < pos.count; i += 3) {
    lines.push(`f ${i + 1} ${i + 2} ${i + 3}`);
  }
  g.dispose();
  return lines.join('\n') + '\n';
};
const [sphere] = await importModelFile(makeFile(
  'sphere.obj', objForGeometry(new THREE.SphereGeometry(2, 20, 14)),
));
assert.equal(sphere.smoothShading, false);
assert.equal(sphere.importedFeatureEdges, false);
assert.equal(sphere.importedWireframeOnly, true);
assert.equal(sphere.color, 0xaeb4bc);
assert.equal(sphere.material, null);
assert.equal(sphere.mapTexture, null);
assert.equal(sphere.textureUrl, null);
assert.equal(sphere.roughness, null);
assert.equal(sphere.metalness, null);
assert.deepEqual(sphere.faceColors, {});
assert.deepEqual(sphere.vertexColors, {});
const editableEdgeCount = sphere.getEdges().length;
const displayEdgeCount = sphere.toEdgesGeometry().attributes.position.count / 2;
assert.equal(displayEdgeCount, editableEdgeCount,
  `Every source mesh edge must remain visible in geometry-only wireframe (${displayEdgeCount}/${editableEdgeCount})`);
assert.equal(EditableMesh.deserialize(sphere.serialize()).importedWireframeOnly, true);
assert.equal(sphere.clone().importedWireframeOnly, true);

const [box] = await importModelFile(makeFile(
  'cube.obj', objForGeometry(new THREE.BoxGeometry(2, 2, 2)),
));
const boxDisplayEdges = box.toEdgesGeometry().attributes.position.count / 2;
assert.ok(boxDisplayEdges >= 12, `Hard box creases disappeared: ${boxDisplayEdges}`);
console.log('PASS: imported geometry-only wireframe, editable topology and persisted import mode');

// The source GLB's red color and PBR values must be discarded entirely.
const glbFixture = new Uint8Array(exportGLB([original]));
const sourceGlbView = new DataView(glbFixture.buffer);
const jsonBytes = sourceGlbView.getUint32(12, true);
const glbJson = JSON.parse(new TextDecoder().decode(glbFixture.subarray(20, 20 + jsonBytes)));
glbJson.materials = [{
  pbrMetallicRoughness: {
    baseColorFactor: [1, 0, 0, 1], metallicFactor: 0.25, roughnessFactor: 0.7,
  },
}];
glbJson.meshes[0].primitives[0].material = 0;
const encodedJson = new TextEncoder().encode(JSON.stringify(glbJson));
const paddedJson = new Uint8Array(Math.ceil(encodedJson.length / 4) * 4).fill(32);
paddedJson.set(encodedJson);
const binaryChunk = glbFixture.subarray(20 + jsonBytes);
const coloredGlb = new Uint8Array(20 + paddedJson.length + binaryChunk.length);
const coloredView = new DataView(coloredGlb.buffer);
coloredView.setUint32(0, 0x46546c67, true);
coloredView.setUint32(4, 2, true);
coloredView.setUint32(8, coloredGlb.length, true);
coloredView.setUint32(12, paddedJson.length, true);
coloredView.setUint32(16, 0x4e4f534a, true);
coloredGlb.set(paddedJson, 20);
coloredGlb.set(binaryChunk, 20 + paddedJson.length);
const [colored] = await importModelFile(makeFile('red.glb', coloredGlb));
assert.equal(colored.color, 0xaeb4bc);
assert.equal(colored.metalness, null);
assert.equal(colored.roughness, null);
assert.equal(colored.material, null);
assert.equal(colored.mapTexture, null);
assert.equal(colored.opacity, 1);
assert.equal(colored.emissive, 0);
assert.equal(colored.smoothShading, false);
assert.equal(colored.importedWireframeOnly, true);
assert.deepEqual(colored.faceColors, {});
assert.deepEqual(colored.vertexColors, {});
assert.equal(EditableMesh.deserialize(colored.serialize()).color, 0xaeb4bc);
console.log('PASS: colored metallic GLB imports geometry only, no source appearance');

// Browser fallback is an explicit download request (not proof that Android
// saved a file). The native Android save path is covered by the Capacitor
// plugin registration regression and Android Gradle compilation.
const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalSetTimeout = globalThis.setTimeout;
try {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { userAgent: 'Mozilla/5.0 (Linux; Android 16; wv)' },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  let clicked = 0;
  let revoked = 0;
  globalThis.document = {
    body: { appendChild: () => {} },
    createElement: () => ({
      click: () => { clicked++; },
      remove: () => {},
    }),
  };
  URL.createObjectURL = () => 'blob:local-test';
  URL.revokeObjectURL = () => { revoked++; };
  globalThis.setTimeout = (callback, ms, ...args) =>
    ms === 60000 ? callback() : originalSetTimeout(callback, ms, ...args);

  assert.equal(await downloadFile('mesh bytes', 'part.obj', 'text/plain'), 'requested');
  assert.equal(clicked, 1, 'Browser fallback must initiate a real download');
  assert.equal(revoked, 1, 'Temporary blob URL must be reclaimed');
  console.log('PASS: browser fallback requests actual download instead of reporting saved');

  globalThis.navigator.share = async (data) => {
    assert.equal(data.files[0].name, 'part.obj');
  };
  globalThis.navigator.canShare = () => true;
  assert.equal(await downloadFile('mesh bytes', 'part.obj'), 'shared');
  console.log('PASS: Android web share API fallback returns confirmed share result');
} finally {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: originalNavigator,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: originalWindow,
  });
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.setTimeout = originalSetTimeout;
}
