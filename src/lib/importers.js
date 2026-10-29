import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { EditableMesh } from './EditableMesh';
import { reconstructImportedQuads } from './quadMerge';

// Import a device-selected .obj, .fbx, .stl, .glb/.gltf or .3mf model file.
// Bake imported transforms into geometry, then uniformly downscale the entire
// import only when its longest bounding-box dimension exceeds 100 inches.
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
        // Suppress tessellation seams in the displayed import; retain every
        // triangle and edge in the editable geometry.
        mesh.importedFeatureEdges = true;
        // Pair the triangles back into the quads they were written from, so
        // the import shows its real grid with no triangulation diagonals.
        // OBJ / FBX / glTF keep each quad's two triangles together in order;
        // STL and 3MF are triangle soup and are paired by shape alone.
        reconstructImportedQuads(mesh, { trustOrder: ext !== 'stl' && ext !== '3mf' });
        meshes.push(mesh);
      }
    }
  });

  if (meshes.length === 0) throw new Error('No mesh geometry found in file');

  // Keep all parts at the same relative positions and proportions. Scale only
  // oversized imports; smaller models retain their original dimensions.
  const bounds = new THREE.Box3();
  for (const mesh of meshes) {
    for (const vertex of mesh.vertices) {
      const p = Array.isArray(vertex) ? vertex : vertex.position ?? vertex;
      bounds.expandByPoint(new THREE.Vector3(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]));
    }
  }
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest > 100) {
    const factor = 100 / longest;
    for (const mesh of meshes) {
      for (const vertex of mesh.vertices) {
        const p = Array.isArray(vertex) ? vertex : vertex.position ?? vertex;
        if (Array.isArray(p)) { p[0] *= factor; p[1] *= factor; p[2] *= factor; }
        else { p.x *= factor; p.y *= factor; p.z *= factor; }
      }
    }
  }
  return meshes;
}