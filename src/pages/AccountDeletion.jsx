import { Link } from 'react-router-dom';

export default function AccountDeletion() {
  return (
    <main className="min-h-screen bg-[#080b10] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-2xl font-bold">Account deletion: test service</h1>
        <p className="text-slate-300">The separate Axis 3D Test build now supports optional test accounts. It does not affect any production Axis account.</p>
        <p className="text-slate-300">To request removal of a test account and its cloud backups, contact <a className="underline" href="mailto:axis3dworks1@gmail.com?subject=Axis%203D%20Test%20account%20deletion">axis3dworks1@gmail.com</a> from the email address used for the test account. Self-service deletion must be implemented before this backend goes live.</p>
        <p className="text-slate-300">Your local offline models are stored on your phone and are not erased by a cloud account deletion request.</p>
        <Link to="/library" className="inline-block rounded-lg border border-white/20 px-4 py-2 text-white">Back to My Models</Link>
      </div>
    </main>
  );
}
