import { useEffect, useRef, useState } from 'react';
import { Menu, Undo2, Redo2, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { helpHintActive, stopHelpHint } from '@/lib/helpHint';
import ViewportModeButtons from '@/components/modeler/ViewportModeButtons';
import RenderBoostButtons from '@/components/modeler/RenderBoostButtons';

const PANEL = { background: 'rgba(9,13,22,0.38)', border: '1px solid rgba(255,255,255,0.07)' };
const TOP = 'calc(env(safe-area-inset-top, 0px) + 0.25rem)';
// Help sits directly under Undo; the axis gizmo sits under Help.
const HELP_TOP = 'calc(env(safe-area-inset-top, 0px) + 108px)';
// New users: three slow flashes over four seconds, every two minutes, for the
// first ten minutes after the app starts.
const FLASH_FIRST_MS = 4000;
const FLASH_MS = 4000;
const FLASH_EVERY_MS = 120000;
const FLASH_WINDOW_MS = 600000;

export default function TopBar({ onMenu, onUndo, onRedo, clayViewport, transparentViewport, freeTransform, snapping, onToggleClayViewport, onToggleTransparentViewport, onToggleFreeTransform, onToggleSnapping, onOpenFreeTransformPanel, onOpenSnapPanel, onFocus, precision, onTogglePrecision, onOpenPrecisionPanel, onHelp, helpOpen, counter, onOrientationReset, onOpenOrientationPanel, orientationOpen }) {
  const { uiColor, highlightColor } = useTheme();
  // New users: the information button now and then flashes three times.
  const [helpFlash, setHelpFlash] = useState(false);
  useEffect(() => {
    if (helpOpen) stopHelpHint();
    if (!helpHintActive()) return undefined;
    let timer;
    const schedule = (delay) => {
      // performance.now() counts from when the app started.
      if (performance.now() + delay >= FLASH_WINDOW_MS) return;
      timer = setTimeout(() => {
        setHelpFlash(true);
        timer = setTimeout(() => { setHelpFlash(false); schedule(FLASH_EVERY_MS); }, FLASH_MS);
      }, delay);
    };
    schedule(FLASH_FIRST_MS);
    return () => { clearTimeout(timer); setHelpFlash(false); };
  }, [helpOpen]);
  const [sideControlsExpanded, setSideControlsExpanded] = useState(true);
  const sideControlsRef = useRef(null);
  useEffect(() => {
    // Prevent off-screen buttons from being reached with keyboard focus.
    if (sideControlsRef.current) sideControlsRef.current.inert = !sideControlsExpanded;
  }, [sideControlsExpanded]);
  // The arrow changes direction only after the controls finish sliding.
  const [sideChevronFacesRight, setSideChevronFacesRight] = useState(false);
  const toggleSideControls = () => {
    const nextExpanded = !sideControlsExpanded;
    setSideControlsExpanded(nextExpanded);
    // Reduced-motion users have no transitionend event to update the arrow.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSideChevronFacesRight(!nextExpanded);
    }
  };
  const txtShadow = '0 1px 3px rgba(0,0,0,0.35)';
  const btn = 'pointer-events-auto w-full flex items-center justify-center active:scale-95 transition-transform touch-none';
  return (
    <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
      {/* Menu has its own background; the triangle counter has none. */}
      <div className="absolute left-[6px] w-12 rounded-xl pointer-events-auto" style={{ ...PANEL, top: TOP }}>
        <button onClick={onMenu} aria-label="Menu" style={{ color: uiColor, textShadow: txtShadow }} className={`${btn} h-12`}>
          <Menu className="w-8 h-8" strokeWidth={2.5} />
        </button>
      </div>
      {counter && (
        <div className="absolute left-[6px] w-12 rounded-xl pointer-events-auto" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}>
          {counter}
        </div>
      )}

      {/* Redo and Undo share one background; Help has its own, below them. */}
      <div className="absolute right-[6px] w-14 rounded-xl pointer-events-auto flex flex-col items-center" style={{ ...PANEL, top: TOP }}>
        <button onClick={onRedo} aria-label="Redo" style={{ color: uiColor, textShadow: txtShadow }} className={`${btn} h-12`}>
          <Redo2 className="w-11 h-11" strokeWidth={2.3} />
        </button>
        <button onClick={onUndo} aria-label="Undo" style={{ color: uiColor, textShadow: txtShadow }} className={`${btn} h-12`}>
          <Undo2 className="w-11 h-11" strokeWidth={2.3} />
        </button>
      </div>
      <div className={`absolute right-[6px] w-14 rounded-xl pointer-events-auto flex flex-col items-center ${helpFlash ? 'axis-help-flash' : ''}`} style={{ ...PANEL, top: HELP_TOP, '--axis-help-flash': highlightColor }}>
        <button onClick={onHelp} aria-label="Help" aria-pressed={!!helpOpen} style={{ color: uiColor, textShadow: txtShadow }} className={`${btn} h-9`}>
          <Info className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      {/* Fixed handle: stays in place while the seven controls slide left
          fully out of view. It occupies the original top control position. */}
      <div className="absolute left-[2px] w-12 rounded-xl pointer-events-auto" style={{ ...PANEL, top: 'calc(env(safe-area-inset-top, 0px) + 5.6rem)' }}>
        <button
          type="button"
          onClick={toggleSideControls}
          aria-label={sideControlsExpanded ? 'Hide side controls' : 'Show side controls'}
          aria-expanded={sideControlsExpanded}
          aria-controls="axis-side-controls"
          className={`${btn} h-10`}
          style={{ color: uiColor, textShadow: txtShadow }}
        >
          {sideChevronFacesRight ? <ChevronRight className="w-7 h-7" strokeWidth={2.5} /> : <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />}
        </button>
      </div>

      {/* The seven controls: one background, dividers between buttons, moved
          down one button space. All seven move together; only the handle stays. */}
      <div
        id="axis-side-controls"
        ref={sideControlsRef}
        aria-hidden={!sideControlsExpanded}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform') {
            setSideChevronFacesRight(!sideControlsExpanded);
          }
        }}
        className="absolute left-[2px] w-12 rounded-xl py-1 flex flex-col items-center pointer-events-auto transition-transform duration-300 ease-in-out motion-reduce:transition-none"
        style={{ ...PANEL, top: 'calc(env(safe-area-inset-top, 0px) + 8.6rem)', transform: sideControlsExpanded ? 'translateX(0)' : 'translateX(calc(-100% - 12px))', pointerEvents: sideControlsExpanded ? 'auto' : 'none' }}>
        <ViewportModeButtons clay={clayViewport} transparent={transparentViewport}
          onClay={onToggleClayViewport} onTransparent={onToggleTransparentViewport} />
        <div className="h-[10px] w-full" aria-hidden="true" />
        <RenderBoostButtons orientationOpen={orientationOpen} freeTransform={freeTransform} snapping={snapping}
          onOrientationReset={onOrientationReset} onOpenOrientationPanel={onOpenOrientationPanel} onToggleFreeTransform={onToggleFreeTransform}
          onToggleSnapping={onToggleSnapping} onOpenFreeTransformPanel={onOpenFreeTransformPanel}
          onOpenSnapPanel={onOpenSnapPanel} onFocus={onFocus} precision={precision}
          onTogglePrecision={onTogglePrecision} onOpenPrecisionPanel={onOpenPrecisionPanel} />
      </div>
    </div>
  );
}
