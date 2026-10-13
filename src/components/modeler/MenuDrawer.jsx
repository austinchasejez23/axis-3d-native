import { useState, useRef, useEffect } from 'react';
import { FileText, Settings as SettingsIcon, FilePlus, Save, LayoutGrid, FileDown, Upload, Monitor, Sun, User, BookOpen, Mail, ChevronDown, ChevronRight, Grid2X2, Highlighter, Boxes, Box } from 'lucide-react';
import AccountPanel from './AccountPanel';
import { useTheme } from '@/lib/theme';
import SettingsPanel from './SettingsPanel';
import ViewportPanel from './ViewportPanel';
import MenuColorPicker from './MenuColorPicker';
import GridCascade from './GridCascade';
import SnapCascade from './SnapCascade';
import GesturePanel from './GesturePanel';
import MenuScreenHeader from './MenuScreenHeader';
import { theme } from '@/lib/theme';
import { listProjects } from '@/lib/storage';

// Unified slim row: icon + label, no fill, tight padding. Width is driven by
// content (no fixed width), so the drawer is only as wide as its text.
function DrawerRow({ icon: Icon, label, color, onClick, chevron, compactRight = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full h-12 flex items-center gap-3 pl-3 ${compactRight ? 'pr-1.5' : 'pr-3'} active:scale-95 transition-transform`}
      style={{ color }}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={1.8} />
      <span className="text-[14px] font-medium whitespace-nowrap">{label}</span>
      {chevron && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
    </button>
  );
}

const TITLES = {
  file: 'File',
  viewport: 'Viewport',
  grid: 'Grid',
  snap: 'Snapping',
  settings: 'Settings',
  gestures: 'Gestures',
  account: 'Account',
  contact: 'Contact us',
  importLibrary: 'Import from library',
  colors: 'Colors',
  background: 'Background color',
  highlight: 'Highlight color',
  gridColor: 'Grid color',
};

export default function MenuDrawer({ open, onClose, backRef, projectName, onRename, onNewProject, onSaveProject, onExport, onLibrary, onImport, onImportFromLibrary, currentProjectId, onGuide, onLighting, display, isPro, onProLock, initialScreen, onConsumeInitialScreen }) {
  const { uiColor, highlightColor, backgroundColor } = useTheme();
  // Navigation stack: every sub-menu REPLACES the one before it in the same
  // spot, and the header's back chevron steps back exactly one level.
  const [stack, setStack] = useState([]);
  const [viewportCascade, setViewportCascade] = useState(null);
  const [gridAnchor, setGridAnchor] = useState({ top: 44, width: 196 });
  const cascadeLayoutRef = useRef(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [name, setName] = useState(projectName);
  const fileInputRef = useRef(null);
  // Reopening the menu normally starts at the main list, never back inside
  // whatever screen (e.g. Lighting) was open last time it closed — unless
  // something outside asked it to open straight to a specific screen (e.g.
  // holding the Snapping icon), in which case that screen's full panel opens
  // directly, with its natural parent still one back-tap away.
  useEffect(() => {
    if (!open) { setStack([]); setViewportCascade(null); setExportOpen(false); return; }
    if (initialScreen) {
      setStack(initialScreen === 'snap' ? ['settings', 'snap'] : [initialScreen]);
      onConsumeInitialScreen?.();
    }
  }, [open]);
  // The saved-model list is read when its screen opens, so a model saved
  // moments ago is already there.
  const [libraryModels, setLibraryModels] = useState([]);
  useEffect(() => {
    if (stack[stack.length - 1] !== 'importLibrary') return;
    setLibraryModels(
      listProjects()
        .filter((item) => item.id !== currentProjectId)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    );
  }, [stack, currentProjectId]);
  // Device back button: steps back one screen at a time; the page closes the
  // menu itself when nothing is left.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (stack.length > 0) { setStack((s) => s.slice(0, -1)); return true; }
      return false;
    };
    return () => { backRef.current = null; };
  }, [backRef, stack]);
  if (!open) return null;
  const closeAll = () => { setStack([]); setViewportCascade(null); onClose(); };
  const borderCol = 'rgba(255,255,255,0.10)';
  // Menus stay fully opaque so the model behind them never bleeds through the
  // text and values.
  const panelStyle = { borderColor: borderCol, background: 'rgb(var(--modeling-sheet))' };
  const screen = stack[stack.length - 1] || 'root';
  const push = (id) => { setViewportCascade(null); setStack((s) => [...s, id]); };
  const back = () => { setViewportCascade(null); setStack((s) => s.slice(0, -1)); };
  const toggleViewportCascade = (id, event) => {
    if (id === 'grid' && event?.currentTarget && cascadeLayoutRef.current) {
      const button = event.currentTarget.getBoundingClientRect();
      const menu = cascadeLayoutRef.current.getBoundingClientRect();
      // Position the Grid settings panel at the actual Grid button's height,
      // and keep its slightly wider controls within the phone viewport.
      setGridAnchor({
        top: Math.max(0, button.top - menu.top),
        width: Math.max(128, Math.min(208, window.innerWidth - menu.right - 12)),
      });
    }
    setViewportCascade((current) => current === id ? null : id);
  };

  const colorFor = (id) => (id === 'background' ? backgroundColor : id === 'gridColor' ? theme.gridColor : highlightColor);
  const defaultFor = (id) => (id === 'background' ? '#1c1c1c' : id === 'gridColor' ? '#3a7bbf' : '#0066ff');
  const setColor = (id, v) => theme.set(id === 'background' ? { backgroundColor: v } : id === 'gridColor' ? { gridColor: v } : { highlightColor: v });

  const renderBody = () => {
    switch (screen) {
      case 'root':
        return (
          <>
            <DrawerRow icon={LayoutGrid} label="Library" color={uiColor} onClick={() => { onLibrary?.(); onClose(); }} />
            <div className="h-px mx-2" style={{ background: borderCol }} />
            <DrawerRow icon={FileText} label="File" color={uiColor} onClick={() => push('file')} chevron />
            <div className="h-px mx-2" style={{ background: borderCol }} />
            <DrawerRow icon={Monitor} label="Viewport" color={uiColor} onClick={() => push('viewport')} chevron />
            <DrawerRow icon={Sun} label="Lighting" color={uiColor} onClick={() => { closeAll(); onLighting?.(); }} />
            <DrawerRow icon={BookOpen} label="Guides" color={uiColor} onClick={() => onGuide?.()} />
            <div className="h-px mx-2" style={{ background: borderCol }} />
            <DrawerRow icon={SettingsIcon} label="Settings" color={uiColor} onClick={() => push('settings')} chevron />
            <DrawerRow icon={User} label="Account" color={uiColor} onClick={() => push('account')} chevron />
            <div className="h-px mx-2" style={{ background: borderCol }} />
            <DrawerRow icon={Mail} label="Contact us" color={uiColor} onClick={() => push('contact')} chevron />
          </>
        );
      case 'file':
        return (
          <div className="pb-1">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); onRename(e.target.value); }}
              placeholder="Project name"
              className="block w-24 h-9 mx-2.5 mt-2 px-2.5 rounded-md bg-white/10 text-white text-[13px] outline-none"
              style={{ caretColor: highlightColor }}
            />
            <DrawerRow compactRight icon={FilePlus} label="New" color={uiColor} onClick={onNewProject} />
            <DrawerRow compactRight icon={Save} label="Save" color={uiColor} onClick={onSaveProject} />
            <div className="relative w-full h-11" onClick={() => { if (!isPro) onProLock?.('Model import requires AXIS 3D Pro.'); }}>
              <div className="w-full h-11 flex items-center gap-2.5 pl-2.5 pr-1" style={{ color: uiColor }}>
                <Upload className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
                <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: !isPro ? '#fbbf24' : undefined, opacity: !isPro ? 0.62 : 1 }}>Import model{!isPro && <sup className="ml-1 text-[8px] font-bold">PRO</sup>}</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                disabled={!isPro}
                accept=".obj,.fbx,.stl,.glb,.gltf,.3mf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (!isPro) onProLock?.('Model import requires AXIS 3D Pro.'); else { onImport?.(f); closeAll(); } } e.target.value = ''; }}
              />
            </div>
            <DrawerRow compactRight icon={Boxes} label="Import from library" color={uiColor} onClick={() => push('importLibrary')} chevron />
            <button
              className="w-full h-11 flex items-center gap-2.5 pl-2.5 pr-1 active:scale-95 transition-transform"
              style={{ color: uiColor }}
              onClick={() => !isPro ? onProLock?.('Model export requires AXIS 3D Pro.') : setExportOpen((v) => !v)}
            >
              <FileDown className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
              <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: !isPro ? '#fbbf24' : undefined, opacity: !isPro ? 0.62 : 1 }}>Export{!isPro && <sup className="ml-1 text-[8px] font-bold">PRO</sup>}</span>
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && (
              <div className="border-t" style={{ borderColor: borderCol }}>
                {['OBJ', 'FBX', 'STL', 'GLB', '3MF'].map((format) => (
                  <button
                    key={format}
                    className="block w-full h-8 px-2.5 text-left text-[13px] font-medium active:scale-95"
                    style={{ color: uiColor }}
                    onClick={() => { onExport?.(format.toLowerCase()); closeAll(); }}
                  >
                    {format}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      case 'importLibrary':
        return (
          <div className="w-52 max-w-[68vw] pb-1">
            {libraryModels.length === 0 ? (
              <p className="px-3 py-4 text-[12px] leading-snug" style={{ color: `${uiColor}99` }}>
                No other saved models yet. Models are saved to the Library on their own as you work.
              </p>
            ) : libraryModels.map((item) => (
              <button
                key={item.id}
                onClick={() => { onImportFromLibrary?.(item.id); closeAll(); }}
                className="w-full h-12 flex items-center gap-2.5 pl-2.5 pr-2 active:scale-95 transition-transform"
                style={{ color: uiColor }}
              >
                <span className="w-8 h-8 shrink-0 rounded-md overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  {item.thumbnail
                    ? <img src={item.thumbnail} alt="" draggable={false} className="w-full h-full object-cover" />
                    : <Box className="w-4 h-4 opacity-70" strokeWidth={1.8} />}
                </span>
                <span className="flex-1 min-w-0 truncate text-left text-[13px] font-medium">{item.name || 'Untitled'}</span>
              </button>
            ))}
          </div>
        );
      case 'viewport':
        return (
          <div>
            <ViewportPanel
              gridEnabled={display.gridVisible}
              dimensionsEnabled={display.measurementsOn}
              onGrid={(event) => toggleViewportCascade('grid', event)}
              onToggleDimensions={display.onToggleMeasure}
              onColors={() => push('colors')}
            />
          </div>
        );
      case 'grid':
        return <GridCascade bare enabled={display.gridVisible} onToggle={display.onToggleGrid} panelStyle={panelStyle} />;
      case 'snap':
        return <SnapCascade />;
      case 'settings':
        return <div className="w-fit max-w-[62vw] px-2 pt-2 pb-1"><SettingsPanel onGestures={() => push('gestures')} onSnapping={() => push('snap')} /></div>;
      case 'gestures':
        return <div className="w-48 max-w-[62vw] p-2"><GesturePanel /></div>;
      case 'account':
        return <div className="w-52 max-w-[68vw] p-2"><AccountPanel /></div>;
      case 'colors':
        return (
          <div className="px-2 py-1">
            <DrawerRow icon={Monitor} label="Background" color={uiColor} onClick={() => push('background')} chevron />
            <div className="h-px mx-2" style={{ background: borderCol }} />
            <DrawerRow icon={Grid2X2} label="Grid" color={uiColor} onClick={() => push('gridColor')} chevron />
            <div className="h-px mx-2" style={{ background: borderCol }} />
            <DrawerRow icon={Highlighter} label="Highlight" color={uiColor} onClick={() => push('highlight')} chevron />
          </div>
        );
      case 'contact':
        return (
          <div className="w-52 max-w-[68vw] p-2">
            <p className="text-[13px] leading-snug" style={{ color: uiColor }}>
              Have questions? Share your honest feedback to help shape future AXIS 3D updates.
            </p>
            <a
              href="mailto:axis3dworks1@gmail.com"
              className="inline-block mt-1.5 text-[13px] font-medium underline underline-offset-2 break-all"
              style={{ color: highlightColor, userSelect: 'text', WebkitUserSelect: 'text' }}
            >
              axis3dworks1@gmail.com
            </a>
          </div>
        );
      case 'background':
      case 'highlight':
      case 'gridColor':
        return (
          <div className="p-2">
            <MenuColorPicker
              value={colorFor(screen)}
              onChange={(v) => setColor(screen, v)}
              defaultColor={defaultFor(screen)}
              highlightColor={highlightColor}
              panelStyle={panelStyle}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 z-40" onPointerDown={closeAll}>
      <div
        className="absolute top-[calc(max(env(safe-area-inset-top,0px),1.75rem)+2.75rem)] left-2 pointer-events-none max-h-[calc(100vh-6.75rem)]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Every screen renders in this one panel, anchored in the same spot,
            so a sub-menu replaces the menu it came from instead of stacking
            sideways off the screen. */}
        <div ref={cascadeLayoutRef} className="relative flex items-start gap-1">
          <div
            className="relative w-fit rounded-lg border flex flex-col pointer-events-auto max-h-[calc(100vh-6.75rem)] overflow-y-auto axis-menu-scroll"
            style={panelStyle}
          >
            {screen !== 'root' && (
              <MenuScreenHeader
                title={TITLES[screen]}
                onBack={back}
                color={uiColor}
                highlightColor={highlightColor}
                borderColor={borderCol}
              />
            )}
            <div className={screen === 'account' ? undefined : 'py-1 [&_button]:min-h-8'}>{renderBody()}</div>
          </div>

          {screen === 'viewport' && viewportCascade === 'grid' && (
            <div
              className="absolute z-10 rounded-lg border pointer-events-auto"
              style={{ ...panelStyle, top: gridAnchor.top, left: 'calc(100% + 0.25rem)', width: gridAnchor.width }}
            >
              <GridCascade bare enabled={display.gridVisible} onToggle={display.onToggleGrid} panelStyle={panelStyle} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}