// Shared flag: true while the Help panel's tool-description page is open.
// In that state, tapping a tool only reports it to the panel (so it can scroll
// to and highlight that tool's entry) and the tool itself is not run.
let toolsPageOpen = false;

export function setHelpToolsOpen(open) {
  toolsPageOpen = !!open;
}

export function isHelpToolsOpen() {
  return toolsPageOpen;
}

// Returns true when the tap was swallowed by Help.
export function helpIntercept(detail) {
  if (!toolsPageOpen) return false;
  window.dispatchEvent(new CustomEvent('axis-help-tool', { detail }));
  return true;
}
