export default function AccountDeletionNotice({ manualGoogle, googleConfirmed, onGoogleConfirmed }) {
  return <div className="space-y-2 text-[12px] leading-relaxed">
    <p>This removes your AXIS account and cloud backup records, removes downloaded copies of those backups from this device, cancels linked Stripe subscriptions, and deletes linked Stripe customer profiles. This cannot be undone.</p>
    <p>Google access is revoked when available. Your Google account itself is not deleted. Stripe may retain payment, invoice, and legally required records.</p>
    <p>Cloud backup files stored separately from their records are not erased by this action. Contact AXIS support for file-erasure assistance; complete provider-held erasure is not guaranteed.</p>
    {manualGoogle && <div className="space-y-2">
      <p>Automatic Google disconnect is unavailable. If you connected Google, remove AXIS access in <a className="underline" href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google connections</a> first.</p>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={googleConfirmed} onChange={(event) => onGoogleConfirmed(event.target.checked)} /><span>I removed AXIS access, or never connected Google.</span></label>
    </div>}
  </div>;
}