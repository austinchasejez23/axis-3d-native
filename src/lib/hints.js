// Getting-started hints: small talk boxes that point at a control. Each one
// keeps coming back (a few times at most) until the user has used what it
// points at, then never again. Settings → Hints turns them all off.
const KEY = 'axis3d.hints.v1';
const MAX_SHOWS = 3;

export const HINTS = {
  modeTools: 'Tap again for tools',
  expandTools: 'Tap to expand tools',
  transform: 'Tap to edit transform values',
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

export function countHintShown(id) {
  state = { ...state, shows: { ...state.shows, [id]: (state.shows[id] || 0) + 1 } };
  save();
}

export function completeHint(id) {
  if (state.done[id]) return;
  state = { ...state, done: { ...state.done, [id]: true } };
  save();
}
