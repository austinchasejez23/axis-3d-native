import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordResetCode, resetPasswordWithCode } from '@/lib/supabaseTest';

const field = 'mt-1 h-11 w-full rounded-lg border border-white/20 bg-black px-3 text-white';
export default function PasswordRecovery() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function sendCode(e) {
    e.preventDefault();
    setPending(true); setError(''); setMessage('');
    try {
      await requestPasswordResetCode(email);
      setSent(true);
      setMessage('If this account exists, Supabase has sent a recovery email. Enter its six-digit code.');
    } catch (err) { setError(err.message || 'Could not request a reset code.'); }
    finally { setPending(false); }
  }

  async function finish(e) {
    e.preventDefault();
    setPending(true); setError('');
    try {
      await resetPasswordWithCode(email, code, password);
      navigate('/cloud', { replace: true, state: { passwordReset: true } });
    } catch (err) { setError(err.message || 'Password reset failed.'); }
    finally { setPending(false); }
  }

  return <main className="min-h-screen bg-zinc-950 px-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] text-white">
    <div className="mx-auto max-w-lg space-y-5">
      <Link className="inline-block rounded-lg border border-white/20 px-4 py-2 text-sm" to="/cloud">Back to Cloud</Link>
      <h1 className="text-xl font-semibold">Reset test account password</h1>
      <p className="text-sm text-white/70">Reset by entering a code inside Axis. This does not change your original production Axis account.</p>
      <p className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-white/70">The Supabase Reset Password email template must include a six-digit code (<code>{'{{ .Token }}'}</code>) for this flow. If it still sends only a link, that template needs configuring before testing.</p>
      {error && <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-100">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-white/20 p-3 text-sm">{message}</p>}
      <form className="space-y-3" onSubmit={sendCode}>
        <label className="block text-sm">Account email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className={field} /></label>
        <button type="submit" disabled={pending} className="h-11 w-full rounded-lg border border-white/20 bg-white/10 disabled:opacity-50">{pending ? 'Please wait...' : sent ? 'Resend recovery code' : 'Send recovery code'}</button>
      </form>
      {sent && <form className="space-y-3 border-t border-white/15 pt-4" onSubmit={finish}>
        <label className="block text-sm">Six-digit email code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} className={field} autoComplete="one-time-code" /></label>
        <label className="block text-sm">New password
          <span className="mt-1 flex rounded-lg border border-white/20 bg-black">
            <input required type={showPassword ? 'text':'password'} minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent px-3 text-white outline-none" />
            <button type="button" className="px-3 text-xs text-white/70" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Hide':'Show'}</button>
          </span>
        </label>
        <button type="submit" disabled={pending} className="h-11 w-full rounded-lg border border-white/20 bg-white/10 disabled:opacity-50">{pending ? 'Please wait...' : 'Change password'}</button>
      </form>}
    </div>
  </main>;
}
