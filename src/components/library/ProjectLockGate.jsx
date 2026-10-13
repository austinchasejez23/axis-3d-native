import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { listProjects } from '@/lib/storage';
export default function ProjectLockGate({ children }) {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get('id');
  const [, refresh] = useState(0);
  const locked = listProjects().some(project => project.id === id && project.locked);
  useEffect(() => {
    const changed = () => refresh(value => value + 1);
    window.addEventListener('axis:projects-changed', changed);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('axis:projects-changed', changed); window.removeEventListener('storage', changed); };
  }, []);
  useEffect(() => { if (locked) toast.info('Unlock this model in the Library before editing.'); }, [locked]);
  return locked ? <Navigate to="/library" replace /> : children;
}