import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Eye, EyeOff, Palette, Hand,
  ArrowLeftRight, Box, Hexagon, Circle, Move3D, ImagePlus,
} from 'lucide-react';
import { ProtractorIcon, MeasureIcon } from '@/lib/toolIcons';
import { VOID, isStackRow, MODE_COLUMN } from '@/lib/toolLayout';
import { slideOutSpot } from '@/lib/slideOutSpot';
import { useTheme } from '@/lib/theme';
import { useToolArrange } from '@/hooks/use-tool-arrange';
import GridToolButton from './GridToolButton';
import GlassToolRow from './GlassToolRow';
import ToolGridActions from './ToolGridActions';
import ModeGridButton from './ModeGridButton';
import ToolDragGhost from './ToolDragGhost';

// Convert → Edge: a straight edge at an angle, as on the Edge mode button.
function EdgeLineIcon({ className = '', strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  );
}

export default function GeneralToolGrid({
  onClose,
  onMaterial, onSculpt, onAddReference, onExitMultiSelect, onConvert, anyHidden, onDisplaySelected,
  angleMode, onToggleAngle, measureMode, onToggleMeasure, onActivateTool,
  freeTransform, onToggleFreeTransform, clearSelectionToken, isPro, onProLock, multiSelect = false, onTool = undefined, onToggleMultiSelect = undefined,
  onModeButton = undefined,
}) {
  const { toolLabelsEnabled, highlightColor } = useTheme();
  const [convertOpen, setConvertOpen] = useState(false);
  // Where Convert's list sits, relative to the Convert button.
  const [convertSpot, setConvertSpot] = useState(null);
  const gridRef = useRef(null);
  const convertCellRef = useRef(null);
  const referenceInputRef = useRef(null);
  const arrange = useToolArrange('general');
  useEffect(() => { arrange.clearSelected(); }, [clearSelectionToken]);
  // Selecting something on the model closes this panel, unless the open tool
  // works by selecting geometry (Protractor, Measure, Convert).
  useEffect(() => {
    const onSelect = () => { if (!(angleMode || measureMode || convertOpen)) onClose?.(); };
    window.addEventListener('axis-user-selection', onSelect);
    return () => window.removeEventListener('axis-user-selection', onSelect);
  }, [angleMode, measureMode, convertOpen, onClose]);
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
    // Protractor and Measure keep this panel open while they are in use;
    // turning one off closes it, and closing the panel turns them off.
    { id: 'protractor', label: 'Protractor', icon: ProtractorIcon, active: angleMode, onClick: () => run('protractor', onToggleAngle, angleMode) },
    { id: 'measure', label: 'Measure', icon: MeasureIcon, active: measureMode, onClick: () => run('measure', onToggleMeasure, measureMode) },
    { id: 'convert', label: 'Convert', icon: ArrowLeftRight, active: convertOpen, onClick: () => { onActivateTool?.('convert'); setConvertOpen((v) => !v); } },
    { id: 'display', label: anyHidden ? 'Display hidden' : 'Display selected', icon: anyHidden ? Eye : EyeOff, onClick: () => run('display', onDisplaySelected) },

  ];
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  const convertItems = [
    { label: 'Object', icon: Box, onClick: () => run('convert_object', () => onConvert?.('object')) },
    { label: 'Face', icon: Hexagon, onClick: () => run('convert_face', () => onConvert?.('face')) },
    { label: 'Edge', icon: EdgeLineIcon, onClick: () => run('convert_edge', () => onConvert?.('edge')) },
    { label: 'Vertex', icon: Circle, onClick: () => run('convert_vertex', () => onConvert?.('vertex')) },
  ];

  const dragging = !!arrange.held;
  const selecting = arrange.selected.length > 0;
  const isHeld = (r, c) => arrange.held?.row === r && arrange.held?.col === c;
  const isOver = (r, c) => dragging && arrange.over?.row === r && arrange.over?.col === c && !isHeld(r, c);
  const heldTool = dragging ? byId[arrange.rows[arrange.held.row]?.[arrange.held.col]] : null;
  // The Tools button keeps its bottom-row spot while these tools are open.
  const isModeCell = (r, c) => r === arrange.rows.length - 1 && c === MODE_COLUMN.general;
  const backdropRows = arrange.rows.map((row, r) => row.map((cell, c) => isModeCell(r, c) || (
    cell !== VOID && cell !== null && !!byId[cell]
    && !(arrange.hidden.includes(cell) && !arrange.expanded && !dragging)
  )));

  // Convert's list opens straight up when that is clear; otherwise in the
  // nearest clear space of the grid, wherever the Convert button has been moved.
  const layoutKey = JSON.stringify([arrange.rows, arrange.hidden, arrange.expanded, dragging, arrange.selected.length]);
  useLayoutEffect(() => {
    if (!convertOpen) { setConvertSpot(null); return undefined; }
    const place = () => {
      const grid = gridRef.current, cell = convertCellRef.current;
      if (!grid || !cell) return;
      const button = cell.getBoundingClientRect();
      const rect = (el) => el.getBoundingClientRect();
      const visible = (r) => r.width > 0 && r.height > 0;
      const blockers = [
        ...[...grid.querySelectorAll('[data-tool-cell], [data-mode-cell], [data-tool-actions] button')].map(rect),
        ...['axis-side-controls', 'axis-side-handle'].map((id) => document.getElementById(id)).filter(Boolean).map(rect),
      ].filter(visible);
      const spot = slideOutSpot({
        button,
        rows: [...grid.querySelectorAll('[data-tool-row]')].map(rect),
        columns: 6,
        height: convertItems.length * button.height,
        gap: 4,
        blockers,
      });
      const next = { left: spot.left - button.left, top: spot.top - button.top, width: spot.right - spot.left };
      setConvertSpot((current) => (current && ['left', 'top', 'width'].every((k) => Math.abs(current[k] - next[k]) < 0.5) ? current : next));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [convertOpen, layoutKey, toolLabelsEnabled]);

  return (
    <div ref={gridRef} data-tool-grid className="absolute bottom-0 left-0 right-0 z-40 px-1 pb-[calc(0.75rem+var(--axis-safe-bottom,env(safe-area-inset-bottom,0px)))] pointer-events-none" onClickCapture={arrange.onClickCapture}>
      <input ref={referenceInputRef} type="file" accept="image/*" aria-label="Choose reference image" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) { onAddReference?.(file); onClose?.(); }
        event.target.value = '';
      }} />
      {heldTool && <ToolDragGhost icon={heldTool.icon} label={heldTool.label} pointer={arrange.pointer} />}
      <div className="relative">
      <ToolGridActions
        mode="general"
        showHide={arrange.selected.length >= 1}
        onHide={arrange.hideSelected}
        onShow={arrange.showSelected}
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
          className={isStackRow(row) ? (toolLabelsEnabled ? 'min-h-14' : 'min-h-11') : ''}
          bar={!isStackRow(row)}
          rowIndex={r}
          cells={row.map((cell, c) => {
            if (isModeCell(r, c)) return <div data-mode-cell className="rounded-lg pointer-events-auto"><ModeGridButton mode="general" onPress={onModeButton} /></div>;
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
                ref={cell === 'convert' ? convertCellRef : undefined}
                data-tool-slot={`${r}:${c}`}
                data-tool-cell={`${r}:${c}`}
                onPointerDown={arrange.onPointerDown(r, c)}
                onContextMenu={(e) => e.preventDefault()}
                className={`relative rounded-lg pointer-events-auto transition-transform ${isHeld(r, c) ? 'scale-110 opacity-70' : isOver(r, c) ? 'scale-95 opacity-80' : ''}`}
                style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', background: 'transparent' }}
              >
                <GridToolButton fullWidth mode="general" icon={tool.icon} label={tool.label} active={isSelected || tool.active} locked={tool.locked} onClick={() => (selecting ? arrange.toggleSelected(cell) : tool.onClick())} />
                {cell === 'convert' && convertOpen && (
                  // Same surface as the tool panel behind it. Straight up until
                  // the clear spot has been measured.
                  <div
                    className={`absolute z-30 flex flex-col rounded-lg pointer-events-auto ${convertSpot ? '' : 'right-0 bottom-[calc(100%+0.25rem)] w-full'}`}
                    style={{ background: 'rgba(9,13,22,0.38)', ...(convertSpot || {}) }}
                  >
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
    </div>
  );
}