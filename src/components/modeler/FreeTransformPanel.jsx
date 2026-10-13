import { useState } from 'react';
import { Move3D, Move, Rotate3D, Scaling, Check, X } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import ModelingPanel from '@/components/modeler/ModelingPanel';

export default function FreeTransformPanel({ settings, onChange, onClose }) {
  const t = useTheme();
  // X restores the Move/Rotate/Scale choices the panel opened with; Check keeps changes.
  const [initial] = useState(() => ({ ...settings }));
  const cancel = () => {
    Object.keys(initial).forEach((key) => { if (settings[key] !== initial[key]) onChange(key, initial[key]); });
    onClose();
  };
  const options = [
    { key: 'move', label: 'Move', Icon: Move },
    { key: 'rotate', label: 'Rotate', Icon: Rotate3D },
    { key: 'scale', label: 'Scale', Icon: Scaling },
  ];

  return (
    <ModelingPanel label="Free Transform controls" keypadOpen={false}>
      <div className="py-1.5">
        <div className="mb-1.5 flex items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: t.uiColor }}>
            <Move3D className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">Free Transform</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={cancel} aria-label="Cancel free transform changes"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: t.uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={onClose} aria-label="Done with free transform settings"
              className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95"
              style={{ color: t.highlightColor, borderColor: t.highlightColor }}>
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="modeling-value grid grid-cols-3 rounded-lg px-2 py-0">
          {options.map(({ key, label, Icon }, index) => {
            const active = settings[key];
            return (
              <div key={key} className={`flex items-center justify-center ${index ? 'border-l border-white/15' : ''}`}>
                <button type="button" aria-pressed={active} onClick={() => onChange(key, !active)}
                  className="flex h-7 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-md px-2 text-[12px] font-semibold active:scale-95"
                  style={{ color: active ? t.highlightColor : t.uiColor }}>
                  <Icon className="h-4 w-4" strokeWidth={2} />
                  <span>{label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ModelingPanel>
  );
}