const KEY = 'axis.library.folders';
export function listFolders() {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
}
export function createFolder(name) {
  const folders = listFolders();
  const clean = name.trim();
  if (!clean) throw new Error('Enter a folder name.');
  if (folders.some(folder => folder.name.toLowerCase() === clean.toLowerCase())) throw new Error('A folder with this name already exists.');
  const folder = { id: `folder_${crypto.randomUUID()}`, name: clean };
  localStorage.setItem(KEY, JSON.stringify([...folders, folder]));
  window.dispatchEvent(new Event('axis:projects-changed'));
  return folder;
}