import { Check, Trash2, X, Scissors, Crosshair } from 'lucide-react';

function CenterCutIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4H20V20H5" opacity="0.7" /><path d="M12 3V21" /><circle cx="12" cy="3" r="1.6" fill="currentColor" /><circle cx="12" cy="21" r="1.6" fill="currentColor" />
  </svg>;
}
import { useTheme } from '@/lib/theme';
import ModelingPanel from '@/components/modeler/ModelingPanel';
import { CutLoopIcon, DrawCutIcon } from '@/lib/toolIcons';

function StraightCutIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 4v16" /><circle cx="12" cy="4" r="2" fill="currentColor" /><circle cx="12" cy="20" r="2" fill="currentColor" />
  </svg>;
}
function FollowCutIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3 17 12 6 21" /><circle cx="5" cy="3" r="2" fill="currentColor" /><circle cx="17" cy="12" r="2" fill="currentColor" /><circle cx="6" cy="21" r="2" fill="currentColor" />
  </svg>;
}

export default function CutPanel({ cut, onCut, onDeleteLast, onCancel, onCenterSnap, onPathMode, onDrawSnap }) {
  const { uiColor, highlightColor } = useTheme();
  if (!cut) return null;

  const draw = cut.kind === 'draw';
  const title = draw ? 'Draw Cut' : 'Cut Loop';
  const Icon = draw ? DrawCutIcon : CutLoopIcon;
  return (
    <ModelingPanel label={`${title} controls`} keypadOpen={false}>
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="text-[16px] font-bold tracking-tight leading-none">{title}</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label={`Cancel ${title}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={onCut} disabled={!cut.ready} aria-label={`Apply ${title}`} className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95 disabled:opacity-40" style={{ color: highlightColor, borderColor: highlightColor }}> 
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {!draw && <div className="modeling-value grid grid-cols-4 gap-0.5 rounded-lg p-1">
          {[
            { label: 'Cut', Icon: Scissors, action: onCut, selected: false, disabled: !cut.ready },
            { label: 'Center', Icon: CenterCutIcon, action: () => onCenterSnap?.(!cut.snapCenter), selected: cut.snapCenter },
            { label: 'Straight', Icon: StraightCutIcon, action: () => onPathMode?.('straight'), selected: cut.pathMode === 'straight' },
            { label: 'Follow', Icon: FollowCutIcon, action: () => onPathMode?.('follow'), selected: cut.pathMode !== 'straight' },
          ].map(({ label, Icon: ButtonIcon, action, selected, disabled }) => (
            <button key={label} type="button" onClick={action} disabled={disabled} aria-label={label} aria-pressed={selected} className="flex min-w-0 flex-col items-center justify-center gap-0 rounded-md py-0.5 disabled:opacity-35" style={{ color: selected ? highlightColor : uiColor }}>
              <ButtonIcon className="h-5 w-5" strokeWidth={2} />
              <span className="text-[11px] font-semibold">{label}</span>
            </button>
          ))}
        </div>}
        {draw && <div className="modeling-value grid grid-cols-2 gap-1 rounded-lg px-2 py-1">
          <button type="button" aria-label="Delete last point" onClick={onDeleteLast} disabled={!cut.pointCount}
            className="flex h-8 items-center justify-center gap-1 rounded-md disabled:opacity-35" style={{ color: uiColor }}>
            <Trash2 className="h-5 w-5" strokeWidth={2} />
            <span className="text-[12px] font-semibold">Delete Last</span>
          </button>
          <button type="button" aria-label="Snap to nearest point" aria-pressed={cut.snapPoint} onClick={() => onDrawSnap?.(!cut.snapPoint)}
            className="flex h-8 items-center justify-center gap-1 rounded-md" style={{ color: cut.snapPoint ? highlightColor : uiColor }}>
            <Crosshair className="h-5 w-5" strokeWidth={2} />
            <span className="text-[12px] font-semibold">Snap</span>
          </button>
        </div>}
      </div>
    </ModelingPanel>
  );
}