import ScrollerTunnelShadows from './ScrollerTunnelShadows';

// Sideways-scrolling strip of inline sliders (and chips) under the thumbnails,
// each separated by a thin divider like the mockups.
export default function SurfaceSliderRow({ children, fit = false, compact = false, scrollPadTop = false }) {
  const spacing = compact
    ? 'py-1 [&_input]:!h-7'
    : scrollPadTop
      ? 'pt-4 pb-0 [&_input]:!h-8'
      : 'py-2 [&_input]:!h-8';
  const inner = (
    <div className={`flex items-end px-1 ${spacing} ${fit ? 'w-full' : 'w-max'} [&>*]:px-3 [&>*+*]:border-l [&>*+*]:border-white/10`}>
      {children}
    </div>
  );
  return (
    <div className="relative mt-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      {fit ? inner : (
        <>
          <div className="overflow-x-auto no-scrollbar" style={{ touchAction: 'pan-x' }}>{inner}</div>
          <ScrollerTunnelShadows />
        </>
      )}
    </div>
  );
}