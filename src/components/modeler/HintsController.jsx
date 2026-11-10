import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { HINTS, hintPending, hintShows, countHintShown, completeHint } from '@/lib/hints';
import HintBubble from './HintBubble';

const CHEVRON = '[aria-label="Expand hidden tools"]';
const TRANSFORM = '[data-hint="transform-values"]';
const TOOL_CELL = '[data-tool-grid] [data-tool-cell]';
const LIBRARY = '[aria-label="Library"]';
const VIEWPORT_ROW = '[data-hint="menu-viewport"]';
// Side buttons that open a settings panel when double-tapped.
const DOUBLE_TAP = ['[aria-label="Toggle snapping"]', '[aria-label="Toggle resistance"]', '[aria-label="Toggle free transform"]'];
// A hint never follows straight on from another.
const GAP_MS = 3000;
// A press on a tool this long is the hold that moves or hides it.
const TOOL_HOLD_MS = 450;

const rectOf = (target) => (typeof target === 'function' ? target() : document.querySelector(target)?.getBoundingClientRect());
const visible = (target) => {
  const rect = rectOf(target);
  return !!rect && rect.width > 0 && rect.height > 0;
};

// Getting-started hints, the way other apps do them: each one appears once,
// the first time you reach what it is about, and never again. One at a time,
// never straight after another, and none waits for another to be followed:
//  - picking a different mode: "Tap again for tools" at that mode's button;
//  - tools open: "Tap to expand tools" at the chevron, or (another time)
//    "Touch and hold a tool to move or hide it";
//  - a single tap on Snapping, Resistance or Free Transform: "Double-tap for settings";
//  - an empty scene: "Tap to add a shape" at Library;
//  - the first selection: "Tap to edit transform values" at the HUD;
//  - after the first drag of a selection: twist and pinch, at the selection;
//  - picking something else after a selection: "Touch and hold to select more";
//  - opening the menu: grid, wireframe and colors are in Viewport.
export default function HintsController({ managerRef, selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, action, multiSelect, settingsOpen, libraryOpen, menuOpen }) {
  const { hintsEnabled } = useTheme();
  const [hint, setHint] = useState(null);
  const hintRef = useRef(null);
  hintRef.current = hint;
  const live = useRef({ selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, hintsEnabled, settingsOpen, menuOpen });
  live.current = { selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, hintsEnabled, settingsOpen, menuOpen };
  const lastEnded = useRef(-GAP_MS);

  // The selected geometry's centre on screen, for hints about touching it.
  const selectionRect = useCallback(() => {
    const m = managerRef?.current;
    if (!m?.selection?.meshId || !m.camera || !m.renderer) return null;
    const center = m.getSelectionCenter?.();
    if (!center) return null;
    const p = center.clone().project(m.camera);
    if (p.z > 1 || Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) return null;
    const r = m.renderer.domElement.getBoundingClientRect();
    const x = r.left + ((p.x + 1) / 2) * r.width;
    const y = r.top + ((1 - p.y) / 2) * r.height;
    return { left: x - 18, right: x + 18, top: y - 18, bottom: y + 18, width: 36, height: 36 };
  }, [managerRef]);

  // `direct`: the hint answers something the user just did, so it may show
  // without waiting out the gap after the last hint.
  const show = useCallback((id, target, side, direct = false) => {
    if (!live.current.hintsEnabled || hintRef.current || !hintPending(id) || !visible(target)) return false;
    if (!direct && performance.now() - lastEnded.current < GAP_MS) return false;
    countHintShown(id);
    const next = { id, target, side, key: `${id}-${performance.now()}` };
    hintRef.current = next;
    setHint(next);
    return true;
  }, []);

  const close = useCallback((reason) => {
    const current = hintRef.current;
    if (!current) return;
    if (reason === 'target' && !['twistPinch', 'multiSelect', 'arrangeTools', 'doubleTap'].includes(current.id)) completeHint(current.id);
    hintRef.current = null;
    lastEnded.current = performance.now();
    setHint(null);
  }, []);

  useEffect(() => { if (!hintsEnabled) close('off'); }, [hintsEnabled, close]);

  // Doing what a hint teaches counts for it whether or not it is showing.
  useEffect(() => { if (action === 'rotate' || action === 'scale') completeHint('twistPinch'); }, [action]);
  useEffect(() => { if (multiSelect) completeHint('multiSelect'); }, [multiSelect]);
  useEffect(() => { if (settingsOpen) completeHint('doubleTap'); }, [settingsOpen]);
  useEffect(() => { if (libraryOpen) completeHint('library'); }, [libraryOpen]);
  useEffect(() => {
    const done = { twistPinch: action === 'rotate' || action === 'scale', multiSelect, doubleTap: settingsOpen, library: libraryOpen };
    if (hintRef.current && done[hintRef.current.id]) close('done');
  }, [action, multiSelect, settingsOpen, libraryOpen, close]);

  // Taps on controls: the chevron, the HUD and Viewport count at once; a tool
  // held long enough to move or hide counts for that hint; a single tap on a
  // side button with settings is followed by the double-tap hint.
  useEffect(() => {
    let toolPress = 0;
    let doubleTapTimer = 0;
    const onDown = (event) => {
      const node = event.target instanceof Element ? event.target : null;
      if (!node) return;
      if (node.closest(CHEVRON)) completeHint('expandTools');
      if (node.closest(TRANSFORM) && live.current.hasSelection) completeHint('transform');
      if (node.closest(VIEWPORT_ROW)) completeHint('menu');
      toolPress = node.closest(TOOL_CELL) ? performance.now() : 0;
      const side = DOUBLE_TAP.find((selector) => node.closest(selector));
      clearTimeout(doubleTapTimer);
      if (side && hintPending('doubleTap')) {
        doubleTapTimer = setTimeout(() => {
          if (!live.current.settingsOpen) show('doubleTap', side, 'right', true);
        }, 700);
      }
    };
    const onUp = () => {
      if (toolPress && performance.now() - toolPress >= TOOL_HOLD_MS) {
        completeHint('arrangeTools');
        if (hintRef.current?.id === 'arrangeTools') close('done');
      }
      toolPress = 0;
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    return () => {
      clearTimeout(doubleTapTimer);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [show, close]);

  // Picking a different mode: point at its button.
  useEffect(() => {
    const onMode = (event) => {
      const { mode, label } = event.detail || {};
      if (!mode || !label || mode === live.current.selectionMode || !hintPending('modeTools')) return;
      setTimeout(() => {
        if (live.current.selectionMode !== mode || live.current.modeToolsOpen) return;
        show('modeTools', `[aria-label="${label} mode"]`, 'top', true);
      }, 350);
    };
    window.addEventListener('axis-tool-selected', onMode);
    return () => window.removeEventListener('axis-tool-selected', onMode);
  }, [show]);

  // Opening a mode's tools is what that hint teaches.
  useEffect(() => {
    if (!modeToolsOpen) return;
    completeHint('modeTools');
    if (hintRef.current?.id === 'modeTools') close('target');
  }, [modeToolsOpen, close]);

  // Tools open: the chevron (when there are hidden tools) or holding a tool,
  // whichever has not shown yet.
  useEffect(() => {
    if (!toolGridOpen) return undefined;
    const timer = setTimeout(() => {
      if (!live.current.toolGridOpen) return;
      const options = [
        { id: 'expandTools', target: CHEVRON, side: 'right' },
        { id: 'arrangeTools', target: TOOL_CELL, side: 'top' },
      ].filter((h) => hintPending(h.id)).sort((a, b) => hintShows(a.id) - hintShows(b.id));
      for (const h of options) if (show(h.id, h.target, h.side)) return;
    }, 600);
    return () => clearTimeout(timer);
  }, [toolGridOpen, show]);

  // An empty scene: point at Library.
  useEffect(() => {
    const timer = setInterval(() => {
      const c = live.current;
      if (!c.idle || managerRef?.current?.meshes?.length) return;
      show('library', LIBRARY, 'top');
    }, 1000);
    return () => clearInterval(timer);
  }, [show, managerRef]);

  // Selections: the first one points at the HUD; picking something else
  // afterwards points at the new selection for multi-select.
  const lastSelection = useRef('');
  useEffect(() => {
    let timer = 0;
    const onSelection = () => {
      const sel = managerRef?.current?.selection;
      const key = sel?.meshId ? `${sel.meshId}|${sel.type}|${[...(sel.indices || [])].join(',')}` : '';
      const before = lastSelection.current;
      lastSelection.current = key;
      clearTimeout(timer);
      if (!key) return;
      timer = setTimeout(() => {
        if (!live.current.idle || !live.current.hasSelection) return;
        if (before && before !== key && show('multiSelect', selectionRect, 'top')) return;
        show('transform', TRANSFORM, 'bottom');
      }, 700);
    };
    window.addEventListener('axis-selection-change', onSelection);
    return () => { clearTimeout(timer); window.removeEventListener('axis-selection-change', onSelection); };
  }, [show, selectionRect, managerRef]);

  // The first drag of a selection ends: twist and pinch, at the selection.
  const lastAction = useRef(action);
  useEffect(() => {
    const before = lastAction.current;
    lastAction.current = action;
    if (before !== 'move' || action !== 'idle') return undefined;
    const timer = setTimeout(() => {
      if (live.current.idle && live.current.hasSelection) show('twistPinch', selectionRect, 'top');
    }, 600);
    return () => clearTimeout(timer);
  }, [action, show, selectionRect]);

  // The menu opens: point at Viewport.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const timer = setTimeout(() => { if (live.current.menuOpen) show('menu', VIEWPORT_ROW, 'right', true); }, 500);
    return () => clearTimeout(timer);
  }, [menuOpen, show]);

  if (!hint || !hintsEnabled) return null;
  return <HintBubble key={hint.key} target={hint.target} text={HINTS[hint.id]} side={hint.side} onClose={close} />;
}
