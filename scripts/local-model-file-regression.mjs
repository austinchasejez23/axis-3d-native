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
  'src/lib/materials.js',
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
const { createMaterial, applyWireframe } = await get('materials');

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
assert.equal(sphere.importedFeatureEdges, true);
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
assert.ok(displayEdgeCount > 0 && displayEdgeCount < editableEdgeCount,
  `The imported wireframe must hide smooth triangle seams without removing editable topology (${displayEdgeCount}/${editableEdgeCount})`);
assert.equal(sphere.getEdges().length, editableEdgeCount,
  'Showing only feature edges must not remove editable triangle edges');
const olderSavedImport = sphere.serialize();
olderSavedImport.importedFeatureEdges = false;
const restoredOldImport = EditableMesh.deserialize(olderSavedImport);
assert.equal(restoredOldImport.toEdgesGeometry().attributes.position.count / 2, displayEdgeCount,
  'Existing saved wireframe-only imports should also suppress triangulation seams');
assert.equal(EditableMesh.deserialize(sphere.serialize()).importedWireframeOnly, true);
assert.equal(sphere.clone().importedWireframeOnly, true);

const [box] = await importModelFile(makeFile(
  'cube.obj', objForGeometry(new THREE.BoxGeometry(2, 2, 2)),
));
const boxDisplayEdges = box.toEdgesGeometry().attributes.position.count / 2;
assert.equal(boxDisplayEdges, 12, `Import should show the 12 cube creases, not its triangulation diagonals: ${boxDisplayEdges}`);
// A bent joint contains a long REAL edge shared by two non-coplanar triangles.
// The older imported classifier removed it solely because it was longest.
const bentGeometry = new THREE.BufferGeometry();
bentGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0, 1, 1, 0, 5, 0, 0,
  5, 0, 0, 2, -1, 1, 0, 0, 0,
], 3));
const bentJoint = EditableMesh.fromGeometry(bentGeometry, 'bent joint');
bentGeometry.dispose();
bentJoint.importedWireframeOnly = true;
assert.equal(bentJoint.getEdges().length, 5);
assert.equal(bentJoint.toEdgesGeometry().getAttribute('position').count / 2, 5,
  'A genuine long edge at a twisted joint must remain visible');

// Tube meshes must keep every circumferential ring and axial line intact.
// Only the diagonals crossing individual tube surface cells should disappear.
const tube = EditableMesh.fromGeometry(new THREE.CylinderGeometry(1, 1, 6, 12, 12), 'tube');
tube.importedWireframeOnly = true;
const tubeDisplay = tube.toEdgesGeometry().getAttribute('position');
const pairKey = (a, b) => [a, b].map(v => v.map(n => n.toFixed(5)).join(',')).sort().join('|');
const rendered = new Set();
for (let i = 0; i < tubeDisplay.count; i += 2) {
  const a = [tubeDisplay.getX(i), tubeDisplay.getY(i), tubeDisplay.getZ(i)];
  const b = [tubeDisplay.getX(i + 1), tubeDisplay.getY(i + 1), tubeDisplay.getZ(i + 1)];
  rendered.add(pairKey(a, b));
}
let requiredStructure = 0;
for (const e of tube.getEdges()) {
  const av = tube.getVertex(e.v1), bv = tube.getVertex(e.v2);
  const a = [av.x, av.y, av.z], b = [bv.x, bv.y, bv.z];
  const sameRing = Math.abs(av.y - bv.y) < 1e-5 &&
    Math.hypot(av.x, av.z) > 0.9 && Math.hypot(bv.x, bv.z) > 0.9;
  const axial = Math.abs(av.x - bv.x) < 1e-5 &&
    Math.abs(av.z - bv.z) < 1e-5 && Math.abs(av.y - bv.y) > 1e-5;
  if (sameRing || axial) {
    requiredStructure++;
    assert.ok(rendered.has(pairKey(a, b)),
      'Imported tube lost an existing ring or longitudinal wireframe edge');
  }
}
assert.ok(requiredStructure > 100, 'Tube edge-coverage regression is too small');

// Geometry-only means discard source appearance, NOT leave a hollow, black
// object. Surface and line overlay must be visible at the same time.
const neutralSurface = createMaterial(box);
assert.equal(neutralSurface.colorWrite, true,
  'Imported neutral faces must be drawn even when wireframe is visible');
assert.equal(neutralSurface.color.getHex(), 0xaeb4bc);
const renderObject = { material: neutralSurface, wireframe: { visible: true } };
const sceneStub = { threeObjects: new Map([[box.id, renderObject]]), wireframesHidden: false };
applyWireframe(sceneStub);
assert.equal(neutralSurface.colorWrite, true, 'Enabling wireframe must not erase imported faces');
sceneStub.wireframesHidden = true;
applyWireframe(sceneStub);
assert.equal(neutralSurface.colorWrite, true, 'Hiding wireframe must not erase imported faces');
neutralSurface.dispose();

console.log('PASS: imported structural ring/joint edges, neutral solid faces, legacy saved imports, and editable topology');

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

const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;
try {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { userAgent: 'Mozilla/5.0 (Linux; Android 16; wv)' },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  await assert.rejects(
    downloadFile('mesh bytes', 'part.obj', 'text/plain'),
    /cannot save local exports yet/,
  );

  const saved = [];
  globalThis.window.showSaveFilePicker = async () => ({
    createWritable: async () => ({
      write: async (blob) => saved.push(await blob.text()),
      close: async () => {},
    }),
  });
  assert.equal(await downloadFile('mesh bytes', 'part.obj'), 'saved');
  assert.deepEqual(saved, ['mesh bytes']);

  delete globalThis.window.showSaveFilePicker;
  globalThis.navigator.share = async (data) => {
    assert.equal(data.files[0].name, 'part.obj');
  };
  globalThis.navigator.canShare = () => true;
  assert.equal(await downloadFile('mesh bytes', 'part.obj'), 'shared');
  console.log('PASS: real save/share APIs and no false WebView download success');
} finally {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: originalNavigator,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: originalWindow,
  });
}
