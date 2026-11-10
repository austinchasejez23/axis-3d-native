// Getting-started hints: small talk boxes that point at a control. Each one
// shows once, the first time it applies, and not at all if the user has
// already used what it points at. Settings → Hints turns them all off.
const KEY = 'axis3d.hints.v1';
const MAX_SHOWS = 1;

export const HINTS = {
  modeTools: 'Tap again for tools',
  expandTools: 'Tap to expand tools',
  transform: 'Tap to edit transform values',
  arrangeTools: 'Touch and hold a tool to move or hide it',
  doubleTap: 'Double-tap for settings',
  library: 'Tap to add a shape',
  twistPinch: 'Twist two fingers to rotate, pinch to scale',
  multiSelect: 'Touch and hold to select more',
  menu: 'Grid, wireframe and colors are in Viewport',
};

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && typeof saved === 'object' ? { done: saved.done || {}, shows: saved.shows || {} } : { done: {}, shows: {} };
  } catch {
    return { done: {}, shows: {} };
  }
}

let state = read();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } };

// Still worth showing: not used yet and not shown too often.
export const hintPending = (id) => !state.done[id] && (state.shows[id] || 0) < MAX_SHOWS;
export const hintDone = (id) => !!state.done[id];
// How many times a hint has shown.
export const hintShows = (id) => state.shows[id] || 0;

export function countHintShown(id) {
  state = { ...state, shows: { ...state.shows, [id]: (state.shows[id] || 0) + 1 } };
  save();
}

export function completeHint(id) {
  if (state.done[id]) return;
  state = { ...state, done: { ...state.done, [id]: true } };
  save();
}
