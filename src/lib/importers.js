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
      // A reflected transform (negative scale on an odd number of axes)
      // reverses triangle orientation when baked into positions. Compensate
      // for that reversal so the editable mesh keeps its outward-facing
      // surfaces. Otherwise mirrored GLB/FBX parts can appear black or
      // disappear with backface culling. Never change the source geometry.
      if (child.matrixWorld.determinant() < 0) {
        const indices = geo.getIndex();
        if (indices) {
          for (let i = 0; i + 2 < indices.count; i += 3) {
            const second = indices.getX(i + 1);
            indices.setX(i + 1, indices.getX(i + 2));
            indices.setX(i + 2, second);
          }
        } else {
          const pos = geo.getAttribute('position');
          for (let i = 0; i + 2 < pos.count; i += 3) {
            const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
            pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
            pos.setXYZ(i + 2, x, y, z);
          }
        }
      }
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