import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme';

const SLIDE_MS = 350;

// "Multi Select" label: the same spot, type and slide-in from the left edge as
// the tool-name labels (ToolAnnouncement). It stays while multi-select is on
// and slides back out when it ends.
export default function MultiSelectLabel({ active }) {
  const { uiColor } = useTheme();
  const [mounted, setMounted] = useState(active);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setMounted(true);
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), SLIDE_MS);
    return () => clearTimeout(t);
  }, [active]);

  if (!mounted) return null;
  return (
    <div
      className="absolute top-[calc(max(env(safe-area-inset-top,0px),1.75rem)+7rem)] left-0 z-50 font-mono font-semibold pointer-events-none"
      style={{
        color: uiColor,
        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        transform: visible ? 'translateX(0)' : 'translateX(-105%)',
        transition: `transform ${SLIDE_MS}ms ease`,
        maxWidth: '16rem',
      }}
    >
      <div className="px-2 py-1.5 text-[1.375rem] leading-tight">Multi Select</div>
    </div>
  );
}
