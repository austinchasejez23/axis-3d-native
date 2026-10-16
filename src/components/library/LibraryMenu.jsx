import { Copy, Trash2, Lock, Unlock, FolderInput, MoreVertical } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function LibraryMenu({ open, onOpenChange, count, locked, allLocked, busy, onCopy, onDelete, onLock, onMove }) {
  const actions = [
    { label: 'Copy', Icon: Copy, run: onCopy },
    { label: 'Delete', Icon: Trash2, run: onDelete, blocked: locked },
    { label: allLocked ? 'Unlock' : 'Lock', Icon: allLocked ? Unlock : Lock, run: onLock },
    { label: 'Move to', Icon: FolderInput, run: onMove, blocked: locked },
  ];
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild><button type="button" aria-label="Library menu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-foreground"><MoreVertical className="h-5 w-5" /></button></PopoverTrigger>
    <PopoverContent align="end" className="axis-library w-48 border-border bg-card p-2 text-foreground">
      <p className="px-2 pb-2 text-xs text-muted-foreground">{count ? `${count} selected` : 'Touch and hold to select'}</p>
      {actions.map(({ label, Icon, run, blocked }) => <button key={label} type="button" disabled={!count || busy || blocked} onClick={() => { onOpenChange(false); run(); }} className="flex min-h-10 w-full items-center gap-3 rounded-md px-2 text-sm hover:bg-muted disabled:opacity-35"><Icon className="h-4 w-4" />{label}</button>)}
      {locked && <p className="px-2 py-1 text-xs text-muted-foreground">Unlock to delete or move.</p>}
      <p className="mt-2 border-t border-border px-2 pt-2 text-xs text-muted-foreground">Local projects · accounts disabled</p>
    </PopoverContent>
  </Popover>;
}