import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { EditableMesh } from './EditableMesh';

// Import an uploaded .obj, .fbx, .stl, .glb/.gltf or .3mf model file into one EditableMesh per mesh found
// in the file. World transforms are baked into vertex positions, then the whole
// model is centered at the origin and scaled to fit a ~2-unit box so it lands
// in view and is easy to edit. Returns an array of EditableMesh.
export async function importModelFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let root;
  if (ext === 'obj') {
    const text = await file.text();
    // Yield before the heavy synchronous parse so the UI can paint a loading
    // indicator instead of freezing the main thread on large files.
    await new Promise((r) => setTimeout(r, 0));
    root = new OBJLoader().parse(text);
  } else if (ext === 'fbx') {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 0));
    root = new FBXLoader().parse(buf);
  } else if (ext === 'stl') {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 0));
    root = new THREE.Mesh(new STLLoader().parse(buf));
  } else if (ext === 'glb' || ext === 'gltf') {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 0));
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(buf, '', resolve, reject);
    });
    root = gltf.scene;
  } else if (ext === '3mf') {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 0));
    root = new ThreeMFLoader().parse(buf);
  } else {
    throw new Error('Unsupported format. Use .obj, .fbx, .stl, .glb, .gltf or .3mf');
  }

  await new Promise((r) => setTimeout(r, 0));

  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child.isMesh && child.geometry && child.geometry.attributes.position) {
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);
      const mesh = EditableMesh.fromGeometry(geo, child.name || file.name);
      geo.dispose();
      if (mesh.vertices.length > 0 && mesh.faces.length > 0) meshes.push(mesh);
    }
  });

  if (meshes.length === 0) throw new Error('No mesh geometry found in file');

  await new Promise((r) => setTimeout(r, 0));

  // Center + uniformly scale the combined model to fit a ~2-unit bounding box
  // at the origin so the imported model is visible in the default camera.
  const box = new THREE.Box3();
  for (const m of meshes) {
    for (const v of m.vertices) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 1e-6 ? 2 / maxDim : 1;
  for (const m of meshes) {
    for (const v of m.vertices) {
      v.x = (v.x - center.x) * scale;
      v.y = (v.y - center.y) * scale;
      v.z = (v.z - center.z) * scale;
    }
    m.invalidateCache();
  }
  return meshes;
}