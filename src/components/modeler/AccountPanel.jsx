import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import { getCloudSession, signOutOfCloud } from '@/lib/supabaseTest';

// Account submenu: shows the signed-in account, sign out, and permanent
// account deletion.
export default function AccountPanel() {
  const { uiColor } = useTheme();
  const navigate = useNavigate();
  const [session, setSession] = useState(() => getCloudSession());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onSession = () => setSession(getCloudSession());
    window.addEventListener('axis-cloud-session', onSession);
    return () => window.removeEventListener('axis-cloud-session', onSession);
  }, []);

  const signOut = async () => {
    setBusy(true);
    try { await signOutOfCloud(); } finally { setBusy(false); }
  };

  return (
    <fieldset disabled={busy} className="flex flex-col gap-2 min-w-0">
      <div className="px-1">
        <p className="text-[11px]" style={{ color: uiColor, opacity: 0.6 }}>{session ? 'Signed in as' : 'Not signed in'}</p>
        {session && <p className="text-[12px] truncate" style={{ color: uiColor }}>{session.user?.email || '—'}</p>}
      </div>
      {session ? (
        <>
          <button onClick={signOut} className="w-full h-9 rounded-md text-[12px] font-medium active:scale-95 transition-transform" style={{ color: uiColor, background: 'rgba(255,255,255,0.08)' }}>
            Sign out
          </button>
          <button onClick={() => navigate('/account-deletion')} className="w-full h-9 rounded-md text-[12px] font-medium text-destructive bg-destructive/10">
            Delete account
          </button>
        </>
      ) : (
        <button onClick={() => navigate('/cloud')} className="w-full h-9 rounded-md text-[12px] font-medium active:scale-95 transition-transform" style={{ color: uiColor, background: 'rgba(255,255,255,0.08)' }}>
          Sign in
        </button>
      )}
    </fieldset>
  );
}
