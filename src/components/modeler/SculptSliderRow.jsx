import InlineSlider from './InlineSlider';

export default function SculptSliderRow({ label, value, display, min, max, step, onChange, onActiveChange, action }) {
  return (
    <div className="flex-1 min-h-0 flex items-center gap-2">
      <InlineSlider
        grow
        label={label}
        value={value}
        display={display}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        onActiveChange={onActiveChange}
      />
      {action}
    </div>
  );
}