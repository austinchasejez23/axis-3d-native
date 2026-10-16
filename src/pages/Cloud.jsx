import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cloud, CloudDownload, CloudUpload, Loader2, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { listProjects } from '@/lib/storage';
import { FREE_PROJECT_LIMIT } from '@/lib/proAccess';
import { getCloudSession, signInWithEmail, signUpWithEmail, signOutOfCloud } from '@/lib/supabaseTest';
import { listCloudBackups, backupLocalProject, restoreCloudBackup, deleteCloudBackup } from '@/lib/cloudSync';

export default function CloudBackups() {
  const [session, setSession] = useState(() => getCloudSession());
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState([]);
  const [local, setLocal] = useState(() => listProjects());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLocal(listProjects());
    if (getCloudSession()) setRemote(await listCloudBackups());
    else setRemote([]);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    listCloudBackups().then(data => { if (active) setRemote(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [session]);

  async function doWork(action, success) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await action();
      if (success) toast.success(typeof success === 'function' ? success(value) : success);
      await refresh();
    } catch (err) {
      setError(err.message || 'Cloud request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCredentials(event) {
    event.preventDefault();
    if (mode === 'register' && password.length < 8) { setError('Use at least 8 characters for a new password.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') {
        const result = await signUpWithEmail(email, password);
        if (!result.session) {
          setMessage('Check your email for a confirmation link, then come back and sign in.');
          setMode('sign-in');
        } else {
          setSession(result.session);
          setPassword('');
        }
      } else {
        const next = await signInWithEmail(email, password);
        setSession(next);
        setPassword('');
      }
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await signOutOfCloud();
      setSession(null);
      setRemote([]);
      setPassword('');
      setMessage('Signed out of cloud backups. Local projects were not changed.');
    } finally { setBusy(false); }
  }

  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white disabled:opacity-40';
  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-12 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] text-white">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <Link to="/library" className={buttonClass}><ArrowLeft className="h-4 w-4" /> Library</Link>
          <span className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">TEST BACKEND</span>
        </div>
        <div className="flex items-center gap-3">
          <Cloud className="h-7 w-7 text-white/75" />
          <div><h1 className="text-xl font-semibold">Cloud backups</h1><p className="text-sm text-white/55">Optional, private, and separate from local saves.</p></div>
        </div>
        <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/75">
          Axis works offline without signing in. Backups happen only when you tap Backup. Restoring always creates a new local model; it never overwrites an existing one.
        </p>

        {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-900/30 p-3 text-sm text-red-100">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-white/20 p-3 text-sm">{message}</p>}

        {!session ? (
          <form className="space-y-3 rounded-xl border border-white/15 bg-zinc-900 p-4" onSubmit={submitCredentials}>
            <h2 className="font-semibold">{mode === 'register' ? 'Create test account' : 'Sign in to Axis cloud'}</h2>
            <label className="block text-sm">Email
              <input className="mt-1 h-11 w-full rounded-lg border border-white/20 bg-black px-3 text-white" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm">Password
              <span className="mt-1 flex overflow-hidden rounded-lg border border-white/20 bg-black">
                <input className="h-11 min-w-0 flex-1 bg-transparent px-3 text-white outline-none" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="px-3 text-xs text-white/80" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
              </span>
            </label>
            <button className={buttonClass + ' w-full bg-white/10'} disabled={busy} type="submit">{busy ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
            <button type="button" className="text-sm text-white/70 underline" onClick={() => { setMode(mode === 'register' ? 'sign-in' : 'register'); setError(''); }}>{mode === 'register' ? 'Already have an account? Sign in' : 'Create a test account instead'}</button>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/15 p-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{session.user.email}</p><p className="text-xs text-white/60">Signed in for cloud backups only</p></div>
              <button className={buttonClass} type="button" onClick={signOut} disabled={busy}><LogOut className="h-4 w-4" /> Sign out</button>
            </div>
            <section className="space-y-2">
              <h2 className="font-semibold">Models on this device</h2>
              {local.length === 0 && <p className="text-sm text-white/60">No local models to back up yet.</p>}
              {local.map(project => (
                <div key={project.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <span className="min-w-0 truncate text-sm">{project.name}</span>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => doWork(() => backupLocalProject(project.id), 'Backup uploaded')}><CloudUpload className="h-4 w-4" /> Backup</button>
                </div>
              ))}
            </section>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Your cloud backups</h2>
                <button type="button" className={buttonClass} disabled={busy} onClick={() => doWork(refresh)} aria-label="Refresh cloud backups">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
              </div>
              {remote.length === 0 && <p className="text-sm text-white/60">No cloud backups yet.</p>}
              {remote.map(record => (
                <div key={record.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{record.name}</span>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => doWork(() => restoreCloudBackup(record, FREE_PROJECT_LIMIT), 'Restored as a new local model')}><CloudDownload className="h-4 w-4" /> Restore</button>
                  <button type="button" className={buttonClass} disabled={busy} aria-label={'Delete backup ' + record.name} onClick={() => {
                    if (window.confirm('Delete cloud backup "' + record.name + '"? Your local model will remain.')) doWork(() => deleteCloudBackup(record), 'Cloud backup deleted');
                  }}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </section>
            <Link className="inline-block text-xs text-white/50 underline" to="/account-deletion">Account deletion information</Link>
          </>
        )}
      </div>
    </main>
  );
}
