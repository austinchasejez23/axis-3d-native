import { LogIn, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function LibraryAuthButton() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const Icon = user ? LogOut : LogIn;
  const label = user ? 'Log out' : 'Log in';

  return (
    <button
      type="button"
      onClick={() => user ? logout('/library') : navigate('/login?returnTo=%2Flibrary')}
      className="shrink-0 flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-sm font-semibold text-white active:scale-95"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}