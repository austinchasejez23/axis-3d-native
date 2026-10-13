import { Copy, Trash2, Box, Check, Lock } from 'lucide-react';
import { Image } from '@/components/ui/image';
import useProjectHold from '@/hooks/use-project-hold';
import { useTheme } from '@/lib/theme';

export default function ProjectCard({ project, onOpen, onDuplicate, onDelete, selecting, selected, onHold, onToggle, busy }) {
  const hold = useProjectHold(() => onHold(project.id));
  const { highlightColor } = useTheme();
  return (
    <div data-project-id={project.id} className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-card" style={selected ? { borderColor: highlightColor, boxShadow: `0 0 0 1px ${highlightColor}` } : undefined}>
      <button {...hold} disabled={busy} onClick={() => selecting ? onToggle(project.id) : onOpen(project.id)} aria-label={`${selecting ? 'Select' : 'Open'} ${project.name}`} aria-pressed={selecting ? selected : undefined} className="flex aspect-square w-full touch-pan-y items-center justify-center overflow-hidden bg-muted active:scale-95" style={{ WebkitTouchCallout: 'none' }}>
        {project.thumbnail ? <Image src={project.thumbnail} alt={project.name} className="h-full w-full object-cover" draggable={false} /> : <Box className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />}
      </button>
      <div className="px-2 py-2"><span className="block truncate text-xs font-medium text-foreground" title={project.name}>{project.name}</span></div>
      {project.locked && <span aria-label="Locked" className="pointer-events-none absolute bottom-9 left-1.5 rounded-full bg-background p-1.5 text-foreground"><Lock className="h-3.5 w-3.5" /></span>}
      {selecting ? <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background" style={selected ? { color: highlightColor, borderColor: highlightColor } : undefined}>{selected && <Check className="h-4 w-4" />}</span> : (
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          <button disabled={busy} onClick={() => onDuplicate(project.id)} aria-label={`Duplicate ${project.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground active:scale-90"><Copy className="h-3.5 w-3.5" /></button>
          <button disabled={busy || project.locked} onClick={() => onDelete(project.id)} aria-label={`Delete ${project.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground active:scale-90 disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}