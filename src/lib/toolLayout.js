// Per-mode tool grid arrangement. Every grid is 6 columns aligned 1:1 with the
// bottom bar (Tools | Vertex | Edge | Face | Object | Library).
//   'void' — nothing can go there (the bottom bar button shows through).
//   null   — a free empty slot a tool can be dragged into.
// The rows above each grid are vertical stacks up the screen edges: the last
// column is free in every row (seven slots up the right edge), and the first
// column only in the lowest four rows (four slots up the left edge, kept clear
// of the side controls). Everything in between is blocked.
// Alongside the rows, a per-mode list of HIDDEN tool ids is kept: hidden tools
// keep their slot but only show while the grid is expanded with the chevron.
export const VOID = 'void';

const STACK_ROWS = 7;
const LEFT_SLOTS = 4;
const stackRow = (r) => [r >= STACK_ROWS - LEFT_SLOTS ? null : VOID, VOID, VOID, VOID, VOID, null];
const stack = () => Array.from({ length: STACK_ROWS }, (_, r) => stackRow(r));
// A stack row: only its edge cells can ever hold a tool.
export const isStackRow = (row) => row.slice(1, 5).every((cell) => cell === VOID);

// Before the right-edge stack there were five rows with a left-edge slot only.
const OLD_STACK_ROWS = 5;
const OLD_LEFT_STACK = () => [null, VOID, VOID, VOID, VOID, VOID];
const oldStack = () => Array.from({ length: OLD_STACK_ROWS }, OLD_LEFT_STACK);

// Re-seat what was stacked in an old five-row left stack, keeping the order
// and nearest the grid first: into the left slots, then up the right edge.
function widenStack(rows) {
  if (!Array.isArray(rows) || rows.length < OLD_STACK_ROWS) return rows;
  const old = rows.slice(0, OLD_STACK_ROWS);
  if (!old.every((row) => Array.isArray(row) && row.length === 6 && row.slice(1).every((cell) => cell === VOID))) return rows;
  const next = stack();
  const slots = [];
  for (let r = STACK_ROWS - 1; r >= 0; r--) if (next[r][0] === null) slots.push([r, 0]);
  for (let r = STACK_ROWS - 1; r >= 0; r--) slots.push([r, 5]);
  old.map((row) => row[0]).filter((cell) => cell && cell !== VOID).reverse()
    .forEach((id, i) => { const [r, c] = slots[i]; next[r][c] = id; });
  return [...next, ...rows.slice(OLD_STACK_ROWS).map((row) => [...row])];
}

const LEGACY_OBJECT_LAYOUT = [
  ...oldStack(),
  ['merge', 'mirror', 'soft_normals', 'combine', 'segments', 'lock'],
  ['separate', 'divide', 'smooth', 'clone', null, 'delete'],
];

const PREVIOUS_LAYOUTS = {
  general: [
    ...oldStack().slice(0, 3),
    ['reference', VOID, VOID, VOID, VOID, VOID],
    ['materials', VOID, VOID, VOID, VOID, VOID],
    ['sculpt', null, null, null, null, null],
    [null, 'free_transform', 'convert', 'display', 'measure', 'protractor'],
  ],
  object: [
    ['radial_array', VOID, VOID, VOID, VOID, VOID],
    ...oldStack().slice(1),
    ['boolean', 'lock', 'smooth', 'divide', 'merge', 'soft_normals'],
    ['combine', 'separate', 'mirror', 'clone', 'segments', 'delete']],
  face: [...oldStack(),
    ['bridge', 'detach', 'draw_face', 'clone', 'extrude', 'delete']],
  edge: [...oldStack(),
    ['split', 'cut_loop', 'draw_cut', 'bridge', null, null],
    ['select_ring', 'select_loop', 'create_face_border', 'extrude', 'bevel', 'delete']],
  vertex: [...oldStack(),
    ['create_face', 'add_vertex', 'connect', 'target_merge', 'merge', 'delete']],
};
const PREVIOUS_HIDDEN = {
  general: [],
  object: ['boolean', 'lock', 'smooth', 'divide', 'merge', 'soft_normals'],
  edge: ['split', 'cut_loop', 'draw_cut'],
};

