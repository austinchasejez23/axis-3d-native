export const TOOL_GUIDE_SECTIONS = [
  {
    title: 'General tools',
    items: [
      { name: 'Materials', description: 'Opens Paint, Material, and Texture for coloring and surfacing objects.' },
      { name: 'Sculpt', description: 'Push, pull, move, or smooth the surface by dragging on it. Requires AXIS 3D Pro.' },
      { name: 'Free Transform', description: 'Lets you move, rotate, and scale the selection directly with touch gestures.' },
      { name: 'Reference', description: 'Imports an image to use as a modeling reference.' },
      { name: 'Convert', description: 'Changes the current selection between object, face, edge, and vertex selection types.' },
      { name: 'Display selected', description: 'Shows only the selected object or geometry, hiding everything else.' },
      { name: 'Protractor', description: 'Measures the selected edge’s angle relative to the vertical axis.' },
      { name: 'Measure', description: 'Tap two points on the geometry to measure the distance between them.' },
    ],
  },
  {
    title: 'Object tools',
    items: [
      { name: 'Merge vertices', description: 'Welds coincident or nearby vertices to clean up the mesh.' },
      { name: 'Mirror', description: 'Duplicates and flips the selected object across a mirror axis.' },
      { name: 'Lock', description: 'Locks selected objects. Unlock releases locked objects.' },
      { name: 'Boolean', description: 'Provides Subtract, Union, and Intersect operations for combining or cutting objects.' },
      { name: 'Subtract', description: 'Cuts the shape of one object out of another.' },
      { name: 'Union', description: 'Fuses overlapping objects into a single solid.' },
      { name: 'Intersect', description: 'Retains only the overlapping portion of selected objects.' },
      { name: 'Soft normals', description: 'Blends shading between neighboring faces without changing geometry. Toggle off to restore hard edges.' },
      { name: 'Combine', description: 'Merges the selected objects into one editable mesh.' },
      { name: 'Separate', description: 'Turns disconnected sections of a mesh into individual objects.' },
      { name: 'Divide', description: 'Subdivides the mesh to create additional faces and edges.' },
      { name: 'Smooth', description: 'Softens the mesh shape by adjusting vertex positions.' },
      { name: 'Clone', description: 'Creates a duplicate of the current selection.' },
      { name: 'Segments', description: 'Adjusts the segment count of a primitive shape.' },
      { name: 'Radial array', description: 'Creates evenly spaced copies around a rotation axis.' },
    ],
  },
  {
    title: 'Face tools',
    items: [
      { name: 'Draw face', description: 'Draw an enclosed outline to generate a new face or shape.' },
      { name: 'Detach', description: 'Separates selected faces from the object.' },
      { name: 'Clone', description: 'Duplicates the selected faces.' },
      { name: 'Bridge', description: 'Connects two selected faces or edges by creating geometry between them.' },
      { name: 'Extrude', description: 'Extends selected faces to create new geometry.' },
    ],
  },
  {
    title: 'Edge tools',
    items: [
      { name: 'New face', description: 'Creates a face using selected boundary edges.' },
      { name: 'Bridge', description: 'Connects two selected faces or edges by creating geometry between them.' },
      { name: 'Split', description: 'Divides selected edges into smaller edges.' },
      { name: 'Draw cut', description: 'Tap an edge to place a cut point.' },
      { name: 'Bevel', description: 'Creates a rounded or angled transition along selected edges.' },
      { name: 'Extrude', description: 'Pulls selected edges outward to form new faces.' },
      { name: 'Select ring', description: 'Selects a ring of connected edges.' },
      { name: 'Select loop', description: 'Selects a continuous loop of edges.' },
      { name: 'Cut loop', description: 'Adds a continuous edge loop through the object.' },
    ],
  },
  {
    title: 'Vertex tools',
    items: [
      { name: 'Create face', description: 'Creates a face from the selected vertices.' },
      { name: 'Add vertex', description: 'Adds a vertex at the touched position on an edge.' },
      { name: 'Connect', description: 'Connects selected vertices with new edges.' },
      { name: 'Target merge', description: 'Moves a vertex onto a target vertex and joins them.' },
      { name: 'Merge', description: 'Joins selected vertices at a single point.' },
    ],
  },
];

// Grid buttons announce which grid they belong to, so tools that share a name
// across modes (Clone, Extrude, Bridge) get the description for that mode.
const SECTION_MODE = { 'General tools': 'general', 'Object tools': 'object', 'Face tools': 'face', 'Edge tools': 'edge', 'Vertex tools': 'vertex' };
const descriptionByMode = {};
const descriptionByName = {};
for (const section of TOOL_GUIDE_SECTIONS) {
  const mode = SECTION_MODE[section.title];
  for (const item of section.items) {
    const key = item.name.toLowerCase();
    if (mode) (descriptionByMode[mode] ||= {})[key] = item.description;
    if (!(key in descriptionByName)) descriptionByName[key] = item.description;
  }
}

// Labels that only appear as a button's alternate state, or in every mode.
const EXTRA_DESCRIPTIONS = {
  delete: 'Removes the current selection.',
  unlock: 'Releases locked objects so they can be edited again.',
  'hard normals': 'Restores hard, faceted shading between faces.',
  'display hidden': 'Shows objects and geometry that were hidden by Display selected.',
};

export function getToolDescription(label, mode) {
  const key = (label || '').toLowerCase();
  return descriptionByMode[mode]?.[key] || descriptionByName[key] || EXTRA_DESCRIPTIONS[key] || 'Opens or applies this modeling tool to the current selection.';
}
