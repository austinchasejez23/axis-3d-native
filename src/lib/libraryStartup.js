import { syncCloudBackupsToLocal } from '@/lib/cloudBackup';

let startupPromise = null;
let startupKey = null;
let readyKey = null;

const keyFor = (user, isPro) => {
  if (!user || !isPro) return null;
  return String(user.id || user.email || user.username || 'signed-in-pro');
};

export function isLibraryStartupReady(user, isPro) {
  const key = keyFor(user, isPro);
  return key === null || readyKey === key;
}

export function prepareLibraryStartup(user, isPro) {
  const key = keyFor(user, isPro);
  if (key === null) return Promise.resolve(true);
  if (readyKey === key) return Promise.resolve(true);
  if (startupPromise && startupKey === key) return startupPromise;

  startupKey = key;
  startupPromise = syncCloudBackupsToLocal()
    .then(() => {
      readyKey = key;
      startupPromise = null;
      startupKey = null;
      return true;
    })
    .catch((error) => {
      if (startupKey === key) {
        startupPromise = null;
        startupKey = null;
      }
      throw error;
    });

  return startupPromise;
}
