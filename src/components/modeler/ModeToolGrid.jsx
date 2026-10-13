import { useEffect, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { TOOLS } from '@/lib/tools';
import { VOID } from '@/lib/toolLayout';
import { useTheme } from '@/lib/theme';
import GridToolButton from './GridToolButton';
import GlassToolRow from './GlassToolRow';
import ToolGridActions from './ToolGridActions';
import ToolDragGhost from './ToolDragGhost';
import { useToolArrange } from '@/hooks/use-tool-arrange';
import { PRO_TOOL_IDS } from '@/lib/proAccess';

const SEGMENTS_TOOL = { id: 'segments', label: 'Segments', icon: Grid3x3 };
const BOOLEAN_TOOLS = new Set(['subtract', 'union', 'intersect']);

export default function ModeToolGrid({ selectionMode, onTool, onSegments, onLock, lockLabel, softNormalsOn, clearSelectionToken, isPro, onProLock }) {
  const { toolLabelsEnabled, highlightColor } = useTheme();
  const [booleanOpen, setBooleanOpen] = useState(false);
  const arrange = useToolArrange(selectionMode);
  useEffect(() => { arrange.clearSelected(); }, [clearSelectionToken]);
  const rows = arrange.rows;
  if (!rows) return null;
  // Use only true empty layout cells so the expanded tools never cover a
  // rearranged or hidden tool. Keep their visual order top to bottom.
  const booleanRow = rows.findIndex((row) => row.includes('boolean'));
  const booleanCol = booleanRow < 0 ? 0 : rows[booleanRow].indexOf('boolean');
  const booleanSlots = rows.flatMap((row, r) => row.map((cell, c) => ({ cell, r, c })))
    .filter(({ cell }) => cell === null)
    .sort((a, b) => (Math.abs(a.r - booleanRow) + Math.abs(a.c - booleanCol)) - (Math.abs(b.r - booleanRow) + Math.abs(b.c - booleanCol)))
    .slice(0, 3)
    .sort((a, b) => a.r - b.r || a.c - b.c);
  const expandedBoolean = new Map(booleanSlots.map(({ r, c }, index) => [`${r}:${c}`, ['subtract', 'union', 'intersect'][index]]));

  const byId = { segments: SEGMENTS_TOOL };
  for (const page of TOOLS[selectionMode].pages) {
    for (const tool of page) byId[tool.id] = tool;
  }

  const runTool = (id) => {
    if (!isPro && PRO_TOOL_IDS.has(id)) { onProLock?.(`${byId[id]?.label || 'This tool'} requires AXIS 3D Pro.`); return; }
    if (id === 'boolean') { setBooleanOpen((open) => !open); return; }
    if (BOOLEAN_TOOLS.has(id)) setBooleanOpen(false);
    if (id === 'segments') onSegments?.();
    else if (id === 'lock') onLock?.();
    else onTool(id);
  };
  const dragging = !!arrange.held;
  const selecting = arrange.selected.length > 0;
  const isHeld = (r, c) => arrange.held?.row === r && arrange.held?.col === c;
  const isOver = (r, c) => dragging && arrange.over?.row === r && arrange.over?.col === c && !isHeld(r, c);
  const heldTool = dragging ? byId[rows[arrange.held.row]?.[arrange.held.col]] : null;
  // Follow the real visible tool positions, including tool swaps, hidden
  // positions and Boolean's temporary expanded options. Empty drop targets
  // never acquire a background.
  const backdropRows = rows.map((row, r) => row.map((cell, c) => {
    if (cell === VOID) return false;
    if (cell === null) return booleanOpen && !dragging && expandedBoolean.has(`${r}:${c}`);
    if (BOOLEAN_TOOLS.has(cell) && !booleanOpen) return false;
    return !!byId[cell] && !(arrange.hidden.includes(cell) && !arrange.expanded && !dragging);
  }));

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 px-1 pb-[calc(0.75rem+var(--axis-safe-bottom,env(safe-area-inset-bottom,0px)))] pointer-events-none"
      onClickCapture={arrange.onClickCapture}
    >
      {heldTool && <ToolDragGhost icon={heldTool.icon} label={heldTool.label} pointer={arrange.pointer} />}
      {booleanOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onPointerDown={(event) => {
            event.preventDefault();
            setBooleanOpen(false);
          }}
          className="fixed inset-0 z-0 pointer-events-auto bg-transparent"
          style={{ background: 'transparent', border: 0, padding: 0 }}
        />
      )}
      <div className="relative z-10">
      <ToolGridActions
        mode={selectionMode}
        showHide={arrange.selected.length >= 2}
        hideLabel={arrange.allSelectedHidden ? 'Show' : 'Hide'}
        onHide={arrange.toggleHideSelected}
        showChevron={arrange.hidden.length > 0}
        expanded={arrange.expanded}
        onToggleExpanded={arrange.toggleExpanded}
      />
      {rows.map((row, r) => (
        <GlassToolRow
          key={r}
          backdropCells={backdropRows[r]}
          previousCells={backdropRows[r - 1]}
          nextCells={backdropRows[r + 1]}
          className={row.slice(1).every((cell) => cell === VOID) ? (toolLabelsEnabled ? 'min-h-14' : 'min-h-11') : ''}
          cells={row.map((cell, c) => {
            if (cell === VOID) return null;
            if (BOOLEAN_TOOLS.has(cell) && !booleanOpen) return null;
            const hiddenAway = cell !== null && arrange.hidden.includes(cell) && !arrange.expanded && !dragging;
            if (cell === null || hiddenAway) {
              const expandedId = booleanOpen && !dragging && cell === null ? expandedBoolean.get(`${r}:${c}`) : null;
              if (expandedId) {
                const tool = byId[expandedId];
                return <div className="rounded-lg pointer-events-auto"><GridToolButton fullWidth mode={selectionMode} icon={tool.icon} label={tool.label} locked={!isPro} onClick={() => runTool(expandedId)} /></div>;
              }
              // Free empty slot (or a tucked-away hidden tool's slot): only a
              // drop target, and only while dragging, so it never takes a tap
              // or any space during normal modeling.
              return dragging && cell === null ? (
                <div
                  data-tool-slot={`${r}:${c}`}
                  className={`w-full rounded-lg border border-dashed pointer-events-auto ${toolLabelsEnabled ? 'h-14' : 'h-11'}`}
                  style={{
                    borderColor: `${highlightColor}${isOver(r, c) ? 'cc' : '55'}`,
                    background: isOver(r, c) ? `${highlightColor}22` : 'transparent',
                    touchAction: 'none',
                  }}
                />
              ) : null;
            }
            const tool = byId[cell];
            if (!tool) return null;
            const isSelected = arrange.selected.includes(cell);
            return (
              <div
                data-tool-slot={`${r}:${c}`}
                onPointerDown={arrange.onPointerDown(r, c)}
                onContextMenu={(e) => e.preventDefault()}
                className={`rounded-lg pointer-events-auto transition-transform ${isHeld(r, c) ? 'scale-110 opacity-70' : isOver(r, c) ? 'scale-95 opacity-80' : ''}`}
                // Always off: a touch that the browser claims as a scroll/long-press
                // gets cancelled mid-drag and the tool never moves.
                style={{
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  background: 'transparent',
                }}
              >
                <GridToolButton
                  fullWidth
                  mode={selectionMode}
                  icon={tool.icon}
                  iconClassName={selectionMode === 'vertex' ? (cell === 'add_vertex' ? 'w-[33px] h-[33px]' : 'w-[31px] h-[31px]') : undefined}
                  iconStrokeWidth={selectionMode === 'vertex' ? (cell === 'add_vertex' ? 1.7 : 1.45) : undefined}
                  labelClassName={selectionMode === 'vertex' ? (cell === 'add_vertex' ? 'text-[10px] font-semibold' : 'text-[9px] font-medium') : undefined}
                  label={cell === 'soft_normals' ? (softNormalsOn ? 'Hard normals' : 'Soft normals') : cell === 'lock' ? lockLabel : tool.label}
                  active={isSelected}
                  locked={!isPro && PRO_TOOL_IDS.has(cell)}
                  // While a selection is going, taps toggle tools in and out of
                  // it (like multi-select) instead of running them.
                  onClick={() => (selecting ? arrange.toggleSelected(cell) : runTool(cell))}
                />
              </div>
            );
          })}
        />
      ))}
      </div>
    </div>
  );
}