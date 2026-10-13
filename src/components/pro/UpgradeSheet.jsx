import { useState } from 'react';
import { Crown, X } from 'lucide-react';

const PLANS = [
  { id: 'monthly', name: 'Monthly', price: '$4.99', detail: '7 days free · then monthly' },
  { id: 'annual', name: 'Annual', price: '$39.99', detail: '7 days free · then yearly' },
  { id: 'lifetime', name: 'Lifetime', price: '$69.99', detail: 'one time' },
];

export default function UpgradeSheet({ open, reason, signedIn, busy, onClose, onChoose, onSignIn }) {
  const [promoCode, setPromoCode] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/70" onClick={onClose}>
      <div className="w-full rounded-t-2xl border-t border-white/15 bg-zinc-950 p-4 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex gap-2.5"><Crown className="mt-0.5 h-5 w-5 text-amber-400" /><div><h2 className="text-lg font-bold text-white">AXIS 3D Pro</h2><p className="text-sm text-white/60">{reason || 'Unlock premium tools and unlimited modeling.'}</p></div></div>
          <button onClick={onClose} aria-label="Close upgrade" className="p-1 text-white/70"><X className="h-5 w-5" /></button>
        </div>
        {!signedIn ? (
          <button onClick={onSignIn} className="h-11 w-full rounded-xl bg-amber-400 font-bold text-zinc-950 active:scale-95">Sign in to upgrade</button>
        ) : (
          <>
            <p className="mb-2 text-center text-[12px] font-semibold text-amber-300">First 7 days free on your first Monthly or Annual subscription.</p>
            <div className="mb-2">
              <label htmlFor="upgrade-promo" className="mb-1 block text-[11px] text-white/55">Promo code</label>
              <input id="upgrade-promo" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Optional" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/35" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((plan) => <button key={plan.id} disabled={busy} onClick={() => onChoose(plan.id, promoCode)} className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-center active:scale-95 disabled:opacity-50"><span className="block text-sm font-bold text-white">{plan.name}</span><span className="block text-base font-bold text-amber-400">{plan.price}</span><span className="block text-[11px] text-white/50">{plan.detail}</span></button>)}
            </div>
          </>
        )}
        <p className="mt-3 text-center text-[11px] text-white/45">Promo discounts are validated before checkout.</p>
      </div>
    </div>
  );
}