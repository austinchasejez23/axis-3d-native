import LogoLoader from '@/components/LogoLoader';

// Shown while a saved model is being opened, so a long load does not look
// like a crash.
export default function ModelLoading() {
  return (
    <div role="status" aria-label="Loading model" className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
      <LogoLoader />
    </div>
  );
}
