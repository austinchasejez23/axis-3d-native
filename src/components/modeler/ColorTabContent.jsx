import { useRef } from 'react';
import RoundColorPicker from './RoundColorPicker';
import VerticalValueSlider from './VerticalValueSlider';
import ColorSwatchGrid from './ColorSwatchGrid';
import PaintToolButtons from './PaintToolButtons';
import InlineSlider from './InlineSlider';
import LoopingSliderScroller from './LoopingSliderScroller';

const WHEEL = 118;
const SHIFT_SLIDER = 3; // index of Shift in the slider strip

// Paint tab: color wheel and its vertical brightness slider on the left; on
// the right the saved-color scroller (led by Remove paint), the six tool
// icons, and — along the bottom like the Material tab — an endless,
// center-snapping strip of sliders. Shift lives in the strip at all times
// and stays grey until Multi is on, so nothing swaps when Multi toggles.
export default function ColorTabContent({
  color, onChange, multi, colorTarget, onColorTarget, strokeActive, showSliders,
  size, smoothness, opacity, onSize, onSmoothness, onOpacity, onSizeActive, shift, onShift,
  paintTool, strokesBlocked, onPaintTool, onMulti, onRemovePaint,
}) {
  const sliderRef = useRef(null);
  // Name the pressed button on screen (under the tool label); Multi (when
  // turning on), Primary and Shift also bring the Shift slider to the center.
  const onPress = (id, label) => {
    window.dispatchEvent(new CustomEvent('axis-paint-label', { detail: { label } }));
    if ((id === 'multi' && !multi) || id === 'primary' || id === 'shift') sliderRef.current?.goTo(SHIFT_SLIDER);
  };
  return (
    <div className="relative h-full flex items-center gap-2">
      <div className="shrink-0 flex items-center gap-2.5" onPointerDown={(e) => e.stopPropagation()}>
        <RoundColorPicker color={color} onChange={onChange} size={WHEEL} ring={false} />
        <VerticalValueSlider color={color} onChange={onChange} height={WHEEL} />
      </div>
      <div className="flex-1 min-w-0 h-full flex flex-col pt-0.5 pb-1.5">
        <ColorSwatchGrid color={color} onChange={onChange} onRemovePaint={onRemovePaint} />
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          <PaintToolButtons
            paintTool={paintTool}
            multi={multi}
            strokesBlocked={strokesBlocked}
            onPaintTool={onPaintTool}
            onMulti={onMulti}
            colorTarget={colorTarget}
            onColorTarget={onColorTarget}
            onPress={onPress}
          />
        </div>
        {showSliders && (
          <LoopingSliderScroller ref={sliderRef}>
            <InlineSlider label="Size" value={size} min={4} max={100} onChange={onSize} onActiveChange={onSizeActive} disabled={!strokeActive} />
            <InlineSlider label="Opacity" value={opacity} min={1} max={100} onChange={onOpacity} />
            <InlineSlider label="Hardness" value={smoothness} min={0} max={100} onChange={onSmoothness} disabled={!strokeActive} />
            <InlineSlider label="Shift" value={shift} display={`${shift}`} min={0} max={100} onChange={onShift} disabled={!multi} />
          </LoopingSliderScroller>
        )}
      </div>
    </div>
  );
}
