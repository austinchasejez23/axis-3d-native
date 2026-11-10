import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { HINTS, hintPending, hintShows, countHintShown, completeHint } from '@/lib/hints';
import HintBubble from './HintBubble';

const CHEVRON = '[aria-label="Expand hidden tools"]';
const TRANSFORM = '[data-hint="transform-values"]';
const TOOL_CELL = '[data-tool-grid] [data-tool-cell]';
const LIBRARY = '[aria-label="Library"]';
const MENU = '[aria-label="Menu"]';
// Side buttons that open a settings panel when double-tapped.
const DOUBLE_TAP = ['[aria-label="Toggle snapping"]', '[aria-label="Toggle resistance"]', '[aria-label="Toggle free transform"]'];
// Timed hints come "after some time": the first this long into the session,
// each next one this long after the last hint went away.
const TIMED_AFTER_START_MS = 45000;
const TIMED_AFTER_HINT_MS = 30000;
// A press on a tool this long is the hold that moves or hides it.
const TOOL_HOLD_MS = 450;

const rectOf = (target) => (typeof target === 'function' ? target() : document.querySelector(target)?.getBoundingClientRect());
const visible = (target) => {
  const rect = rectOf(target);
  return !!rect && rect.width > 0 && rect.height > 0;
};
// No hint waits for another to be followed: of the hints that could show now,
// the one shown least so far goes first.
const leastShown = (list) => list.filter((h) => hintPending(h.id)).sort((a, b) => hintShows(a.id) - hintShows(b.id));

// Decides which getting-started hint shows, one at a time. Each teaches
// something that isn't obvious from the screen, at the moment it is useful,
// and never comes back once the user has done it. None depends on another
// having been followed:
//  1. after a mode is picked: "Tap again for tools" at that mode's button;
//  2 and 3. tools open: "Tap to expand tools" at the chevron (when there are
//     hidden tools) and "Touch and hold a tool to move or hide it", in turn;
//  4. after tapping Snapping, Resistance or Free Transform: "Double-tap for settings";
//  5. nothing in the scene: "Tap to add a shape" at Library;
//  6. some time later, one by one: transform values at the HUD; twist and
//     pinch at the selection; touch and hold to select more; Menu for the
//     grid, wireframe and colors.
export default function HintsController({ managerRef, selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, action, multiSelect, settingsOpen, libraryOpen, menuOpen }) {
  const { hintsEnabled } = useTheme();
  const [hint, setHint] = useState(null);
  const hintRef = useRef(null);
  hintRef.current = hint;
  const live = useRef({ selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, hintsEnabled, settingsOpen });
  live.current = { selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, hintsEnabled, settingsOpen };
  const startedAt = useRef(performance.now());
  const lastEnded = useRef(0);

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

  const show = useCallback((id, target, side) => {
    if (!live.current.hintsEnabled || hintRef.current || !hintPending(id) || !visible(target)) return false;
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
  useEffect(() => { if (menuOpen) completeHint('menu'); }, [menuOpen]);
  useEffect(() => {
    const done = { twistPinch: action === 'rotate' || action === 'scale', multiSelect, doubleTap: settingsOpen };
    if (hintRef.current && done[hintRef.current.id]) close('done');
  }, [action, multiSelect, settingsOpen, close]);

  // Taps on controls: the chevron and the HUD count at once; a tool held long
  // enough to move or hide counts for that hint; a single tap on a side button
  // with settings is followed by the double-tap hint.
  useEffect(() => {
    let toolPress = 0;
    let doubleTapTimer = 0;
    const onDown = (event) => {
      const node = event.target instanceof Element ? event.target : null;
      if (!node) return;
      if (node.closest(CHEVRON)) completeHint('expandTools');
      if (node.closest(TRANSFORM) && live.current.hasSelection) completeHint('transform');
      toolPress = node.closest(TOOL_CELL) ? performance.now() : 0;
      const side = DOUBLE_TAP.find((selector) => node.closest(selector));
      clearTimeout(doubleTapTimer);
      if (side && hintPending('doubleTap')) {
        doubleTapTimer = setTimeout(() => {
          if (!live.current.settingsOpen) show('doubleTap', side, 'right');
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

  // 1. Picking a different mode: point at its button.
  useEffect(() => {
    const onMode = (event) => {
      const { mode, label } = event.detail || {};
      if (!mode || !label || mode === live.current.selectionMode || !hintPending('modeTools')) return;
      setTimeout(() => {
        if (live.current.selectionMode !== mode || live.current.modeToolsOpen) return;
        show('modeTools', `[aria-label="${label} mode"]`, 'top');
      }, 350);
    };
    window.addEventListener('axis-tool-selected', onMode);
    return () => window.removeEventListener('axis-tool-selected', onMode);
  }, [show]);

  // Opening a mode's tools is what hint 1 teaches.
  useEffect(() => {
    if (!modeToolsOpen) return;
    completeHint('modeTools');
    if (hintRef.current?.id === 'modeTools') close('target');
  }, [modeToolsOpen, close]);

  // 2 and 3. Tools are open: the chevron and holding a tool take turns.
  useEffect(() => {
    if (!toolGridOpen) return undefined;
    const timer = setInterval(() => {
      if (!live.current.toolGridOpen || hintRef.current) return;
      if (performance.now() - lastEnded.current < 1500) return;
      const options = leastShown([
        { id: 'expandTools', target: CHEVRON, side: 'right' },
        { id: 'arrangeTools', target: TOOL_CELL, side: 'top' },
      ]);
      for (const h of options) if (show(h.id, h.target, h.side)) return;
    }, 500);
    return () => clearInterval(timer);
  }, [toolGridOpen, show]);

  // 5 and 6. With nothing open: an empty scene points at Library; otherwise,
  // some time later, the next timed hint still to learn.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      const c = live.current;
      if (!c.hintsEnabled || hintRef.current || !c.idle) return;
      const empty = !(managerRef?.current?.meshes?.length);
      if (empty) {
        if (now - startedAt.current > 4000 && now - lastEnded.current > 8000) show('library', LIBRARY, 'top');
        return;
      }
      if (now - startedAt.current < TIMED_AFTER_START_MS || now - lastEnded.current < TIMED_AFTER_HINT_MS) return;
      const timed = leastShown([
        { id: 'transform', target: TRANSFORM, side: 'bottom', selection: true },
        { id: 'twistPinch', target: selectionRect, side: 'top', selection: true },
        { id: 'multiSelect', target: selectionRect, side: 'top', selection: true },
        { id: 'menu', target: MENU, side: 'bottom' },
      ].filter((h) => !h.selection || c.hasSelection));
      for (const h of timed) if (show(h.id, h.target, h.side)) return;
    }, 1500);
    return () => clearInterval(timer);
  }, [show, selectionRect, managerRef]);

  if (!hint || !hintsEnabled) return null;
  return <HintBubble key={hint.key} target={hint.target} text={HINTS[hint.id]} side={hint.side} onClose={close} />;
}
