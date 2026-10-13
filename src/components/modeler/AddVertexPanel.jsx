import { Check, X, Trash2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import ModelingPanel from '@/components/modeler/ModelingPanel';
import { AddVertexIcon } from '@/lib/toolIcons';

// Match the Cut Loop Center icon to make midpoint mode recognizable.
function CenterEdgeIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4H20V20H5" opacity="0.7" /><path d="M12 3V21" /><circle cx="12" cy="3" r="1.6" fill="currentColor" /><circle cx="12" cy="21" r="1.6" fill="currentColor" />
  </svg>;
}

// Same panel header as Cut Loop / Draw Cut: icon + title, X then Check.
export default function AddVertexPanel({ state, onConfirm, onCancel, onDeleteLast, onCenterSnap }) {
  const { uiColor, highlightColor } = useTheme();
  if (!state) return null;
  const active = state.count > 0;

  return (
    <ModelingPanel label="Add Vertex controls" keypadOpen={false}>
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <AddVertexIcon className="h-[23px] w-[23px] shrink-0" strokeWidth={1.8} />
            <h2 className="text-[17px] font-bold tracking-tight leading-none">Add Vertex</h2>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={onCancel} aria-label="Cancel add vertex" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95" style={{ color: uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={onConfirm} disabled={!active} aria-label="Apply add vertex" className="modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95 disabled:opacity-40" style={{ color: highlightColor, borderColor: highlightColor }}>
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="modeling-value flex min-h-12 items-center gap-1.5 rounded-lg px-2 py-1.5">
          <div className="min-w-0 flex-1 text-[12px] font-semibold leading-tight" style={{ color: uiColor }}>
            {active ? `${state.count} ${state.count === 1 ? 'vertex' : 'vertices'} added` : 'Tap an edge'}
          </div>
          <button
            type="button"
            onClick={() => onCenterSnap?.(!state.snapCenter)}
            aria-label="Center new vertex on edge"
            aria-pressed={!!state.snapCenter}
            title="Snap new vertex to edge midpoint"
            className="flex h-10 min-w-[62px] shrink-0 flex-col items-center justify-center gap-0 rounded-md px-1 active:scale-95"
            style={{ color: state.snapCenter ? highlightColor : uiColor }}
          >
            <CenterEdgeIcon className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Center</span>
          </button>
          <button
            type="button"
            onClick={onDeleteLast}
            disabled={!active}
            aria-label="Delete last vertex"
            title="Delete last vertex"
            className="flex h-10 min-w-[74px] shrink-0 flex-col items-center justify-center gap-0 rounded-md px-1 disabled:opacity-35 active:scale-95"
            style={{ color: uiColor }}
          >
            <Trash2 className="h-5 w-5" strokeWidth={2} />
            <span className="text-[11px] font-semibold whitespace-nowrap">Delete Last</span>
          </button>
        </div>
      </div>
    </ModelingPanel>
  );
}
