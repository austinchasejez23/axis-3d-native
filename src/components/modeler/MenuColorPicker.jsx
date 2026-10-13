import RoundColorPicker from './RoundColorPicker';

export default function MenuColorPicker({ value, onChange, defaultColor, highlightColor }) {
  return (
    <div className="w-[182px]">
      <RoundColorPicker color={value} onChange={onChange} size={182} />
      <button
        onClick={() => onChange(defaultColor)}
        className="mt-2 w-full h-7 rounded-md border border-white/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <span className="w-4 h-4 rounded border border-white/30" style={{ backgroundColor: defaultColor }} />
        <span className="text-[12px] font-medium" style={{ color: highlightColor }}>Default</span>
      </button>
    </div>
  );
}