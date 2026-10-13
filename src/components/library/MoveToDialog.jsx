import { Folder, Home } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export default function MoveToDialog({ folders, currentFolder, count, busy, onMove, onClose }) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="axis-library w-[calc(100%-2rem)] max-w-sm rounded-xl bg-card p-5 text-foreground">
      <DialogTitle>Move to</DialogTitle><DialogDescription>Choose a destination for {count === 1 ? 'this model' : `${count} models`}.</DialogDescription>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {currentFolder && <button type="button" disabled={busy} onClick={() => onMove(null)} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border px-3 text-left"><Home className="h-5 w-5 shrink-0" />My Models</button>}
        {!folders.length && <p className="py-3 text-sm text-muted-foreground">No folders yet. Create one with New folder.</p>}
        {folders.map(folder => <button type="button" key={folder.id} disabled={busy || folder.id === currentFolder} onClick={() => onMove(folder.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left disabled:opacity-40"><Folder className="h-5 w-5 shrink-0" /><span className="min-w-0 break-words">{folder.name}</span>{folder.id === currentFolder && <span className="ml-auto text-xs">Current</span>}</button>)}
      </div>
      <button type="button" disabled={busy} onClick={onClose} className="justify-self-end rounded-lg border border-border px-4 py-2">Cancel</button>
    </DialogContent>
  </Dialog>;
}