import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
export default function DeleteProjectsDialog({ projects, busy, onConfirm, onClose }) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="axis-library w-[calc(100%-2rem)] max-w-sm rounded-xl bg-card p-5 text-foreground">
      <DialogTitle>Delete {projects.length === 1 ? 'model' : `${projects.length} models`}?</DialogTitle>
      <DialogDescription>{projects.length === 1 ? `“${projects[0].name}”` : 'The selected models'} will be permanently deleted. This can’t be undone.</DialogDescription>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-border px-4 py-2">Cancel</button><button type="button" disabled={busy} onClick={onConfirm} className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground disabled:opacity-40"><Trash2 className="h-4 w-4" />{busy ? 'Deleting…' : 'Delete'}</button></div>
    </DialogContent>
  </Dialog>;
}