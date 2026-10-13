// Shared look for Surface-mode controls: a dark glass pill with a crisp border.
// Inactive reads quietly over the model; active fills with the accent tint and a
// solid accent border instead of a wide blurry halo.
export function surfaceControlStyle(active, highlightColor, uiColor = '#ffffff') {
  const light = uiColor === '#111111';
  return {
    color: active ? highlightColor : uiColor,
    background: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.16)',
    border: `1px solid ${light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.38)'}`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(6px)',
    textShadow: light ? 'none' : '0 1px 2px rgba(0,0,0,0.8)',
  };
}