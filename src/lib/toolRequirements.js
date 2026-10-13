const OBJECT_TOOLS = new Set([
  'merge', 'mirror', 'soft_normals', 'separate', 'divide', 'smooth',
  'clone', 'radial_array', 'delete',
]);
const FACE_TOOLS = new Set(['detach', 'clone', 'extrude', 'delete']);
const EDGE_TOOLS = new Set([
  'create_face_border', 'split', 'bevel', 'extrude',
  'select_ring', 'select_loop', 'delete',
]);

export function getToolRequirementNotice(manager, toolId) {
  if (!manager) return 'The modeling view is not ready yet';
  const selection = manager.selection || {};
  const count = selection.indices?.length || 0;
  const mode = manager.selectionMode;
  const objectCount = manager.selectedMeshIds?.length || 0;

  if (['combine', 'subtract', 'union', 'intersect'].includes(toolId) && objectCount < 2) {
    return 'Select two or more objects first';
  }
  if (toolId.startsWith('convert_') && !selection.meshId) {
    return 'Select an object, face, edge, or vertex to convert';
  }
  if (mode === 'object' && OBJECT_TOOLS.has(toolId) && objectCount < 1) {
    if (toolId === 'merge') return 'select object to merge close verticals';
    if (toolId === 'soft_normals') return 'select object to apply soft normals';
    return `Select an object to ${toolId === 'clone' ? 'clone' : toolId.replace(/_/g, ' ')}`;
  }
  if (mode === 'face' && FACE_TOOLS.has(toolId) && (!selection.meshId || count < 1)) {
    return `Select one or more faces to ${toolId}`;
  }
  if (mode === 'edge' && EDGE_TOOLS.has(toolId) && (!selection.meshId || count < 1)) {
    return `Select one or more edges to ${toolId.replace(/_/g, ' ')}`;
  }
  if (mode === 'vertex') {
    if (toolId === 'target_merge') {
      const pair = manager.targetMergePair;
      const validPair = pair?.meshId === selection.meshId && pair.sourceId != null && pair.sourceId !== pair.targetId;
      if (!validPair && count < 2) return 'Select a source vertex, then a target vertex to merge into';
    }
    const needed = toolId === 'create_face' ? 3 : ['connect', 'merge'].includes(toolId) ? 2 : toolId === 'delete' ? 1 : 0;
    if (count < needed) return `Select ${needed === 1 ? 'a vertex' : `${needed} or more vertices`} to ${toolId.replace(/_/g, ' ')}`;
  }
  return null;
}