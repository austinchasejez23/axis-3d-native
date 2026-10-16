import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import UpgradeSheet from '@/components/pro/UpgradeSheet';

// Standalone test builds have NO trusted entitlement provider. Never infer
// Pro from old tokens, browser storage, query parameters or client-side flags.
const ProAccessContext = createContext(null);

export function ProAccessProvider({ children }) {
  const [upgradeReason, setUpgradeReason] = useState(null);
  const openUpgrade = useCallback((reason) => setUpgradeReason(reason || 'This feature requires Pro.'), []);
  const closeUpgrade = useCallback(() => setUpgradeReason(null), []);
  const value = useMemo(() => ({
    isPro: false,
    plan: 'none',
    openUpgrade,
    closeUpgrade,
  }), [openUpgrade, closeUpgrade]);

  return (
    <ProAccessContext.Provider value={value}>
      {children}
      <UpgradeSheet open={upgradeReason !== null} reason={upgradeReason} onClose={closeUpgrade} />
    </ProAccessContext.Provider>
  );
}

export function useProAccess() {
  const value = useContext(ProAccessContext);
  if (!value) throw new Error('useProAccess must be used inside ProAccessProvider');
  return value;
}
