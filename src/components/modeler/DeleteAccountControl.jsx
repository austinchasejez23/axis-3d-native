import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { pauseAccountWrites, resumeAccountWrites } from '@/lib/accountDeletionState';
import { listProjects, removeAccountProjectCopies } from '@/lib/storage';
import AccountDeletionNotice from '@/components/modeler/AccountDeletionNotice';

export default function DeleteAccountControl({ user, onBusyChange }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manualGoogle, setManualGoogle] = useState(false);
  const [googleConfirmed, setGoogleConfirmed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const handleDelete = async () => {
    if (!user || busy) return;
    setBusy(true); onBusyChange(true); setError('');
    let deleted = false;
    try {
      await pauseAccountWrites();
      const { data } = await base44.functions.invoke('deleteAccount', { confirm: 'DELETE_MY_ACCOUNT', googleDisconnected: manualGoogle && googleConfirmed });
      if (!data.deleted) throw new Error('Account deletion was not completed.');
      deleted = true; setRemoved(true);
      // Account deletion promises to remove every local AXIS project
      // copy on this device, including projects that were never backed up.
      const localProjectIds = listProjects().map((project) => project.id);
      await removeAccountProjectCopies([...new Set([...(data.projectIds || []), ...localProjectIds])]);
      await base44.auth.logout('/');
    } catch (failure) {
      if (!deleted) resumeAccountWrites();
      if (failure.response?.data?.code === 'GOOGLE_DISCONNECT_REQUIRED') setManualGoogle(true);
      setError(deleted ? 'Your account was removed, but local cleanup or sign-out did not finish. Clear AXIS site data on this device.' : failure.response?.data?.error || failure.message || 'Deletion could not finish. Please retry or contact support.');
      setBusy(false); onBusyChange(false);
    }
  };
  if (removed) return <p role="alert" className="text-[12px]">{error || 'Account removed. Signing out…'}</p>;
  if (!confirming) return <button disabled={!user || busy} onClick={() => setConfirming(true)} className="w-full h-9 rounded-md text-[12px] font-medium text-destructive bg-destructive/10 disabled:opacity-60">Delete account</button>;
  return <div className="rounded-md p-2 space-y-3 bg-destructive/10" aria-busy={busy}>
    <AccountDeletionNotice manualGoogle={manualGoogle} googleConfirmed={googleConfirmed} onGoogleConfirmed={setGoogleConfirmed} />
    {error && <p role="alert" className="text-[12px]">{error}</p>}
    <div className="flex gap-1.5">
      <button disabled={busy || (manualGoogle && !googleConfirmed)} onClick={handleDelete} className="flex-1 h-8 rounded-md text-[12px] font-semibold bg-destructive text-destructive-foreground disabled:opacity-60">{busy ? 'Deleting…' : 'Delete'}</button>
      <button disabled={busy} onClick={() => { setConfirming(false); setError(''); }} className="flex-1 h-8 rounded-md text-[12px] disabled:opacity-60">Cancel</button>
    </div>
  </div>;
}