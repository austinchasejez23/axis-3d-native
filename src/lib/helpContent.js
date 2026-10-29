import {
  Globe, Scan, Gauge, Move3D, Magnet, Crosshair, ImagePlus, Palette, Hand, ArrowLeftRight, EyeOff, Grid3x3,
  PaintBucket, Paintbrush, SprayCan, Blend, Droplet, Droplets, Pipette, Check, Undo2, Ban, Plus, SlidersHorizontal,
  Sun, Spline, RotateCcw, Image, FlipHorizontal2, Box,
} from 'lucide-react';
import { ProtractorIcon, MeasureIcon } from '@/lib/toolIcons';
import ResistanceIcon from '@/components/modeler/ResistanceIcon';
import { TOOLS } from '@/lib/tools';

// Basics shown at the top of the main Help page.
export const HELP_BASICS = [
  'Rearrange tools: touch and hold a tool, then drag it to a new position.',
  'Hide tools: touch and hold a tool, tap any others to add them, then select Hide. One tool is enough.',
  'Show tools: use the arrow above the tools to reveal hidden tools, select them, then select Show.',
  'Change the Background, Grid and Highlight colors: Menu > Viewport > Colors.',
  'Toggle Grid, Wireframe, Object arrows, Dimensions and Tool labels: Menu > Viewport.',
  'Open the settings for Free Transform, Snapping and Resistance: double-tap the button.',
];

// Gestures page: [name, description].
export const HELP_GESTURES = [
  ['Orbit', 'Drag one finger on empty space.'],
  ['Pan', 'Drag two fingers.'],
  ['Zoom', 'Pinch two fingers in or out.'],
  ['Select', 'Tap an object, face, edge or vertex.'],
  ['Select multiple', 'Touch and hold the model, then tap more.'],
  ['Box select', 'Touch and hold empty space, then drag a box.'],
  ['Deselect', 'Tap empty space.'],
  ['Move', 'Drag the selected item.'],
  ['Rotate', 'Twist two fingers.'],
  ['Scale', 'Pinch two fingers.'],
  ['Scale along one direction', 'Move two fingers along that direction.'],
];

// Materials page: the Paint, Material and Texture tabs of the Materials panel.
export const HELP_MATERIALS = [
  {
    title: 'Paint',
    entries: [
      { key: 'paint:wheel', label: 'Color wheel', icon: Palette, desc: 'Picks the paint color. The slider beside it sets brightness.' },
      { key: 'paint:fill', label: 'Fill', icon: PaintBucket, desc: 'Fills the selection with the color. Shows a preview until you Apply.' },
      { key: 'paint:brush', label: 'Brush', icon: Paintbrush, desc: 'Paints by dragging across the surface.' },
      { key: 'paint:spray', label: 'Spray', icon: SprayCan, desc: 'Sprays soft paint as you drag across the surface.' },
      { key: 'paint:multi', label: 'Multi', icon: Blend, desc: 'Blends two colors across the surface. Turns on Primary and Shift color.' },
      { key: 'paint:primary', label: 'Primary color', icon: Droplet, desc: 'With Multi on, the wheel edits the base color.' },
      { key: 'paint:shift', label: 'Shift color', icon: Droplets, desc: 'With Multi on, the wheel edits the secondary color.' },
      { key: 'paint:eyedropper', label: 'Eyedropper', icon: Pipette, desc: 'Tap the model to take a color from it.' },
      { key: 'paint:apply', label: 'Apply', icon: Check, desc: 'Applies the paint to the selection.' },
      { key: 'paint:undo', label: 'Undo', icon: Undo2, desc: 'Undoes the last paint stroke or preview.' },
      { key: 'paint:remove', label: 'Remove paint', icon: Ban, desc: 'Removes all paint from the object.' },
      { key: 'paint:save', label: 'Save color', icon: Plus, desc: 'Adds the current color to the saved colors. Tap a saved color to use it.' },
      { key: 'paint:sliders', label: 'Size, Opacity, Hardness, Shift', icon: SlidersHorizontal, desc: 'Size, Opacity and Hardness shape brush and spray strokes. Shift sets how far Multi blends toward the secondary color.' },
    ],
  },
  {
    title: 'Material',
    entries: [
      { key: 'material:environment', label: 'Environment', icon: Sun, desc: 'Chooses the scene reflected in shiny surfaces: Off, Studio, Shop, City, Sunset, Dark Studio, Desert or Graffiti.' },
      { key: 'material:soft', label: 'Soft Norms', icon: Spline, desc: 'Smooths the shading across faces without changing the shape. Tap again for sharp shading.' },
      { key: 'material:default', label: 'Default', icon: RotateCcw, desc: 'Resets the material sliders to a new object\'s values.' },
      { key: 'material:apply', label: 'Apply', icon: Check, desc: 'Keeps the material changes.' },
      { key: 'material:sliders', label: 'Material sliders', icon: SlidersHorizontal, desc: 'Metal, Rough, Opacity, Glow, Reflect, Blur and Clear coat shape the surface. Tint and Tint amount color it.' },
    ],
  },
  {
    title: 'Texture',
    entries: [
      { key: 'texture:none', label: 'None', icon: Ban, desc: 'Removes the texture from the object.' },
      { key: 'texture:add', label: 'Add', icon: Plus, desc: 'Applies an image from your device as a texture.' },
      { key: 'texture:presets', label: 'Texture presets', icon: Image, desc: 'Round thumbnails apply a built-in texture.' },
      { key: 'texture:merge', label: 'Merge', icon: Blend, desc: 'Blends the texture with the object\'s color.' },
      { key: 'texture:seamless', label: 'Seamless', icon: FlipHorizontal2, desc: 'Mirrors the texture at its edges so repeats show no seams.' },
      { key: 'texture:wrap', label: 'Wrap', icon: Box, desc: 'Chooses how the texture projects onto the object: Box, Planar, Cylinder or Sphere.' },
      { key: 'texture:apply', label: 'Apply', icon: Check, desc: 'Keeps the texture changes.' },
      { key: 'texture:sliders', label: 'Texture sliders', icon: SlidersHorizontal, desc: 'Scale, Rotation and Opacity adjust the texture.' },
    ],
  },
];

