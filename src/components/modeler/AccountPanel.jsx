import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTheme } from '@/lib/theme';
import DeleteAccountControl from '@/components/modeler/DeleteAccountControl';
import { useProAccess } from '@/lib/ProAccessContext';
import PromoManager from '@/components/pro/PromoManager';

// Account submenu: shows the signed-in user, sign out, and a confirmed
// permanent account deletion.
export default function AccountPanel() {
  const { uiColor } = useTheme();
  const { isPro, plan, openUpgrade } = useProAccess();
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setMe).catch(() => setMe(null));
  }, []);



  return (
    <fieldset disabled={busy} className="flex flex-col gap-2 min-w-0">
      <div className="px-1">
        <p className="text-[11px]" style={{ color: uiColor, opacity: 0.6 }}>Signed in as</p>
        <p className="text-[12px] truncate" style={{ color: uiColor }}>{me?.email || '—'}</p>
      </div>

      <div className="rounded-md bg-white/5 px-2 py-1.5"><p className="text-[11px]" style={{ color: uiColor }}>{isPro ? `Pro · ${plan}` : 'Free plan'}</p>{!isPro && <button onClick={() => openUpgrade('Unlock premium tools, cloud backup, and unlimited projects.')} className="mt-1 text-[11px] font-bold text-amber-400">Upgrade to Pro</button>}</div>
      {me?.role === 'admin' && <PromoManager />}

      <button
        onClick={() => base44.auth.logout('/')}
        className="w-full h-9 rounded-md text-[12px] font-medium active:scale-95 transition-transform"
        style={{ color: uiColor, background: 'rgba(255,255,255,0.08)' }}
      >
        Sign out
      </button>

      <DeleteAccountControl user={me} onBusyChange={setBusy} />
    </fieldset>
  );
}