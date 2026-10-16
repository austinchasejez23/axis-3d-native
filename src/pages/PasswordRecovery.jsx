import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordResetEmail, resetPasswordWithEmailLink } from '@/lib/supabaseTest';

const field = 'mt-1 h-11 w-full rounded-lg border border-white/20 bg-black px-3 text-white';

export default function PasswordRecovery() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [emailLink, setEmailLink] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function sendEmail(e) {
    e.preventDefault();
    setPending(true); setError(''); setMessage('');
    try {
      await requestPasswordResetEmail(email);
      setSent(true);
      setMessage('If that account exists, a password-reset link has been emailed to you.');
    } catch (err) { setError(err.message || 'Could not request a reset email.'); }
    finally { setPending(false); }
  }

  async function finish(e) {
    e.preventDefault();
    setPending(true); setError('');
    try {
      await resetPasswordWithEmailLink(email, emailLink, password);
      setEmailLink('');
      navigate('/cloud', { replace: true, state: { passwordReset: true } });
    } catch (err) { setError(err.message || 'Password reset failed. Request a fresh link if the old one has expired.'); }
    finally { setPending(false); }
  }

  return <main className="min-h-screen bg-zinc-950 px-4 pb-12 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] text-white">
    <div className="mx-auto max-w-lg space-y-5">
      <Link className="inline-block rounded-lg border border-white/20 px-4 py-2 text-sm" to="/cloud">Back to Cloud</Link>
      <h1 className="text-xl font-semibold">Reset test account password</h1>
      <p className="text-sm text-white/70">Use the password-reset link in your email. No email template or SMTP setup is required. Your production Axis account is not affected.</p>
      {error && <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-100">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-white/20 p-3 text-sm">{message}</p>}
      <form className="space-y-3" onSubmit={sendEmail}>
        <label className="block text-sm">Account email<input type="email" required autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setEmailLink(''); }} className={field} /></label>
        <button type="submit" disabled={pending} className="h-11 w-full rounded-lg border border-white/20 bg-white/10 disabled:opacity-50">{pending ? 'Please wait...' : sent ? 'Resend reset email' : 'Send reset email'}</button>
      </form>
      {sent && <form className="space-y-3 border-t border-white/15 pt-4" onSubmit={finish}>
        <p className="text-sm text-white/70">In your email, <strong>press and hold</strong> the reset-password link, select <strong>Copy link address</strong>, then paste it here. Do not open the link first, because opening it uses up the one-time token.</p>
        <label className="block text-sm">Paste reset link from email
          <textarea required spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={3} value={emailLink} onChange={e => setEmailLink(e.target.value)} placeholder="https://...supabase.co/auth/v1/verify?..." className="mt-1 w-full resize-y rounded-lg border border-white/20 bg-black px-3 py-2 text-white" />
        </label>
        <label className="block text-sm">New password
          <span className="mt-1 flex rounded-lg border border-white/20 bg-black">
            <input required type={showPassword ? 'text' : 'password'} minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent px-3 text-white outline-none" />
            <button type="button" className="px-3 text-xs text-white/70" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        <button type="submit" disabled={pending} className="h-11 w-full rounded-lg border border-white/20 bg-white/10 disabled:opacity-50">{pending ? 'Please wait...' : 'Change password'}</button>
      </form>}
    </div>
  </main>;
}
