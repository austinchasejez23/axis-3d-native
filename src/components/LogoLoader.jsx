// The app's loading animation: the AXIS logo turning slowly, with no
// background. `label` (optional) sits under it.
export const LOADER_LOGO_URL = '/media/axis_logo_loader.png';

export default function LogoLoader({ width = 120, label = '', spinning = true, style = undefined, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <img
        src={LOADER_LOGO_URL}
        alt=""
        draggable={false}
        className={spinning ? 'animate-spin' : ''}
        style={{ width, height: 'auto', animationDuration: '2.8s', ...style }}
      />
      {label && <span className="text-sm font-medium text-white">{label}</span>}
    </div>
  );
}
