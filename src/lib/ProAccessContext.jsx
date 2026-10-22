import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import UpgradeSheet from '@/components/pro/UpgradeSheet';
import { getCloudSession } from '@/lib/supabaseTest';
import { readEntitlement, restorePurchases } from '@/lib/proPurchases';

// Pro comes only from the account's entitlement, which the Supabase purchase
// check writes after Google confirms a payment. The last confirmed answer is
// kept per account so Pro keeps working offline until it would expire.
const ProAccessContext = createContext(null);
const CACHE_KEY = 'axis.pro.access';
const NONE = { isPro: false, plan: null, validUntil: null };

function stillValid(access) {
  return !!access?.isPro && (!access.validUntil || Date.parse(access.validUntil) > Date.now());
}

function readCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return cached?.userId === userId && stillValid(cached) ? cached : null;
  } catch { return null; }
}

function writeCache(userId, access) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...access, userId })); } catch { /* storage full */ }
}

export function ProAccessProvider({ children }) {
  const [upgradeReason, setUpgradeReason] = useState(null);
  const [access, setAccess] = useState(() => {
    const userId = getCloudSession()?.user?.id;
    return (userId && readCache(userId)) || NONE;
  });

  const applyAccess = useCallback((next) => {
    const userId = getCloudSession()?.user?.id;
    const value = next && userId ? { isPro: !!next.isPro, plan: next.plan ?? null, validUntil: next.validUntil ?? null } : NONE;
    setAccess(stillValid(value) ? value : NONE);
    if (userId) writeCache(userId, value);
  }, []);

  const refreshPro = useCallback(async ({ recheck = true } = {}) => {
    const userId = getCloudSession()?.user?.id;
    if (!userId) { setAccess(NONE); return NONE; }
    const cached = readCache(userId);
    setAccess(cached || NONE);
    try { applyAccess(await readEntitlement()); } catch { /* offline: keep cached */ }
    if (!recheck) return null;
    try {
      const checked = await restorePurchases();
      applyAccess(checked);
      return checked;
    } catch { return null; }
  }, [applyAccess]);

  useEffect(() => {
    refreshPro();
    const onSession = () => refreshPro();
    window.addEventListener('axis-cloud-session', onSession);
    return () => window.removeEventListener('axis-cloud-session', onSession);
  }, [refreshPro]);

  const openUpgrade = useCallback((reason) => setUpgradeReason(reason || 'This feature requires Pro.'), []);
  const closeUpgrade = useCallback(() => setUpgradeReason(null), []);
  const value = useMemo(() => ({
    isPro: stillValid(access),
    plan: access.plan,
    validUntil: access.validUntil,
    openUpgrade,
    closeUpgrade,
    refreshPro,
  }), [access, openUpgrade, closeUpgrade, refreshPro]);

  return (
    <ProAccessContext.Provider value={value}>
      {children}
      <UpgradeSheet open={upgradeReason !== null} reason={upgradeReason} onClose={closeUpgrade}
        isPro={value.isPro} onAccess={applyAccess} />
    </ProAccessContext.Provider>
  );
}

export function useProAccess() {
  const value = useContext(ProAccessContext);
  if (!value) throw new Error('useProAccess must be used inside ProAccessProvider');
  return value;
}
