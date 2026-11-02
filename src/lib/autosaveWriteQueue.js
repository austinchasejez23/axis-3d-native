// Serialize local project writes so an older save cannot finish after a newer
// one and overwrite it. Coalesce queued saves to the most recent scene.
export function createAutosaveWriteQueue(write, onSaved, onError) {
  let active = null;
  let queued = null;

  const start = (job) => {
    active = job;
    Promise.resolve()
      .then(() => write(job.project))
      .then(() => onSaved(job))
      .catch((error) => onError(error, job))
      .finally(() => {
        active = null;
        const next = queued;
        queued = null;
        if (next) start(next);
      });
  };

  return {
    schedule(job) {
      // One write of the current version is enough, even if a timer fires
      // while that write is still pending.
      if (queued?.id === job.id && queued.signature === job.signature) return;
      if (active && !queued && active.id === job.id && active.signature === job.signature) return;
      if (active) queued = job;
      else start(job);
    },
  };
}
