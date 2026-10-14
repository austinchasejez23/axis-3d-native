import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';
import usePullToRefresh from '@/hooks/use-pull-to-refresh';
import { toast } from 'sonner';
import { listProjects } from '@/lib/storage';
import { listFolders } from '@/lib/libraryFolders';
import useLibraryActions from '@/hooks/use-library-actions';
import { useTheme } from '@/lib/theme';
import { Image } from '@/components/ui/image';
import LibraryGrid from '@/components/library/LibraryGrid';
import LibraryMenu from '@/components/library/LibraryMenu';
import NewFolderDialog from '@/components/library/NewFolderDialog';
import MoveToDialog from '@/components/library/MoveToDialog';
import DeleteProjectsDialog from '@/components/library/DeleteProjectsDialog';
import { useAuth } from '@/lib/AuthContext';
import { syncCloudBackupsToLocal } from '@/lib/cloudBackup';
import { prepareLibraryStartup, isLibraryStartupReady } from '@/lib/libraryStartup';
import { useProAccess } from '@/lib/ProAccessContext';
import { FREE_PROJECT_LIMIT } from '@/lib/proAccess';


const LOGO_URL = '/media/92bec63fb_file_00000000a990820d8515bede88972084.png';

export default function Library() {
  const navigate = useNavigate();
  const { highlightColor } = useTheme();
  const [projects, setProjects] = useState(() => listProjects());
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState(listFolders);
  const [folderId, setFolderId] = useState(null);
  const activeFolder = folders.find(folder => folder.id === folderId);
  // Guests are first-class here, so the name comes from the auth state the app
  // already loaded — no /User/me request, which 401s when nobody is signed in.
  const { user } = useAuth();
  const { isPro, openUpgrade } = useProAccess();
  const username = user?.username || null;
  const [cloudReady, setCloudReady] = useState(() => isLibraryStartupReady(user, isPro));

  const refreshLocal = useCallback(() => { setProjects(listProjects()); setFolders(listFolders()); }, []);
  const actions = useLibraryActions({ projects, user, isPro, openUpgrade, refresh: refreshLocal });
  const openFolder = id => { setFolderId(id); setQuery(''); actions.clear(); };
  const refresh = useCallback(async () => {
    refreshLocal();
    if (user && isPro) {
      await syncCloudBackupsToLocal();
      refreshLocal();
    }
  }, [user, isPro, refreshLocal]);
  useEffect(() => {
    refreshLocal();
    window.addEventListener('axis:projects-changed', refreshLocal);
    return () => window.removeEventListener('axis:projects-changed', refreshLocal);
  }, [refreshLocal]);
  useEffect(() => {
    if (!user || !isPro) { setCloudReady(true); return; }
    if (isLibraryStartupReady(user, isPro)) {
      refreshLocal();
      setCloudReady(true);
      return;
    }
    setCloudReady(false);
    prepareLibraryStartup(user, isPro)
      .then(refreshLocal)
      .catch(() => toast.error('Cloud backup could not be loaded'))
      .finally(() => setCloudReady(true));
  }, [user, isPro, refreshLocal]);

  const scrollRef = useRef(null);
  const { pull, refreshing } = usePullToRefresh(scrollRef, refresh);

  const filtered = useMemo(() => (
    projects
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .filter((p) => (p.folderId || null) === folderId && p.name.toLowerCase().includes(query.toLowerCase()))
  ), [projects, query, folderId]);

  const handleOpen = id => {
    if (listProjects().find(project => project.id === id)?.locked) { toast.info('Unlock this model in the Library before editing.'); return; }
    navigate(`/modeler?id=${id}`);
  };
  const createModel = () => {
    if (!isPro && projects.length >= FREE_PROJECT_LIMIT) openUpgrade(`Free accounts can keep up to ${FREE_PROJECT_LIMIT} projects.`);
    else navigate('/modeler');
  };

  return (
    <div ref={scrollRef} className="axis-library fixed inset-0 overflow-y-auto bg-background text-foreground">
      <div
        className="absolute top-0 left-0 right-0 z-20 flex justify-center pointer-events-none overflow-hidden"
        style={{ height: pull, opacity: pull > 0 ? 1 : 0 }}
      >
        <Loader2
          className={`w-6 h-6 mt-2 ${refreshing ? 'animate-spin' : ''}`}
          style={{ color: highlightColor, transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }}
        />
      </div>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-25">
        <Image src={LOGO_URL} alt="Axis 3D" className="w-full h-full" fittingType="fit" />
      </div>
      <div className="sticky top-0 z-30 bg-zinc-950 px-4 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-3 border-b border-white/10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-xl font-bold text-white">{username ? `${username}'s Models` : 'My Models'}</h1>
          <LibraryMenu open={actions.menuOpen} onOpenChange={actions.setMenuOpen} count={actions.selected.length} locked={actions.selected.some(project => project.locked)} allLocked={actions.selected.length > 0 && actions.selected.every(project => project.locked)} busy={actions.busy} onCopy={() => actions.copy()} onDelete={() => actions.requestDelete()} onLock={actions.lock} onMove={() => actions.setDialog({ type: 'move' })} />
        </div>
        {activeFolder && <div className="mb-3 flex min-w-0 items-center gap-2"><button type="button" onClick={() => openFolder(null)} aria-label="Back to My Models" className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2"><ArrowLeft className="h-4 w-4" />My Models</button><span className="truncate text-sm">{activeFolder.name}</span></div>}
        {actions.selecting && <div className="mb-3 flex items-center gap-2" role="status"><span>{actions.selected.length} selected</span></div>}
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search models"
            className="min-w-0 bg-transparent text-white text-sm outline-none flex-1 placeholder:text-white/40"
          />
        </div>
      </div>

      {cloudReady ? (
        <LibraryGrid folderId={folderId} folders={folders} projects={filtered} actions={actions} highlightColor={highlightColor} onCreate={createModel} onNewFolder={() => { actions.setMenuOpen(false); actions.setDialog({ type: 'new-folder' }); }} onFolder={openFolder} onOpen={handleOpen} />
      ) : (
        <div className="relative z-10 flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        </div>
      )}

      {cloudReady && filtered.length === 0 && <p className="relative z-10 px-4 text-center text-sm text-muted-foreground">{query ? 'No models match your search' : folderId ? 'This folder is empty. Select models in My Models and use Move to.' : projects.length === 0 ? 'No saved models yet — tap Create new to start' : 'Open a folder to see your models.'}</p>}

      {actions.dialog?.type === 'new-folder' && <NewFolderDialog onClose={() => actions.setDialog(null)} />}
      {actions.dialog?.type === 'move' && <MoveToDialog folders={folders} currentFolder={folderId} count={actions.selected.length} busy={actions.busy} onMove={actions.move} onClose={() => actions.setDialog(null)} />}
      {actions.dialog?.type === 'delete' && <DeleteProjectsDialog projects={actions.dialog.projects} busy={actions.busy} onConfirm={actions.remove} onClose={() => actions.setDialog(null)} />}
    </div>
  );
}