import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { saveProject, listProjects } from '@/lib/storage';
import { isAccountDeletionActive } from '@/lib/accountDeletionState';
import { theme } from '@/lib/theme';

// Every model is kept in the Library automatically: the current scene is saved
// under its project id (named "Untitled" until the user renames it) once a
// minute if it changed, and immediately when the page is closed, backgrounded
// or left — so nothing is lost between the slower ticks.
//
// Nothing about the model or the Library changes here; only the cost changed.
// Detecting a change no longer serializes the whole scene into a JSON string
// (a multi-hundred-millisecond freeze on a 100k-triangle model); it compares a
// cheap edit counter instead, and the actual save is skipped while a finger is
// down so it can never stutter a gesture.
const INTERVAL_MS = 60000;

export default function useAutoSave(managerRef, projectName, onSaved, { isPro = false, onProjectLimit } = {}) {
  const savedRef = useRef({ projectId: null, signature: null });
  const warnedRef = useRef(false);

  useEffect(() => {
    let pointerDown = false;
    let pending = false;

    const sceneSignature = (mgr) => [
      mgr.projectName,
      mgr.editVersion || 0,
      mgr.meshes.length,
      mgr.meshes.map((m) => `${m.id}:${m.vertices.length}:${m.faces.length}`).join(','),
      JSON.stringify(theme.getSceneSettings()),
    ].join('|');

    const persist = (force = false) => {
      if (isAccountDeletionActive()) return;
      const mgr = managerRef.current;
      if (!mgr || mgr.meshes.length === 0) return;
      mgr.projectName = projectName || 'Untitled';
      const signature = sceneSignature(mgr);

      // Opening or creating a project establishes its untouched baseline. It
      // does not create/update a Library entry until its scene actually changes.
      if (savedRef.current.projectId !== mgr.projectId) {
        savedRef.current = { projectId: mgr.projectId, signature };
        return;
      }
      if (signature === savedRef.current.signature) return;

      // Never build the save payload mid-gesture — do it the moment the finger
      // lifts instead.
      if (pointerDown && !force) { pending = true; return; }
      pending = false;

      const data = mgr.serialize();
      const exists = listProjects().some((project) => project.id === data.id);
      if (!isPro && !exists && listProjects().length >= 5) { onProjectLimit?.(); return; }
      savedRef.current.signature = signature;
      saveProject({ ...data, thumbnail: mgr.captureThumbnail() })
        .then(() => {
          warnedRef.current = false;
          onSaved?.(listProjects());
        })
        .catch((err) => {
          if (!warnedRef.current) {
            warnedRef.current = true;
            toast.error(err?.message || 'Could not auto-save this model.');
          }
        });
    };

    // Establish the initial baseline as soon as the viewport manager exists,
    // before the normal autosave interval begins.
    let baselineFrame;
    const establishBaseline = () => {
      if (managerRef.current?.meshes.length) persist();
      else baselineFrame = requestAnimationFrame(establishBaseline);
    };
    baselineFrame = requestAnimationFrame(establishBaseline);

    const interval = setInterval(() => persist(), INTERVAL_MS);
    const onDown = () => { pointerDown = true; };
    const onUp = () => { pointerDown = false; if (pending) persist(); };
    const onHide = () => {
      if (document.visibilityState === 'hidden') { persist(true); }
    };
    const onLeave = () => { persist(true); };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      cancelAnimationFrame(baselineFrame);
      clearInterval(interval);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      persist(true);
     
    };
  }, [managerRef, projectName, onSaved, isPro, onProjectLimit]);
}