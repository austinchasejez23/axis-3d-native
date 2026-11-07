import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { HINTS, hintPending, hintDone, countHintShown, completeHint } from '@/lib/hints';
import HintBubble from './HintBubble';

const CHEVRON = '[aria-label="Expand hidden tools"]';
const TRANSFORM = '[data-hint="transform-values"]';
// The transform hint comes "after some time": this long into the session, and
// this long after the last hint went away.
const TRANSFORM_AFTER_START_MS = 45000;
const TRANSFORM_AFTER_HINT_MS = 30000;

const visible = (selector) => {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return !!rect && rect.width > 0 && rect.height > 0;
};

// Decides which getting-started hint shows, one at a time:
//  1. after a mode is picked: "Tap again for tools" at that mode's button;
//  2. once tools have been opened: "Tap to expand tools" at the chevron;
//  3. some time later: "Tap to edit transform values" at the HUD.
export default function HintsController({ selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection }) {
  const { hintsEnabled } = useTheme();
  const [hint, setHint] = useState(null);
  const hintRef = useRef(null);
  hintRef.current = hint;
  const live = useRef({ selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, hintsEnabled });
  live.current = { selectionMode, modeToolsOpen, toolGridOpen, idle, hasSelection, hintsEnabled };
  const startedAt = useRef(performance.now());
  const lastEnded = useRef(0);

  const show = useCallback((id, target, side) => {
    if (!live.current.hintsEnabled || hintRef.current || !hintPending(id) || !visible(target)) return;
    countHintShown(id);
    const next = { id, target, side, key: `${id}-${performance.now()}` };
    hintRef.current = next;
    setHint(next);
  }, []);

  const close = useCallback((reason) => {
    const current = hintRef.current;
    if (!current) return;
    if (reason === 'target') completeHint(current.id);
    hintRef.current = null;
    lastEnded.current = performance.now();
    setHint(null);
  }, []);

  useEffect(() => { if (!hintsEnabled) close('off'); }, [hintsEnabled, close]);

  // Using a control counts for its hint whether or not the hint is showing.
  useEffect(() => {
    const onPointer = (event) => {
      const node = event.target instanceof Element ? event.target : null;
      if (node?.closest(CHEVRON)) completeHint('expandTools');
      if (node?.closest(TRANSFORM) && live.current.hasSelection) completeHint('transform');
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, []);

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

  // 2. Tools are open (after hint 1 is learned): point at the chevron.
  useEffect(() => {
    if (!toolGridOpen || !hintDone('modeTools') || !hintPending('expandTools')) return undefined;
    const timer = setTimeout(() => { if (live.current.toolGridOpen) show('expandTools', CHEVRON, 'right'); }, 500);
    return () => clearTimeout(timer);
  }, [toolGridOpen, show]);

  // 3. Some time later, with something selected and nothing open: the HUD.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      const c = live.current;
      if (!c.hintsEnabled || hintRef.current || !c.idle || !c.hasSelection) return;
      if (now - startedAt.current < TRANSFORM_AFTER_START_MS || now - lastEnded.current < TRANSFORM_AFTER_HINT_MS) return;
      show('transform', TRANSFORM, 'bottom');
    }, 1500);
    return () => clearInterval(timer);
  }, [show]);

  if (!hint || !hintsEnabled) return null;
  return <HintBubble key={hint.key} target={hint.target} text={HINTS[hint.id]} side={hint.side} onClose={close} />;
}
