import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';

// Reference images are ordinary, editable scene planes; only their image URL is special.
export function applySceneReference(SceneManager) {
  SceneManager.prototype.addReferenceImage = function (url) {
    this.pushUndo();
    const mesh = new EditableMesh('Reference');
    while (this.meshes.some((existing) => existing.id === mesh.id)) mesh.id = Date.now() + Math.floor(Math.random() * 1000000);
    mesh.vertices = [
      { id: 1, x: -1, y: -1, z: 0 }, { id: 2, x: 1, y: -1, z: 0 },
      { id: 3, x: 1, y: 1, z: 0 }, { id: 4, x: -1, y: 1, z: 0 },
    ];
    mesh.faces = [[1, 2, 3, 4]];
    mesh.position.y = 1;
    mesh.color = 0xffffff;
    mesh.uvMode = 'planar';
    mesh.referenceUrl = url;
    this.meshes.push(mesh);
    this.buildThreeMesh(mesh);
    if (this.selectionMode !== 'object') {
      this.setSelectionMode('object');
      this.cb.onSelectionModeChange?.('object');
    }
    this.setSelection({ meshId: mesh.id, type: 'object', indices: [] });
    this.updateStats();
    return mesh;
  };
}

export function loadReferenceImage(manager, mesh) {
  if (!mesh.referenceUrl || mesh.mapTexture) return;
  const url = mesh.referenceUrl;
  new THREE.TextureLoader().load(url, (texture) => {
    if (manager.getMesh(mesh.id) !== mesh || mesh.referenceUrl !== url) {
      texture.dispose();
      return;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    mesh.mapTexture = texture;
    manager.updateObjectMaterial(mesh.id);
  });
}