const SP = 'Has a settings panel';

// General tools. `aliases` are the other labels a button can show.
const G = [
  { key: 'reference', label: 'Reference', icon: ImagePlus, desc: 'Imports an image to use as a modeling reference.' },
  { key: 'materials', label: 'Materials', icon: Palette, desc: `Applies colors, materials and textures to objects. ${SP}: Paint, Material and Texture.` },
  { key: 'sculpt', label: 'Sculpt', icon: Hand, desc: `Pushes, pulls and smooths the surface as you drag across it. Requires AXIS 3D Pro. ${SP}: brush, size, intensity and axes.` },
  { key: 'free_transform', label: 'Free Transform', icon: Move3D, desc: `Moves, rotates and scales the selection directly by touch. ${SP}: move, rotate and scale values.` },
  { key: 'protractor', label: 'Protractor', icon: ProtractorIcon, desc: 'Shows the angle of the selected edge relative to vertical.' },
  { key: 'measure', label: 'Measure', icon: MeasureIcon, desc: 'Measures the distance between two tapped points.' },
  { key: 'convert', label: 'Convert', icon: ArrowLeftRight, desc: 'Converts the selection between object, face, edge and vertex.' },
  { key: 'display', label: 'Display selected', aliases: ['Display hidden'], icon: EyeOff, desc: 'Shows only the selection and hides everything else. Tap again to show everything.' },
];

