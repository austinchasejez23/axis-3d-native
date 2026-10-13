import { X } from 'lucide-react';
import GuideCategoryContent from '@/components/modeler/GuideCategoryContent';
import { useTheme } from '@/lib/theme';
import GuideQuestionBar from './GuideQuestionBar';

export default function GuideSheet({ onClose }) {
  const { uiColor, highlightColor } = useTheme();
  return (
    <div className="absolute inset-0 z-50 flex flex-col safe-top safe-bottom" style={{ background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(8px)' }}>
      <header className="flex items-center justify-between pl-4 pr-2 pt-2 pb-1">
        <h2 className="text-base font-semibold" style={{ color: highlightColor }}>Guides</h2>
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center active:scale-95" style={{ color: uiColor }} aria-label="Close guides"><X className="w-6 h-6" /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-8 no-scrollbar">
        <GuideQuestionBar uiColor={uiColor} highlightColor={highlightColor} />
        <GuideCategoryContent uiColor={uiColor} highlightColor={highlightColor} />
      </div>
    </div>
  );
}