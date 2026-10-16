import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getCloudSession, deleteCloudAccount } from '@/lib/supabaseTest';

export default function AccountDeletion() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signedIn = getCloudSession();

  async function remove(event) {
    event.preventDefault();
    if (!signedIn || confirmation !== 'DELETE') return;
    if (!window.confirm('Permanently delete this TEST account and all its cloud backups? The action cannot be undone. Local models will remain on this phone.')) return;
    setBusy(true); setError('');
    try {
      await deleteCloudAccount(currentPassword, confirmation);
      toast.success('Your test account was deleted. Offline models were preserved.');
      navigate('/library', { replace: true });
    } catch (err) { setError(err.message || 'Account deletion failed. Your account may still exist.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-zinc-950 px-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] text-white">
    <div className="mx-auto max-w-lg space-y-4">
      <Link to="/cloud" className="inline-block rounded-lg border border-white/20 px-4 py-2 text-sm">Back to Cloud</Link>
      <h1 className="text-xl font-semibold">Delete test cloud account</h1>
      <p className="rounded-lg border border-red-400/35 bg-red-950/20 p-3 text-sm text-red-100">This permanently removes the signed-in TEST account, online backups, and any test entitlements. It does NOT delete offline models on this device or change your production Axis account.</p>
      {!signedIn
        ? <p className="text-sm text-white/70">Sign in under Cloud before deleting a test account.</p>
        : <form onSubmit={remove} className="space-y-4">
          <p className="text-sm text-white/70">Account: {signedIn.user.email}</p>
          <label className="block text-sm">Current password
            <span className="mt-1 flex overflow-hidden rounded-lg border border-white/20 bg-black">
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required className="h-11 min-w-0 flex-1 bg-transparent px-3 text-white outline-none" />
              <button type="button" onClick={()=>setShowPassword(v=>!v)} className="px-3 text-xs">{showPassword?'Hide':'Show'}</button>
            </span>
          </label>
          <label className="block text-sm">Type DELETE to confirm
            <input className="mt-1 h-11 w-full rounded-lg border border-white/20 bg-black px-3 text-white" type="text" autoCapitalize="characters" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required autoComplete="off" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-400/50 p-3 text-sm text-red-200">{error}</p>}
          <button type="submit" disabled={busy || !currentPassword || confirmation !== 'DELETE'} className="h-12 w-full rounded-lg border border-red-400/60 bg-red-950/30 font-medium text-red-100 disabled:opacity-40">{busy ? 'Verifying account...' : 'Permanently delete test account'}</button>
        </form>}
      <p className="text-xs text-white/50">Production account requests: axis3dworks1@gmail.com</p>
    </div>
  </main>;
}
