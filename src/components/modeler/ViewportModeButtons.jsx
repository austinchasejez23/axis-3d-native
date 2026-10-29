import { useEffect, useRef, useState } from 'react';
import { Globe, Scan } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { helpIntercept } from '@/lib/helpMode';

export default function ViewportModeButtons({ clay, transparent, onClay, onTransparent }) {
  const { uiColor, highlightColor } = useTheme();
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);
  const pointerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const select = (label, action) => {
    clearTimeout(timerRef.current);
    setNotice(label);
    timerRef.current = setTimeout(() => setNotice(null), 1400);
    action();
  };
  const tapProps = (target, action) => ({
    onPointerDown: (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); pointerRef.current = { target, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; },
    onPointerMove: (e) => {
      e.stopPropagation();
      const p = pointerRef.current;
      if (p?.target === target && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) p.moved = true;
    },
    onPointerCancel: (e) => { e.stopPropagation(); pointerRef.current = null; },
    onPointerUp: (e) => {
      e.stopPropagation();
      const p = pointerRef.current;
      pointerRef.current = null;
      if (p && p.target === target && p.id === e.pointerId && !p.moved) {
        if (helpIntercept({ id: target })) return;
        action();
      }
    },
  });
  const button = 'pointer-events-auto relative w-full h-8 rounded-md flex items-center justify-center active:scale-95 transition-transform touch-none';
  const style = (active) => ({
    color: active ? highlightColor : uiColor,
    textShadow: '0 1px 3px rgba(0,0,0,0.35)',
  });

  return (
    <div className="relative z-10 flex w-full flex-col items-center">
      <button {...tapProps('clay', () => select('Clay', onClay))} aria-label="Toggle clay viewport" aria-pressed={clay} style={style(clay)} className={button}>
        {notice === 'Clay' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Clay</span>}
        <Globe className="w-5 h-5 shrink-0" strokeWidth={2.0} />
      </button>
      <div className="h-[10px] w-full" aria-hidden="true" />
      <button {...tapProps('transparent', () => select('Transparent', onTransparent))} aria-label="Toggle transparent viewport" aria-pressed={transparent} style={style(transparent)} className={button}>
        {notice === 'Transparent' && <span className="absolute left-full ml-1 z-20 text-sm whitespace-nowrap translate-y-[3px]">Transparent</span>}
        <Scan className="w-5 h-5 shrink-0" strokeWidth={2.0} />
      </button>
    </div>
  );
}