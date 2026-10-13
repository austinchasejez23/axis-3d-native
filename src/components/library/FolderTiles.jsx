import { Folder, FolderPlus } from 'lucide-react';
export default function FolderTiles({ folders, onCreate, onOpen }) {
  return <>
    <button type="button" onClick={onCreate} aria-label="New folder" className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 text-foreground active:scale-95"><FolderPlus className="h-7 w-7" /><span className="text-xs font-semibold">New folder</span></button>
    {folders.map(folder => <button type="button" key={folder.id} onClick={() => onOpen(folder.id)} aria-label={`Open folder ${folder.name}`} className="flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-foreground active:scale-95"><Folder className="h-8 w-8" strokeWidth={1.5} /><span className="w-full truncate text-center text-xs font-semibold" title={folder.name}>{folder.name}</span></button>)}
  </>;
}