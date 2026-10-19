import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { EditableMesh } from './EditableMesh';

// Import a device-selected .obj, .fbx, .stl, .glb/.gltf or .3mf model file.
// Preserve its coordinates and original dimensions. Imported mesh transforms
// are baked into vertex positions; changing the model's size just to make it
// fit the viewport would silently corrupt dimensions in a CAD application.
// Returns editable meshes that can be added to the current scene.
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
      // Create a POSITION-ONLY copy. No imported normals, UVs, colors,
      // tangents, skinning, morph attributes, source materials or textures are
      // carried into the editable model. Axis generates whatever temporary
      // face normals it needs for editing from the geometry itself.
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', child.geometry.attributes.position.clone());
      if (child.geometry.index) geo.setIndex(child.geometry.index.clone());
      geo.applyMatrix4(child.matrixWorld);
      const mesh = EditableMesh.fromGeometry(geo, child.name || file.name);
      geo.dispose();
      if (mesh.vertices.length > 0 && mesh.faces.length > 0) {
        // Only the editable vertices, edges and faces. Do not transfer any
        // appearance data from the source model.
        mesh.importedWireframeOnly = true;
        mesh.importedFeatureEdges = false;
        meshes.push(mesh);
      }
    }
  });

  if (meshes.length === 0) throw new Error('No mesh geometry found in file');

  // Do not normalize dimensions or shift the model to the origin. The caller
  // frames the camera after import so even a large model is visible.
  return meshes;
}