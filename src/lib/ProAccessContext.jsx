import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isProUser } from '@/lib/proAccess';
import UpgradeSheet from '@/components/pro/UpgradeSheet';
import { toast } from 'sonner';
import { trackProCheckout, trackProPayment } from '@/lib/googleAdsConversions';

const ProAccessContext = createContext(null);

export function ProAccessProvider({ children }) {
  const { user, isAuthenticated, navigateToLogin, checkUserAuth } = useAuth();
  const [upgrade, setUpgrade] = useState(null);
  const [busy, setBusy] = useState(false);
  const isPro = isProUser(user);
  const openUpgrade = useCallback((reason) => setUpgrade({ reason }), []);
  const closeUpgrade = useCallback(() => setUpgrade(null), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (params.get('upgrade') !== 'success' || !sessionId || !isAuthenticated) return;
    setBusy(true);
    base44.functions.invoke('verifyProCheckout', { sessionId })
      .then((response) => {
        trackProPayment(response.data);
        return checkUserAuth();
      }).then(() => toast.success('AXIS 3D Pro unlocked'))
      .catch((error) => toast.error(error?.response?.data?.error || 'Could not verify upgrade'))
      .finally(() => {
        setBusy(false);
        params.delete('upgrade'); params.delete('session_id');
        window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
      });
  }, [isAuthenticated, checkUserAuth]);

  const choosePlan = async (plan, promoCode = '') => {
    const isFramed = window.self !== window.top;
    const checkoutTab = isFramed ? window.open('', '_blank') : null;
    if (isFramed && !checkoutTab) { toast.error('Allow popups to continue to checkout.'); return; }
    if (checkoutTab) checkoutTab.opener = null;
    setBusy(true);
    try {
      const response = await base44.functions.invoke('createProCheckout', { plan, promoCode: promoCode.trim(), returnUrl: window.location.href });
      trackProCheckout(response.data);
      if (checkoutTab) { checkoutTab.location.replace(response.data.url); setBusy(false); }
      else window.location.assign(response.data.url);
    } catch (error) {
      checkoutTab?.close();
      toast.error(error?.response?.data?.error || error.message || 'Checkout could not start');
      setBusy(false);
    }
  };

  const value = useMemo(() => ({ isPro, openUpgrade, closeUpgrade, plan: user?.pro_plan || 'none' }), [isPro, openUpgrade, closeUpgrade, user?.pro_plan]);
  return <ProAccessContext.Provider value={value}>{children}<UpgradeSheet open={!!upgrade} reason={upgrade?.reason} signedIn={isAuthenticated} busy={busy} onClose={closeUpgrade} onChoose={choosePlan} onSignIn={navigateToLogin}/></ProAccessContext.Provider>;
}

export const useProAccess = () => useContext(ProAccessContext);