export const DEFAULT_LAYOUTS = {
  general: [
    ...stack(),
    ['materials', null, null, null, null, 'reference'],
    ['sculpt', 'free_transform', 'convert', 'display', 'measure', 'protractor'],
  ],
  object: [
    ...stack().slice(0, STACK_ROWS - 1),
    ['boolean', VOID, VOID, VOID, VOID, null],
    ['radial_array', 'lock', 'smooth', 'divide', 'merge', 'soft_normals'],
    ['combine', 'separate', 'mirror', 'clone', 'segments', 'delete'],
  ],
  face: [
    ...stack(),
    ['dissolve', null, null, null, null, null],
    ['bridge', 'draw_face', 'detach', 'clone', 'extrude', 'delete'],
  ],
  edge: [
    ...stack(),
    ['split', 'select_ring', 'draw_cut', 'bridge', 'dissolve', null],
    ['cut_loop', 'select_loop', 'create_face_border', 'extrude', 'bevel', 'delete'],
  ],
  vertex: [
    ...stack(),
    ['bevel', 'dissolve', null, null, null, null],
    ['add_vertex', 'create_face', 'connect', 'target_merge', 'merge', 'delete'],
  ],
};

const DEFAULT_HIDDEN = {
  object: ['boolean', 'radial_array', 'lock', 'smooth', 'divide', 'merge', 'soft_normals'],
  edge: ['split', 'select_ring', 'draw_cut', 'bridge'],
};

const KEY = 'axis3d.toolLayouts';

const allIds = (rows) => rows.flat().filter((c) => c && c !== VOID).map(String).sort();

// Put a newly added tool into a saved arrangement: on its default spot when that
// cell is still free, otherwise the last free cell, so nothing the user
// arranged is moved.
function placeMissing(rows, mode, id) {
  if (!Array.isArray(rows) || allIds(rows).includes(id)) return;
  const def = DEFAULT_LAYOUTS[mode];
  for (let r = 0; r < def.length; r++) {
    const c = def[r].indexOf(id);
    if (c >= 0 && rows[r]?.[c] === null) { rows[r][c] = id; return; }
  }
  for (let r = rows.length - 1; r >= 0; r--) {
    const c = rows[r].indexOf(null);
    if (c >= 0) { rows[r][c] = id; return; }
  }
}

// A stored arrangement is only used when it still holds exactly the same tools
// and blocked slots as the default, in the same shape, so a future tool addition
// can never leave a grid with missing or stale buttons.
function matchesDefault(rows, mode) {
  const def = DEFAULT_LAYOUTS[mode];
  if (!Array.isArray(rows) || rows.length !== def.length) return false;
  for (let r = 0; r < def.length; r++) {
    if (!Array.isArray(rows[r]) || rows[r].length !== def[r].length) return false;
    for (let c = 0; c < def[r].length; c++) {
      if ((def[r][c] === VOID) !== (rows[r][c] === VOID)) return false;
    }
  }
  return JSON.stringify(allIds(rows)) === JSON.stringify(allIds(def));
}

