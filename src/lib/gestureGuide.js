// Shared gesture-help content: the full guide shown in the Guides sheet.
// (The rotating top-of-screen tips live in contextTips.js instead.)

export const GUIDE_SECTIONS = [
  {
    title: 'Camera controls',
    items: [
      'Drag one finger on empty space to orbit around the model.',
      'Drag two fingers together on empty space to pan.',
      'Pinch or spread two fingers on empty space to zoom out or in.',
    ],
  },
  {
    title: 'Transformations',
    items: [
      'Tap geometry to select it.',
      'Hold a finger on geometry to start multiple selection. Tap other parts to add or remove them, or drag across parts to select several at once.',
      'Hold a finger on empty space, then drag to box-select everything inside the box.',
      'Drag one finger directly on selected geometry to move it.',
      'Place two fingers on selected geometry and twist to rotate.',
      'Pinch or spread two fingers on selected geometry to scale.',
      'Slide two fingers in the same direction over selected geometry to scale along the direction of the gesture.',
    ],
  },

];