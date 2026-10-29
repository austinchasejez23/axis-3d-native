import { useEffect, useRef, useState } from 'react';
import { Info, X, ChevronLeft } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { setHelpToolsOpen } from '@/lib/helpMode';
import { HELP_BASICS, HELP_GESTURES, HELP_SECTIONS, HELP_MATERIALS, findHelpEntry } from '@/lib/helpContent';

// Help panel. Pages: main (Gestures / Tools / Materials buttons + basics), tools
// (every tool + what it does), gestures, materials (Paint, Material, Texture). While the tools page is open, tapping a tool
// in the viewport does not run it; it scrolls this list to that tool and
// highlights it.
const GAP = 'h-[18px] shrink-0'; // one line of body text

export default function HelpPanel({ onClose }) {
  const { uiColor, highlightColor } = useTheme();
  const [view, setView] = useState('main');
  const [activeKey, setActiveKey] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    setHelpToolsOpen(view === 'tools');
    return () => setHelpToolsOpen(false);
  }, [view]);

  useEffect(() => {
    if (view !== 'tools') return undefined;
    const onTool = (event) => {
      const entry = findHelpEntry(event.detail || {});
      if (!entry) return;
      setActiveKey(entry.key);
      requestAnimationFrame(() => {
        const box = scrollRef.current;
        const el = box?.querySelector(`[data-help-key="${entry.key}"]`);
        if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 4), behavior: 'smooth' });
      });
    };
    window.addEventListener('axis-help-tool', onTool);
    return () => window.removeEventListener('axis-help-tool', onTool);
  }, [view]);

  const go = (next) => { setActiveKey(null); setView(next); };
  const actionClass = 'modeling-value flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-95';
  const buttonClass = 'modeling-value flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-[13px] font-semibold active:scale-95';
  const labelClass = 'text-[16px] font-bold leading-snug';

  return (
    <div
      className="absolute left-[3.75rem] right-[3.5rem] top-[calc(max(env(safe-area-inset-top,0px),1.75rem)+9.5rem)] z-50 pointer-events-auto"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="modeling-panel modeling-sheet flex max-h-[46vh] flex-col rounded-2xl px-2 py-2" role="dialog" aria-label="Help">
        <div className="mb-2 flex shrink-0 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5" style={{ color: uiColor }}>
            <Info className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <h2 className="truncate text-[16px] font-bold leading-none tracking-tight">Help</h2>
          </div>
          <div className="ml-1 flex shrink-0 items-center gap-2">
            <button type="button" onClick={onClose} aria-label="Close help" className={actionClass} style={{ color: uiColor }}>
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
            {view !== 'main' && (
              <button type="button" onClick={() => go('main')} aria-label="Back to help" className={actionClass} style={{ color: uiColor }}>
                <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="modeling-value relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg px-2 pb-2 text-[13px] leading-snug" style={{ color: uiColor }}>
          <div className={GAP} />

          {view === 'main' && (
            <>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => go('gestures')} className={buttonClass} style={{ color: uiColor }}>Gestures</button>
                <button type="button" onClick={() => go('tools')} className={buttonClass} style={{ color: uiColor }}>Tools</button>
                <button type="button" onClick={() => go('materials')} className={buttonClass} style={{ color: uiColor }}>Materials</button>
              </div>
              <div className={GAP} />
              <ul className="flex flex-col gap-[9px] pl-4" style={{ listStyle: 'disc' }}>
                {HELP_BASICS.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          )}

          {view === 'tools' && (
            <>
              <p className="text-[17px] font-bold leading-snug">Select any tool from viewport for description</p>
              <div className={GAP} />
              <div className="flex flex-col gap-[18px]">
                {HELP_SECTIONS.map((section) => (
                  <section key={section.title} className="flex flex-col gap-[9px]">
                    <h3 className="text-[17px] font-bold leading-snug">{section.title}</h3>
                    {section.entries.map((entry) => {
                      const Icon = entry.icon;
                      const active = activeKey === entry.key;
                      return (
                        <div
                          key={entry.key}
                          data-help-key={entry.key}
                          className="flex items-start gap-2 rounded-lg"
                          style={{
                            background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                            boxShadow: active ? `0 0 0 1px ${highlightColor}` : 'none',
                          }}
                        >
                          <Icon className="mt-0.5 h-6 w-6 shrink-0" strokeWidth={1.5} style={{ color: uiColor }} />
                          <div className="min-w-0">
                            <div className={labelClass} style={{ color: highlightColor }}>{entry.label}</div>
                            <div>{entry.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            </>
          )}

          {view === 'materials' && (
            <div className="flex flex-col gap-[18px]">
              {HELP_MATERIALS.map((section) => (
                <section key={section.title} className="flex flex-col gap-[9px]">
                  <h3 className="text-[17px] font-bold leading-snug">{section.title}</h3>
                  {section.entries.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <div key={entry.key} className="flex items-start gap-2 rounded-lg">
                        <Icon className="mt-0.5 h-6 w-6 shrink-0" strokeWidth={1.5} style={{ color: uiColor }} />
                        <div className="min-w-0">
                          <div className={labelClass} style={{ color: highlightColor }}>{entry.label}</div>
                          <div>{entry.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          )}

          {view === 'gestures' && (
            <div className="flex flex-col gap-[9px]">
              {HELP_GESTURES.map(([name, text]) => (
                <div key={name}>
                  <div className={labelClass} style={{ color: highlightColor }}>{name}</div>
                  <div>{text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
