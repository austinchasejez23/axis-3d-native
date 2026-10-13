import { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      await base44.entities.ContactMessage.create(values);
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'conversion', {
          send_to: 'AW-18485410634/ra4JCPSPi4wdEMr2w-5E',
        });
      }
      setSent(true);
    } catch {
      setError('Your message could not be saved. Please try again.');
    } finally { setBusy(false); }
  }
  if (sent) return <p role="status" className="text-foreground">Thank you. Your message has been received.</p>;
  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">Name<input name="name" required maxLength={120} className="mt-2 block w-full rounded-lg border border-border bg-background p-3 text-foreground" /></label>
      <label className="block">Email<input name="email" type="email" required maxLength={254} className="mt-2 block w-full rounded-lg border border-border bg-background p-3 text-foreground" /></label>
      <label className="block">Message<textarea name="message" required maxLength={5000} rows={5} className="mt-2 block w-full rounded-lg border border-border bg-background p-3 text-foreground" /></label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <button disabled={busy} type="submit" className="rounded-lg border border-border bg-muted px-5 py-3 text-foreground disabled:opacity-50">{busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}