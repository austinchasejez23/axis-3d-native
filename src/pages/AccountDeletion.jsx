import { Link } from 'react-router-dom';

export default function AccountDeletion() {
  return (
    <main className="min-h-screen bg-[#080b10] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-3xl font-bold">Account management unavailable</h1>
        <p className="text-slate-300">This standalone test build has no accounts or server connection. It cannot delete or modify accounts in the separate production AXIS 3D service.</p>
        <p className="text-slate-300">For an existing production account, use the production application's account deletion process or contact support at axis3dworks1@gmail.com.</p>
        <Link to="/library" className="inline-block rounded-lg border border-white/20 px-4 py-2 text-white">Back to My Models</Link>
      </div>
    </main>
  );
}
