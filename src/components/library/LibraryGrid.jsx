import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProjectCard from '@/components/library/ProjectCard';
import FolderTiles from '@/components/library/FolderTiles';
export default function LibraryGrid({ folderId, folders, projects, actions, highlightColor, onCreate, onNewFolder, onFolder, onOpen }) {
  return <div className="relative z-10 grid grid-cols-3 items-start gap-3 p-4">
    {!folderId && <>
      <Link to="/modeler" id="create-new-model" data-testid="create-new-model" aria-label="Create new model" role="button" onClick={event => { event.preventDefault(); onCreate(); }} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border active:scale-95" style={{ backgroundColor: `${highlightColor}22`, borderColor: `${highlightColor}55`, color: highlightColor }}><Plus className="h-7 w-7" /><span className="text-xs font-semibold">Create new</span></Link>
      <FolderTiles folders={folders} onCreate={onNewFolder} onOpen={onFolder} />
    </>}
    {projects.map(project => <ProjectCard key={project.id} project={project} onOpen={onOpen} selecting={actions.selecting} selected={actions.ids.includes(project.id)} onHold={actions.hold} onToggle={actions.toggle} busy={actions.busy} onDuplicate={() => actions.copy([project])} onDelete={() => actions.requestDelete([project])} />)}
  </div>;
}