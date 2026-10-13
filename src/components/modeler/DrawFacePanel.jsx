import { useEffect, useState } from 'react';
import { Axis3D } from 'lucide-react';
import DrawFaceHeader from '@/components/modeler/DrawFaceHeader';
import { useTheme } from '@/lib/theme';
import ModelingPanel from '@/components/modeler/ModelingPanel';

// Axis the Draw face stroke follows: the face is drawn on the plane
// perpendicular to the selected world axis.
export default function DrawFacePanel({ axis, onAxis, onCancel, onApply, managerRef }) {
  const { uiColor, highlightColor } = useTheme();
  const [grid, setGrid] = useState(false);
  const [straighten, setStraighten] = useState(false);
  const [align, setAlign] = useState(false);
  useEffect(() => {
    const manager = managerRef.current;
    return () => manager?.setDrawGridEnabled(false);
  }, [managerRef]);
  const toggleGrid = () => { const next = !grid; setGrid(next); managerRef.current?.setDrawGridEnabled(next); };
  const toggleStraighten = () => {
    const next = !straighten;
    setStraighten(next);
    if (!next) setAlign(false);
    managerRef.current?.setDrawStraighten(next);
  };
  const toggleAlign = () => {
    if (!straighten) return;
    const next = !align;
    setAlign(next);
    managerRef.current?.setDrawAlign(next);
  };
  return (
    <ModelingPanel label="Draw face controls" keypadOpen={false}>
      <div className="py-2">
        <DrawFaceHeader grid={grid} onGrid={toggleGrid} onCancel={onCancel} onApply={onApply} />
        <div className="modeling-value grid grid-cols-[2.8rem_repeat(3,minmax(0,1fr))_minmax(0,1.35fr)_minmax(0,0.9fr)] items-center gap-1 rounded-lg px-2 py-2">
          <span className="flex items-center gap-0.5 text-[12px] font-semibold whitespace-nowrap" style={{ color: uiColor }}><Axis3D className="h-3.5 w-3.5 shrink-0" />Axis</span>
          {['x', 'y', 'z'].map((a) => (
            <button key={a} type="button" onClick={() => onAxis(a)} aria-label={`Draw face axis ${a.toUpperCase()}`} aria-pressed={axis === a}
              className="modeling-value !bg-transparent h-8 min-w-0 rounded-lg px-0 text-[13px] font-bold uppercase active:scale-95"
              style={{ color: axis === a ? highlightColor : uiColor, borderColor: axis === a ? highlightColor : undefined }}>{a}</button>
          ))}
          <button type="button" aria-label="Draw face straight edge" aria-pressed={straighten} onClick={toggleStraighten}
            className="modeling-value !bg-transparent flex h-8 min-w-0 flex-col items-center justify-center rounded-lg px-0 text-[12px] font-semibold leading-none active:scale-95"
            style={{ color: straighten ? highlightColor : uiColor, borderColor: straighten ? highlightColor : undefined }}><span className="relative top-px">Straight</span><span className="relative top-px">Edge</span></button>
          <button type="button" aria-label="Draw face align" aria-pressed={align} disabled={!straighten} onClick={toggleAlign}
            className="modeling-value !bg-transparent h-8 min-w-0 rounded-lg px-0 text-[13px] font-semibold active:scale-95 disabled:opacity-40"
            style={{ color: align ? highlightColor : uiColor, borderColor: align ? highlightColor : undefined }}>Align</button>
        </div>
      </div>
    </ModelingPanel>
  );
}