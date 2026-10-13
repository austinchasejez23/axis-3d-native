import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { createFolder } from '@/lib/libraryFolders';
export default function NewFolderDialog({ onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const create = event => {
    event.preventDefault();
    try { createFolder(name); onClose(); } catch (err) { setError(err.message); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="axis-library w-[calc(100%-2rem)] max-w-sm rounded-xl bg-card p-5 text-foreground">
      <DialogTitle>Folder name</DialogTitle><DialogDescription>Name your new project folder.</DialogDescription>
      <form onSubmit={create} className="space-y-4">
        <input aria-label="Folder name" autoFocus value={name} maxLength={80} onChange={event => { setName(event.target.value); setError(''); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-ring" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2">Cancel</button><button type="submit" disabled={!name.trim()} className="rounded-lg border border-border bg-muted px-4 py-2 disabled:opacity-40">Create</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}