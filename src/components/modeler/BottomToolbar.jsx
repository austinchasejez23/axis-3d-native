import { Wrench, Library } from 'lucide-react';
import { useTheme } from '@/lib/theme';

export function ModeIcon({ mode, color }) {
  const sw = 1.8;
  // Scale the whole icon uniformly; keep the existing toolbar button bounds.
  if (mode === 'vertex') {
    return (
      <svg width="27" height="27" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="4" fill={color} />
      </svg>
    );
  }
  if (mode === 'edge') {
    return (
      <svg width="27" height="27" viewBox="0 0 22 22" fill="none">
        <line x1="4" y1="18" x2="18" y2="4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  if (mode === 'face') {
    return (
      <svg width="27" height="27" viewBox="0 0 22 22" fill="none" className="rotate-45">
        <rect x="5" y="5" width="12" height="12" stroke={color} strokeWidth={sw} rx="1" />
      </svg>
    );
  }
  if (mode === 'object') {
    return (
      <svg width="27" height="27" viewBox="0 0 22 22" fill="none">
        <path d="M11 2L19 6.5V15.5L11 20L3 15.5V6.5L11 2Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M3 6.5L11 11L19 6.5M11 11V20" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      </svg>
    );
  }
  return null;
}

export default function BottomToolbar({ selectionMode, onModeChange, onToggleTools, toolsOpen, onLibrary, libraryOpen, soloButton }) {
  const { uiColor, highlightColor, toolLabelsEnabled } = useTheme();
  const modes = [
    { id: 'tools', label: 'Tools', isAction: true },
    { id: 'vertex', label: 'Vertex' },
    { id: 'edge', label: 'Edge' },
    { id: 'face', label: 'Face' },
    { id: 'object', label: 'Object' },
  ];

  const buttonBase = {
    color: uiColor,
    textShadow: '0 1px 3px rgba(0,0,0,0.35)',
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 safe-bottom pt-1"
      style={{ background: 'rgba(9,13,22,0.38)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-end justify-center gap-0 mx-0 mb-0">
        {modes.map((mode) => {
          if (soloButton && mode.id !== soloButton) {
            return <div key={mode.id} className="flex-1" />;
          }
          if (mode.isAction) {
            const active = toolsOpen;
            return (
              <button
                key={mode.id}
                onClick={onToggleTools}
                aria-label="Tools"
                aria-pressed={active}
                style={active ? { ...buttonBase, color: highlightColor } : buttonBase}
                className="flex-1 min-w-0 h-16 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation"
              >
                <Wrench className="w-[25px] h-[25px]" strokeWidth={2.5} />
                {toolLabelsEnabled && <span className="text-xs font-semibold">{mode.label}</span>}
              </button>
            );
          }
          const active = selectionMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('axis-tool-selected', { detail: { label: mode.label, mode: mode.id } }));
                onModeChange(mode.id);
              }}
              aria-label={`${mode.label} mode`}
              aria-pressed={active}
              style={active ? { ...buttonBase, color: highlightColor } : buttonBase}
              className="flex-1 min-w-0 h-16 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation"
            >
              <ModeIcon mode={mode.id} color={active ? highlightColor : uiColor} />
            </button>
          );
        })}
        {soloButton ? <div className="flex-1" /> : (
        <button
          onClick={onLibrary}
          aria-label="Library"
          aria-pressed={libraryOpen}
          style={libraryOpen ? { ...buttonBase, color: highlightColor } : buttonBase}
          className="flex-1 min-w-0 h-16 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation"
        >
          <Library className="w-[25px] h-[25px]" strokeWidth={2} />
          {toolLabelsEnabled && <span className="text-xs font-semibold">Library</span>}
        </button>
        )}
      </div>
    </div>
  );
}