import { clonePaintLayer } from '@/lib/paintLayer';

export default function cloneObjects(manager) {
  if (manager.selection.type !== 'object') return;
  const sources = manager.targetMeshIds().map((id) => manager.getMesh(id)).filter(Boolean);
  if (!sources.length) return;
  manager.pushUndo();
  const cloneIds = [];
  const usedIds = new Set(manager.meshes.map((mesh) => mesh.id));
  let nextId = Date.now();
  for (const mesh of sources) {
    const clone = mesh.clone();
    while (usedIds.has(nextId)) nextId++;
    clone.id = nextId++;
    usedIds.add(clone.id);
    clone.paintLayer = clonePaintLayer(mesh.paintLayer);
    clone.name = mesh.name + ' copy';
    manager.meshes.push(clone);
    manager.buildThreeMesh(clone);
    cloneIds.push(clone.id);
  }
  manager.selection = { meshId: cloneIds[0], type: 'object', indices: [] };
  manager.selectedMeshIds = cloneIds;
  manager.updateHighlights();
  manager.updateStats();
}