export function loadToolLayout(mode) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    const stored = all[mode]?.rows?.map((row) => [...row]);
    // Add the missing upper bottom row without resetting anyone's arrangement.
    if (['general', 'face', 'vertex'].includes(mode) && stored?.length === OLD_STACK_ROWS + 1) {
      stored.splice(OLD_STACK_ROWS, 0, [null, null, null, null, null, null]);
    }
    // Old left-only stacks become the left + right stacks, tools kept.
    const widened = widenStack(stored);
    // Preserve existing arrangements while converting bottom-row cells that
    // used to be blocked into the free destinations they now represent.
    let legacyFreeTransformPlaced = false;
    const rows = Array.isArray(widened)
      ? widened.map((row, r) => row.map((cell, c) => {
          if (cell === 'radius') return null;
          if (mode === 'general' && (cell === 'free_move' || cell === 'free_scale')) {
            if (!legacyFreeTransformPlaced) {
              legacyFreeTransformPlaced = true;
              return 'free_transform';
            }
            return null;
          }
          return DEFAULT_LAYOUTS[mode]?.[r]?.[c] === null && cell === VOID ? null : cell;
        }))
      : widened;
    if (mode === 'general' && Array.isArray(rows) && !allIds(rows).includes('reference')) {
      const openRow = rows.find((row) => row[0] === null && isStackRow(row));
      if (openRow) openRow[0] = 'reference';
    }
    if (mode === 'general' && Array.isArray(rows) && !allIds(rows).includes('free_transform')) {
      const preferredRow = STACK_ROWS;
      if (rows[preferredRow]?.[2] === null) rows[preferredRow][2] = 'free_transform';
      else {
        const openRow = rows.find((row) => row.some((cell) => cell === null));
        if (openRow) openRow[openRow.indexOf(null)] = 'free_transform';
      }
    }
    if (mode === 'object' && Array.isArray(rows) && !allIds(rows).includes('radial_array')) {
      const openRow = rows.find((row) => row.some((cell) => cell === null));
      if (openRow) openRow[openRow.indexOf(null)] = 'radial_array';
    }
    if (mode === 'vertex' && Array.isArray(rows) && !allIds(rows).includes('add_vertex')) {
      const preferred = rows[STACK_ROWS];
      if (preferred?.[1] === null) preferred[1] = 'add_vertex';
      else {
        const openRow = rows.find((row) => row.some((cell) => cell === null));
        if (openRow) openRow[openRow.indexOf(null)] = 'add_vertex';
      }
    }
    if ((mode === 'face' || mode === 'edge') && Array.isArray(rows) && !allIds(rows).includes('bridge')) {
      const openRow = rows.find((row) => row.some((cell) => cell === null));
      if (openRow) openRow[openRow.indexOf(null)] = 'bridge';
    }
    const previousShape = JSON.stringify(rows);
    if (mode === 'face' || mode === 'edge' || mode === 'vertex') placeMissing(rows, mode, 'dissolve');
    if (mode === 'vertex') placeMissing(rows, mode, 'bevel');
    if (matchesDefault(rows, mode)) {
      const hidden = Array.isArray(all[mode].hidden) ? all[mode].hidden.filter((id) => allIds(rows).includes(id)) : [];
      // Upgrade untouched defaults only; keep manually customized layouts.
      if (PREVIOUS_LAYOUTS[mode] && previousShape === JSON.stringify(widenStack(PREVIOUS_LAYOUTS[mode]))
        && (hidden.length === 0 || JSON.stringify([...hidden].sort()) === JSON.stringify([...PREVIOUS_HIDDEN[mode]].sort()))) {
        return { rows: DEFAULT_LAYOUTS[mode], hidden: [...DEFAULT_HIDDEN[mode]] };
      }
      if (mode === 'object' && hidden.length === 0 && JSON.stringify(rows) === JSON.stringify(widenStack(LEGACY_OBJECT_LAYOUT))) {
        return { rows: DEFAULT_LAYOUTS.object, hidden: [...DEFAULT_HIDDEN.object] };
      }
      return { rows, hidden };
    }
  } catch { /* ignore unreadable storage */ }
  return { rows: DEFAULT_LAYOUTS[mode], hidden: [...(DEFAULT_HIDDEN[mode] || [])] };
}

export function saveToolLayout(mode, rows, hidden) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[mode] = { rows, hidden };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* ignore unwritable storage */ }
}