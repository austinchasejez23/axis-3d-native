// Brief, context-relevant hints shown as floating words above the HUD.
// Each list belongs to one thing the user can currently be doing, so the hint
// always matches the active mode. Keep every line SHORT — one glance.

const WORKSPACE_TIPS = [
  'Hold a tool, then drag it to rearrange the grid',
  'To change units, open Menu → Settings → Units',
  'To adjust snapping, hold the Snapping icon',
  'To import a model, open Menu → File → Import',
];

export const CONTEXT_TIPS = {
  // Nothing selected yet.
  empty: [
    'Tap an object to select it',
    'Drag empty space to orbit',
    'Two-finger drag to pan and zoom',
    'Tap Library to add a shape',
    'Hold empty space for a selection box',
    'To edit a light, open Menu → Lighting and select the light',
  ],
  // Object mode, something selected.
  object: [
    'Pinch on the object to scale',
    'Twist two fingers to rotate',
    'Drag the object to move it',
    'Tap a value above to type it',
    'Hold an object to multi-select',
    'Slide two fingers to scale one axis',
    'Object tools → Boolean → Subtract cuts overlaps',
    'Object tools → Lock protects objects from edits',
    'Select a primitive, then use Segments to change its subdivisions',
  ],
  face: [
    'Tap a face to select it',
    'Drag a selected face to move it',
    'Twist two fingers on a selected face to rotate it',
    'Pinch a selected face to scale it',
    'Touch-hold a face to start multi-select',
  ],
  edge: [
    'Tap an edge to select it',
    'Select Bevel to round an edge',
    'Select one or more edges, then tap Select loop to extend their loops',
    'Drag an edge to move it',
    'Tap Cut loop, then touch an edge and slide to position the cut',
    'Select a closed border, then tap New face to fill it',
  ],
  vertex: [
    'Tap a point to select it',
    'Select Merge to join points',
    'Select Connect to join two points',
    'Drag a point to move it',
    'Hold a point to multi-select',
  ],
  surface: [
    'Choose Paint, Material, or Texture below',
    'Fill: tap geometry to select and color it',
    'The checkmark confirms and minimizes Paint',
    'Pick a color even when nothing is selected',
  ],
  sculpt: [
    'Drag on the surface to sculpt',
    'Set Size and Strength on the left',
    'Two fingers still move the camera',
    'Tap the canvas to hide the sliders',
  ],
  multiSelect: [
    'Tap geometry to add or remove it',
    'Drag the active selection to transform it',
    'Hold, then drag across geometry to paint-select',
    'Select two objects, then Object tools → Boolean',
    'Pinch the selection to scale it together',
  ],
  precision: [
    'Set Distance and Angle in the panel',
  ],
  drawFace: [
    'Draw a closed outline with one continuous stroke',
    'Return to the first point to finish the face',
    'Draw clear corners to produce cleaner straight segments',
  ],
  measure: [
    'Tap two geometry points to measure between them',
    'Tap the canvas to clear the current measurement',
  ],
  angle: [
    'Select an edge to read its angle',
  ],
  cutLoop: [
    'Tap an edge to preview a loop cut',
    'Slide along the edge to position the loop',
    'Checkmark applies the previewed loop',
  ],
  drawCut: [
    'Tap edges to place cut points',
    'Place at least two points, then tap the checkmark',
    'Trash removes the last cut point',
    'Tap the first point to close a cut path',
  ],
  addVertex: [
    'Tap an edge to preview the new vertex',
    'Slide along the edge to position the vertex',
    'Checkmark adds the vertex at the preview point',
  ],
  bevel: [
    'Radius controls the bevel width',
    'Segments controls bevel smoothness',
  ],
  radialArray: [
    'Count sets the number of copies around the axis',
    'Angle controls how far the copies spread',
  ],
  selectionPattern: [
    'Skip controls the spacing between selected elements',
    'Offset shifts where the selection pattern begins',
  ],
};

// Show every context-specific tip first, then useful workspace/settings tips;
// nothing repeats until the full combined set has been shown.
const TOOL_CONTEXTS = new Set(['drawFace', 'measure', 'angle', 'sculpt', 'surface', 'precision', 'cutLoop', 'drawCut', 'addVertex', 'bevel', 'radialArray', 'selectionPattern']);

export function pickTip(context, turn) {
  const focused = CONTEXT_TIPS[context] || CONTEXT_TIPS.empty;
  const list = TOOL_CONTEXTS.has(context) ? focused : [...focused, ...WORKSPACE_TIPS];
  return list[turn % list.length];
}