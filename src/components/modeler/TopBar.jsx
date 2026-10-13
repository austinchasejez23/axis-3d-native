import { Menu, Undo2, Redo2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import ViewportModeButtons from '@/components/modeler/ViewportModeButtons';
import RenderBoostButtons from '@/components/modeler/RenderBoostButtons';

export default function TopBar({ onMenu, onUndo, onRedo, clayViewport, transparentViewport, renderBoost, freeTransform, snapping, onToggleClayViewport, onToggleTransparentViewport, onToggleRenderBoost, onToggleFreeTransform, onToggleSnapping, onOpenFreeTransformPanel, onOpenSnapPanel }) {
  const { uiColor } = useTheme();
  const txtShadow = '0 1px 3px rgba(0,0,0,0.35)';
  const btn = 'pointer-events-auto w-16 h-16 rounded-xl flex items-center justify-center active:scale-95 transition-transform touch-none';
  return (
    <div className="absolute top-0 left-0 right-0 z-50 flex items-start justify-between px-[6px] pt-0 pointer-events-none safe-top">
      <div className="flex items-center gap-1 pointer-events-auto">
        <button onClick={onMenu} aria-label="Menu" style={{ color: uiColor, textShadow: txtShadow }} className={`${btn} -mt-1`}>
          <Menu className="w-7 h-7" strokeWidth={2.5} />
        </button>
      </div>

      {/* Redo keeps the original top row slot; undo sits one space below it. */}
      <div className="flex flex-col items-end gap-1 pointer-events-auto -mt-2">
        <button onClick={onRedo} aria-label="Redo" style={{ color: uiColor, textShadow: txtShadow }} className={btn}>
          <Redo2 className="w-11 h-11" strokeWidth={2.3} />
        </button>
        <button onClick={onUndo} aria-label="Undo" style={{ color: uiColor, textShadow: txtShadow }} className={btn}>
          <Undo2 className="w-11 h-11" strokeWidth={2.3} />
        </button>
        {/* Leave a clear gap below the enlarged undo/redo touch targets. */}
        <div className="relative mt-12 flex flex-col items-end gap-2.5">
          {/* One subtle backdrop for all five right-side controls; it does not
              intercept touches or grow when temporary tool labels appear. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -bottom-1 right-0.5 w-12 rounded-xl"
            style={{ background: 'rgba(9,13,22,0.26)', border: '1px solid rgba(255,255,255,0.07)' }}
          />
          <ViewportModeButtons
            clay={clayViewport}
            transparent={transparentViewport}
            onClay={onToggleClayViewport}
            onTransparent={onToggleTransparentViewport}
          />
          <RenderBoostButtons
            renderBoost={renderBoost}
            freeTransform={freeTransform}
            snapping={snapping}
            onRenderBoost={onToggleRenderBoost}
            onToggleFreeTransform={onToggleFreeTransform}
            onToggleSnapping={onToggleSnapping}
            onOpenFreeTransformPanel={onOpenFreeTransformPanel}
            onOpenSnapPanel={onOpenSnapPanel}
          />
        </div>
      </div>
    </div>
  );
}