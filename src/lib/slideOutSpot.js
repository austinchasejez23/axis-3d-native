// Where a tool's slide-out list (Convert's Object / Face / Edge / Vertex)
// opens. It opens straight up from its button when that space is clear;
// otherwise it opens in the nearest clear space of the tool grid, in any
// direction, so it never covers anything already on screen.
//
// All rectangles are screen rectangles: { left, top, right, bottom }.
//   button   — the button the list belongs to
//   rows     — every grid row that takes up space, top to bottom
//   columns  — number of columns in the grid
//   height   — the list's height
//   gap      — space between the button and a list opened straight up
//   blockers — everything the list must not cover (tools, buttons, side controls)
// Returns the list's rectangle.
export function slideOutSpot({ button, rows, columns, height, gap, blockers }) {
  const up = { left: button.left, right: button.right, bottom: button.top - gap, top: button.top - gap - height };
  const usable = rows.filter((row) => row.bottom - row.top > 0.5);
  if (!usable.length) return up;
  const area = {
    left: Math.min(...usable.map((row) => row.left)),
    right: Math.max(...usable.map((row) => row.right)),
    top: Math.min(...usable.map((row) => row.top)),
    bottom: Math.max(...usable.map((row) => row.bottom)),
  };
  const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  const inside = (spot) => spot.top >= area.top - 0.5 && spot.bottom <= area.bottom + 0.5
    && spot.left >= area.left - 0.5 && spot.right <= area.right + 0.5;
  const clear = (spot) => inside(spot) && !blockers.some((blocker) => overlaps(spot, blocker));
  if (clear(up)) return up;

  // Every column, lined up with a row's bottom edge or (just below) top edge.
  const width = (area.right - area.left) / columns;
  const candidates = [];
  for (let c = 0; c < columns; c++) {
    const left = area.left + c * width;
    for (const row of usable) {
      candidates.push({ left, right: left + width, bottom: row.bottom, top: row.bottom - height });
      candidates.push({ left, right: left + width, top: row.top, bottom: row.top + height });
    }
  }
  const cx = (button.left + button.right) / 2, cy = (button.top + button.bottom) / 2;
  const distance = (spot) => Math.hypot((spot.left + spot.right) / 2 - cx, (spot.top + spot.bottom) / 2 - cy);
  let best = null;
  for (const spot of candidates) {
    if (clear(spot) && (!best || distance(spot) < distance(best) - 0.5)) best = spot;
  }
  return best || up;
}
