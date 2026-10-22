// Object-selection outlines contain the same LOCAL edges as their actual meshes.
// Rebuilding thousands of edges on every pointer event causes the selection
// overlay to render a frame behind the moving object. Follow the existing
// THREE.Mesh transform instead, without touching the geometry or its topology.
export function syncObjectHighlightTransforms(manager) {
  const group = manager.highlightGroup;
  if (!group || !manager.threeObjects) return;
  for (const highlight of group.children) {
    const id = highlight.userData?.axisFollowMeshId;
    if (id == null) continue;
    const source = manager.threeObjects.get(id)?.mesh;
    if (!source) continue;
    highlight.position.copy(source.position);
    highlight.quaternion.copy(source.quaternion);
    highlight.scale.copy(source.scale);
  }
}

export function refreshTransformHighlights(manager) {
  if (manager.selection?.type === 'object' || manager.isGroupMode()) {
    syncObjectHighlightTransforms(manager);
  } else {
    manager.updateHighlights();
  }
}
