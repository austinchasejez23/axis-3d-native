import { Crown, X } from 'lucide-react';

export default function UpgradeSheet({ open, reason, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Pro unavailable" className="w-full rounded-t-2xl border-t border-white/15 bg-zinc-950 p-4 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex gap-2.5">
            <Crown className="mt-0.5 h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-white">AXIS 3D Pro</h2>
              <p className="text-sm text-white/60">{reason || 'This feature requires Pro.'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close upgrade" className="p-1 text-white/70"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-white/75">Pro access, subscriptions, promo codes and payments are temporarily unavailable in this standalone test build. Free-tier limits remain active.</p>
        <button type="button" onClick={onClose} className="mt-4 h-10 w-full rounded-lg border border-white/20 text-sm font-medium text-white">Close</button>
      </div>
    </div>
  );
}