const desc = {
  object: {
    merge: 'Welds nearby vertices into one to clean up the mesh.',
    mirror: 'Creates a mirrored copy of the object across an axis.',
    soft_normals: 'Smooths the shading across faces without changing the shape. Hard normals restores sharp shading.',
    combine: 'Merges the selected objects into a single mesh.',
    separate: 'Splits disconnected parts of a mesh into separate objects.',
    divide: 'Subdivides the mesh to add faces and edges.',
    boolean: 'Opens Subtract, Union and Intersect.',
    subtract: 'Removes the volume of one object from another.',
    union: 'Fuses overlapping objects into one solid.',
    intersect: 'Keeps only the volume where objects overlap.',
    smooth: 'Relaxes vertices to even out the surface.',
    clone: 'Duplicates the selected object.',
    radial_array: `Duplicates the object in a circle around an axis. ${SP}: count, radius, axis and follow.`,
    lock: 'Prevents the object from being edited. Unlock releases it.',
    delete: 'Deletes the selected object.',
  },
  face: {
    draw_face: `Draws an outline to create a new face. ${SP}: axis, grid, straight edge and align.`,
    detach: 'Separates the selected faces from the object.',
    clone: 'Duplicates the selected faces.',
    bridge: 'Connects two selected faces with new geometry.',
    extrude: 'Pulls the selected faces outward to create new geometry.',
    delete: 'Deletes the selected faces.',
  },
  edge: {
    create_face_border: 'Creates a face across selected border edges.',
    bridge: 'Connects two selected edges with new geometry.',
    split: 'Divides the selected edges into smaller edges.',
    draw_cut: `Slices across the model through the points you tap. ${SP}: delete last point and snap.`,
    bevel: `Rounds or chamfers the selected edges. ${SP}: radius, segments, smooth and sweep (Pro).`,
    extrude: 'Pulls the selected edges outward into new faces.',
    select_ring: `Selects a ring of connected edges. ${SP}: skip and offset.`,
    select_loop: `Selects a continuous loop of edges. ${SP}: skip and offset.`,
    cut_loop: `Adds an edge loop around the object. ${SP}: cut, center, straight and follow.`,
    delete: 'Deletes the selected edges.',
  },
  vertex: {
    create_face: 'Creates a face from the selected vertices.',
    add_vertex: `Adds a vertex on an edge where you tap. ${SP}: center on edge and delete last.`,
    connect: 'Connects the selected vertices with edges.',
    target_merge: 'Moves a vertex onto a target vertex and merges them.',
    merge: 'Merges the selected vertices at a single point.',
    delete: 'Deletes the selected vertices.',
  },
};

const ALIASES = { soft_normals: ['Hard normals'], lock: ['Unlock'] };

const modeEntries = (mode) => TOOLS[mode].pages[0].map((t) => ({
  key: `${mode}:${t.id}`, mode, label: t.label, aliases: ALIASES[t.id] || [], icon: t.icon, desc: desc[mode][t.id],
}));

const segments = { key: 'object:segments', mode: 'object', label: 'Segments', icon: Grid3x3, desc: `Sets the segment count of a primitive shape. ${SP}.` };

const SIDE = [
  { key: 'side:clay', side: 'clay', label: 'Clay', icon: Globe, desc: 'Displays the model in plain clay shading.' },
  { key: 'side:transparent', side: 'transparent', label: 'Transparent', icon: Scan, desc: 'Makes the model see-through.' },
  { key: 'side:boost', side: 'boost', label: 'Render boost', icon: Gauge, desc: 'Lowers render quality while the camera moves for smoother navigation.' },
  { key: 'side:free', side: 'free', label: 'Free Transform', icon: Move3D, desc: `Turns Free Transform on or off. Double-tap to open its settings panel.` },
  { key: 'side:snap', side: 'snap', label: 'Snapping', icon: Magnet, desc: `Snaps movement to set distances and angles. Double-tap to open its settings panel: distance and angle.` },
  { key: 'side:precision', side: 'precision', label: 'Resistance', icon: ResistanceIcon, desc: `Adds resistance to movement for finer control. Double-tap to open its settings panel.` },
  { key: 'side:focus', side: 'focus', label: 'Focus', icon: Crosshair, desc: 'Re-centers the camera on the selection.' },
];

// Tools grouped by mode: Object, Face, Edge, Vertex, General, then the side buttons.
export const HELP_SECTIONS = [
  { title: 'Object tools', entries: [...modeEntries('object'), segments] },
  { title: 'Face tools', entries: modeEntries('face') },
  { title: 'Edge tools', entries: modeEntries('edge') },
  { title: 'Vertex tools', entries: modeEntries('vertex') },
  { title: 'General tools', entries: G.map((e) => ({ ...e, key: `general:${e.key}`, mode: 'general' })) },
  { title: 'Side buttons', entries: SIDE },
];

const HELP_ENTRIES = HELP_SECTIONS.flatMap((section) => section.entries);

const norm = (s) => (s || '').replace(/\n/g, ' ').trim().toLowerCase();

// Find the entry for a tapped tool: a side button by id, or a grid tool by label
// (preferring the grid it was tapped in).
export function findHelpEntry({ id, label, announceLabel, mode }) {
  if (id) return HELP_ENTRIES.find((e) => e.side === id) || null;
  const names = [norm(label), norm(announceLabel)].filter(Boolean);
  const matches = HELP_ENTRIES.filter((e) => !e.side && [e.label, ...(e.aliases || [])].some((n) => names.includes(norm(n))));
  return matches.find((e) => e.mode === mode) || matches[0] || null;
}
