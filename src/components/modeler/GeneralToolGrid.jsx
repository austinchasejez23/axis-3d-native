import { useEffect, useRef, useState } from 'react';
import {
  Eye, EyeOff, Palette, Hand,
  ArrowLeftRight, Box, Hexagon, Spline, Circle, Move3D, ImagePlus,
} from 'lucide-react';
import { ProtractorIcon, MeasureIcon } from '@/lib/toolIcons';
import { VOID } from '@/lib/toolLayout';
import { useTheme } from '@/lib/theme';
import { useToolArrange } from '@/hooks/use-tool-arrange';
import GridToolButton from './GridToolButton';
import GlassToolRow from './GlassToolRow';
import ToolGridActions from './ToolGridActions';
import ToolDragGhost from './ToolDragGhost';

export default function GeneralToolGrid({
  onClose,
  onMaterial, onSculpt, onAddReference, onExitMultiSelect, onConvert, anyHidden, onDisplaySelected,
  angleMode, onToggleAngle, measureMode, onToggleMeasure, onActivateTool,
  freeTransform, onToggleFreeTransform, clearSelectionToken, isPro, onProLock,
}) {
  const { toolLabelsEnabled, highlightColor } = useTheme();
  const [convertOpen, setConvertOpen] = useState(false);
  const referenceInputRef = useRef(null);
  const arrange = useToolArrange('general');
  useEffect(() => { arrange.clearSelected(); }, [clearSelectionToken]);
  const run = (id, fn, close = true) => {
    onActivateTool?.(id);
    if (id !== 'multi') onExitMultiSelect?.();
    fn?.();
    if (close) onClose?.();
  };

  const items = [
    { id: 'reference', label: 'Reference', icon: ImagePlus, onClick: () => run('reference', () => referenceInputRef.current?.click(), false) },
    { id: 'materials', label: 'Materials', icon: Palette, onClick: () => { onActivateTool?.('material'); onMaterial?.(); onClose?.(); } },
    { id: 'sculpt', label: 'Sculpt', icon: Hand, locked: !isPro, onClick: () => !isPro ? onProLock?.('Sculpt requires AXIS 3D Pro.') : run('sculpt', onSculpt) },
    { id: 'free_transform', label: 'Free Transform', icon: Move3D, active: freeTransform, onClick: () => run('free_transform', onToggleFreeTransform) },
    { id: 'protractor', label: 'Protractor', icon: ProtractorIcon, active: angleMode, onClick: () => run('protractor', onToggleAngle) },
    { id: 'measure', label: 'Measure', icon: MeasureIcon, active: measureMode, onClick: () => run('measure', onToggleMeasure, false) },
    { id: 'convert', label: 'Convert', icon: ArrowLeftRight, active: convertOpen, onClick: () => { onActivateTool?.('convert'); setConvertOpen((v) => !v); } },
    { id: 'display', label: anyHidden ? 'Display hidden' : 'Display selected', icon: anyHidden ? Eye : EyeOff, onClick: () => run('display', onDisplaySelected, false) },

  ];
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  const convertItems = [
    { label: 'Object', icon: Box, onClick: () => run('convert_object', () => onConvert?.('object')) },
    { label: 'Face', icon: Hexagon, onClick: () => run('convert_face', () => onConvert?.('face')) },
    { label: 'Edge', icon: Spline, onClick: () => run('convert_edge', () => onConvert?.('edge')) },
    { label: 'Vertex', icon: Circle, onClick: () => run('convert_vertex', () => onConvert?.('vertex')) },
  ];

  const dragging = !!arrange.held;
  const selecting = arrange.selected.length > 0;
  const isHeld = (r, c) => arrange.held?.row === r && arrange.held?.col === c;
  const isOver = (r, c) => dragging && arrange.over?.row === r && arrange.over?.col === c && !isHeld(r, c);
  const heldTool = dragging ? byId[arrange.rows[arrange.held.row]?.[arrange.held.col]] : null;
  const backdropRows = arrange.rows.map((row) => row.map((cell) => (
    cell !== VOID && cell !== null && !!byId[cell]
    && !(arrange.hidden.includes(cell) && !arrange.expanded && !dragging)
  )));

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 px-1 pb-[calc(0.75rem+var(--axis-safe-bottom,env(safe-area-inset-bottom,0px)))] pointer-events-none" onClickCapture={arrange.onClickCapture}>
      <input ref={referenceInputRef} type="file" accept="image/*" aria-label="Choose reference image" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) { onAddReference?.(file); onClose?.(); }
        event.target.value = '';
      }} />
      {heldTool && <ToolDragGhost icon={heldTool.icon} label={heldTool.label} pointer={arrange.pointer} />}
      <ToolGridActions
        mode="general"
        showHide={arrange.selected.length >= 2}
        hideLabel={arrange.allSelectedHidden ? 'Show' : 'Hide'}
        onHide={arrange.toggleHideSelected}
        showChevron={arrange.hidden.length > 0}
        expanded={arrange.expanded}
        onToggleExpanded={arrange.toggleExpanded}
      />
      {arrange.rows.map((row, r) => (
        <GlassToolRow
          key={r}
          backdropCells={backdropRows[r]}
          previousCells={backdropRows[r - 1]}
          nextCells={backdropRows[r + 1]}
          className={row.slice(1).every((cell) => cell === VOID) ? (toolLabelsEnabled ? 'min-h-14' : 'min-h-11') : ''}
          cells={row.map((cell, c) => {
            if (cell === VOID) return null;
            const hiddenAway = cell !== null && arrange.hidden.includes(cell) && !arrange.expanded && !dragging;
            if (cell === null || hiddenAway) {
              return dragging && cell === null ? (
                <div
                  data-tool-slot={`${r}:${c}`}
                  className={`w-full rounded-lg border border-dashed pointer-events-auto ${toolLabelsEnabled ? 'h-14' : 'h-11'}`}
                  style={{ borderColor: `${highlightColor}${isOver(r, c) ? 'cc' : '55'}`, background: isOver(r, c) ? `${highlightColor}22` : 'transparent', touchAction: 'none' }}
                />
              ) : null;
            }
            const tool = byId[cell];
            if (!tool) return null;
            const isSelected = arrange.selected.includes(cell);
            return (
              <div
                key={cell}
                data-tool-slot={`${r}:${c}`}
                onPointerDown={arrange.onPointerDown(r, c)}
                onContextMenu={(e) => e.preventDefault()}
                className={`relative rounded-lg pointer-events-auto transition-transform ${isHeld(r, c) ? 'scale-110 opacity-70' : isOver(r, c) ? 'scale-95 opacity-80' : ''}`}
                style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', background: 'transparent' }}
              >
                <GridToolButton fullWidth mode="general" icon={tool.icon} label={tool.label} active={isSelected || tool.active} locked={tool.locked} onClick={() => (selecting ? arrange.toggleSelected(cell) : tool.onClick())} />
                {cell === 'convert' && convertOpen && (
                  <div className="absolute right-0 bottom-[calc(100%+0.25rem)] z-30 w-full flex flex-col pointer-events-auto">
                    {convertItems.map((item) => (
                      <GridToolButton key={item.label} fullWidth icon={item.icon} iconClassName="w-5 h-5" label={item.label} onClick={item.onClick} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        />
      ))}
    </div>
  );
}