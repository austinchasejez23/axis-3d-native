import { useRef } from 'react';
import { useTheme } from '@/lib/theme';
import RoundColorPicker from './RoundColorPicker';
import VerticalValueSlider from './VerticalValueSlider';
import ColorSwatchGrid from './ColorSwatchGrid';
import PaintToolButtons from './PaintToolButtons';
import InlineSlider from './InlineSlider';
import SurfaceSliderRow from './SurfaceSliderRow';

const WHEEL = 118;

// Paint tab. Top row: the color wheel and its vertical brightness slider, and
// beside them Apply and Undo, the paint tool icons, then the saved colors (led
// by Remove paint). Below the wheel, full width, the same swipeable slider
// strip the Material tab uses.
export default function ColorTabContent({
  color, onChange, strokeActive, showSliders,
  size, smoothness, opacity, onSize, onSmoothness, onOpacity, onSizeActive,
  paintTool, strokesBlocked, onPaintTool, onRemovePaint,
  onApply, onUndo, canApply, canUndo, applied, eyedropper, onEyedropper,
}) {
  const { uiColor, highlightColor } = useTheme();
  const sliderRef = useRef(null);
  // Name the pressed button on screen (under the tool label).
  const onPress = (id, label) => {
    window.dispatchEvent(new CustomEvent('axis-paint-label', { detail: { label } }));
  };
  const actionBtn = 'modeling-value flex h-8 min-w-0 items-center justify-center rounded-lg px-1 text-[13px] font-semibold active:scale-95 disabled:opacity-35 disabled:active:scale-100';
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start gap-2">
        <div className="shrink-0 flex items-center gap-2.5" onPointerDown={(e) => e.stopPropagation()}>
          <RoundColorPicker color={color} onChange={onChange} size={WHEEL} ring={false} />
          <VerticalValueSlider color={color} onChange={onChange} height={WHEEL} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between" style={{ height: WHEEL }}>
          {/* Apply is the only way paint lands, so it is greyed until there is
              something selected to receive it. It is highlighted only while
              the selection still has the current color applied. */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onApply}
              disabled={!canApply}
              aria-label="Apply paint to the selection"
              className={actionBtn}
              aria-pressed={!!applied}
              style={{ color: applied ? highlightColor : uiColor, borderColor: applied ? highlightColor : undefined }}
            >
              <span className="truncate">Apply</span>
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo paint"
              className={actionBtn}
              style={{ color: uiColor }}
            >
              <span className="truncate">Undo</span>
            </button>
          </div>
          <PaintToolButtons
            paintTool={paintTool}
            strokesBlocked={strokesBlocked}
            onPaintTool={onPaintTool}
            onPress={onPress}
            eyedropper={eyedropper}
            onEyedropper={onEyedropper}
          />
          <ColorSwatchGrid color={color} onChange={onChange} onRemovePaint={onRemovePaint} />
        </div>
      </div>
      {showSliders && (
        <SurfaceSliderRow ref={sliderRef} scrollPadTop>
          <InlineSlider label="Size" value={size} min={4} max={100} onChange={onSize} onActiveChange={onSizeActive} disabled={!strokeActive} />
          <InlineSlider label="Opacity" value={opacity} min={1} max={100} onChange={onOpacity} />
          <InlineSlider label="Hardness" value={smoothness} min={0} max={100} onChange={onSmoothness} disabled={!strokeActive} />
        </SurfaceSliderRow>
      )}
    </div>
  );
}
