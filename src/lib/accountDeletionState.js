// Stop this tab's autosave/cloud work, and finish in-flight writes before
// deletion begins. Keep writes stopped through logout's page-unload callbacks.
let deleting = false;
const writes = new Set();
export const isAccountDeletionActive = () => deleting;
export function trackAccountWrite(action) {
  if (deleting) return Promise.resolve(false);
  const task = Promise.resolve().then(action);
  writes.add(task);
  task.then(() => writes.delete(task), () => writes.delete(task));
  return task;
}
export async function pauseAccountWrites() {
  if (deleting) throw new Error('Account deletion is already running.');
  deleting = true;
  await Promise.allSettled([...writes]);
}
export function resumeAccountWrites() { deleting = false; }