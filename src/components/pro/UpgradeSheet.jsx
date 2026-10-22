import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2, X } from 'lucide-react';
import { getCloudSession } from '@/lib/supabaseTest';
import { buyPlan, canBuyInApp, loadPlans, restorePurchases } from '@/lib/proPurchases';

export default function UpgradeSheet({ open, reason, onClose, isPro = false, onAccess }) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const signedIn = !!getCloudSession();

  useEffect(() => {
    if (!open || !canBuyInApp()) return;
    let alive = true;
    setMessage('');
    loadPlans()
      .then((list) => { if (alive) setPlans(list); })
      .catch((error) => { if (alive) setMessage(error?.message || 'Could not load the Pro plans.'); });
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const run = async (task) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await task();
      if (result?.pending) setMessage('Your payment is pending. Pro turns on once Google confirms it.');
      else if (result) {
        onAccess?.(result);
        setMessage(result.isPro ? 'AXIS Pro is active. Thank you!' : 'No active Pro purchase was found for this account.');
      }
    } catch (error) {
      if (error?.code !== 'CANCELED') setMessage(error?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const goSignIn = () => { onClose?.(); navigate('/cloud'); };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="AXIS 3D Pro" className="w-full rounded-t-2xl border-t border-white/15 bg-zinc-950 p-4 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex gap-2.5">
            <Crown className="mt-0.5 h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-white">AXIS 3D Pro</h2>
              <p className="text-sm text-white/60">{isPro ? 'Pro is active on this account.' : (reason || 'This feature requires Pro.')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close upgrade" className="p-1 text-white/70"><X className="h-5 w-5" /></button>
        </div>

        {!canBuyInApp() ? (
          <p className="text-sm text-white/75">Pro can be bought in the AXIS Android app from Google Play.</p>
        ) : !signedIn ? (
          <>
            <p className="text-sm text-white/75">Sign in to your AXIS account first, so Pro stays with you on any phone.</p>
            <button type="button" onClick={goSignIn} className="mt-3 h-11 w-full rounded-lg bg-amber-400 text-sm font-bold text-black active:scale-95">Sign in</button>
          </>
        ) : !isPro && (
          <>
            {plans.some(p => p.freeTrial) && (
              <p className="mb-2 text-center text-[12px] font-semibold text-amber-300">First 7 days free on your first Monthly or Annual subscription.</p>
            )}
            {plans.length ? (
              <div className="grid grid-cols-3 gap-2">
                {plans.map((plan) => (
                  <button key={plan.id} type="button" disabled={busy} onClick={() => run(() => buyPlan(plan))}
                    className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-center active:scale-95 disabled:opacity-50">
                    <span className="block text-sm font-bold text-white">{plan.name}</span>
                    <span className="block text-base font-bold text-amber-400">{plan.price}</span>
                    <span className="block text-[11px] text-white/50">{plan.detail}</span>
                  </button>
                ))}
              </div>
            ) : !message && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading plans</div>
            )}
          </>
        )}

        {message && <p className="mt-3 text-center text-sm text-white/80" role="status">{message}</p>}

        {canBuyInApp() && signedIn && (
          <button type="button" disabled={busy} onClick={() => run(restorePurchases)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/20 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Restore purchases
          </button>
        )}
        <button type="button" onClick={onClose} className="mt-2 h-10 w-full rounded-lg text-sm font-medium text-white/60">Close</button>
      </div>
    </div>
  );
}
