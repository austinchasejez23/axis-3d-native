import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCloudSession, signOutOfCloud } from '@/lib/supabaseTest';

export default function LibraryAuthButton() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => getCloudSession());
  useEffect(() => {
    const onSession = () => setSession(getCloudSession());
    window.addEventListener('axis-cloud-session', onSession);
    return () => window.removeEventListener('axis-cloud-session', onSession);
  }, []);
  const Icon = session ? LogOut : LogIn;
  const label = session ? 'Log out' : 'Log in';

  return (
    <button
      type="button"
      onClick={() => session ? signOutOfCloud() : navigate('/cloud')}
      className="shrink-0 flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-sm font-semibold text-white active:scale-95"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
