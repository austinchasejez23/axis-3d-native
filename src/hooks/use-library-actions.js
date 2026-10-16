import { useState } from 'react';
import { toast } from 'sonner';
import { listProjects, deleteProject, duplicateProject, assertProjectsUnlocked, setProjectsLocked, moveProjects } from '@/lib/storage';
import { FREE_PROJECT_LIMIT } from '@/lib/proAccess';
export default function useLibraryActions({ projects, isPro, openUpgrade, refresh }) {
  const [ids, setIds] = useState([]), [selecting, setSelecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false), [dialog, setDialog] = useState(null), [busy, setBusy] = useState(false);
  const selected = projects.filter(project => ids.includes(project.id));
  const clear = () => { setIds([]); setSelecting(false); setMenuOpen(false); };
  const hold = id => { setSelecting(true); setIds(current => current.includes(id) ? current : [...current, id]); };
  const toggle = id => setIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const run = async action => {
    if (busy) return;
    setBusy(true);
    try { await action(); refresh(); } catch (error) { toast.error(error.message || 'Could not complete this action.'); }
    finally { setBusy(false); }
  };
  const copy = (targets = selected) => run(async () => {
    if (!targets.length) return;
    if (!isPro && listProjects().length + targets.length > FREE_PROJECT_LIMIT) { openUpgrade(`Free accounts can keep up to ${FREE_PROJECT_LIMIT} projects.`); return; }
    for (const project of targets) await duplicateProject(project.id);
    clear(); toast.success(targets.length === 1 ? 'Model copied' : 'Models copied');
  });
  const requestDelete = (targets = selected) => {
    if (!targets.length) return;
    if (targets.some(project => project.locked)) { toast.info('Unlock the selected models first.'); return; }
    setDialog({ type: 'delete', projects: targets });
  };
  const remove = () => run(async () => {
    assertProjectsUnlocked(dialog.projects.map(project => project.id));
    for (const project of dialog.projects) {
      await deleteProject(project.id);
    }
    setDialog(null); clear(); toast.success('Selected models deleted');
  });
  const lock = () => run(() => {
    if (!selected.length) return;
    const locked = !selected.every(project => project.locked);
    setProjectsLocked(selected.map(project => project.id), locked);
    toast.success(locked ? 'Selected models locked' : 'Selected models unlocked');
  });
  const move = folderId => run(() => {
    moveProjects(selected.map(project => project.id), folderId);
    setDialog(null); clear(); toast.success('Selected models moved');
  });
  return { ids, selected, selecting, hold, toggle, clear, menuOpen, setMenuOpen, dialog, setDialog, busy, copy, requestDelete, remove, lock, move };
}