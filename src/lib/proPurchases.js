import { Capacitor, registerPlugin } from '@capacitor/core';
import { cloudRequest, getCloudSession } from '@/lib/supabaseTest';

// Google Play purchases for AXIS Pro. The phone only opens Google's payment
// sheet and passes the purchase token on. Supabase (axis-play-purchase)
// checks it with Google and decides Pro for the signed-in account.
const billing = registerPlugin('AxisPlayBilling');
const FUNCTION = '/functions/v1/axis-play-purchase';

export const canBuyInApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pro as stored for this account. Works without the phone's Play account,
// so a purchase made on one phone unlocks Pro on another after sign-in.
export async function readEntitlement() {
  const session = getCloudSession();
  if (!session) return { isPro: false, plan: null, validUntil: null };
  const rows = await cloudRequest('/rest/v1/axis_pro_entitlements?select=status,valid_until,external_reference&user_id=eq.' + session.user.id);
  const row = Array.isArray(rows) ? rows[0] : null;
  const live = row && ['active', 'trialing'].includes(row.status) &&
    (!row.valid_until || Date.parse(row.valid_until) > Date.now());
  return { isPro: !!live, plan: live ? row.external_reference : null, validUntil: live ? row.valid_until : null };
}

// Monthly, annual (with any free trial offer) and lifetime, priced by Google.
export async function loadPlans() {
  if (!canBuyInApp()) return [];
  const { plans = [] } = await billing.getProducts();
  const subs = plans.filter(p => p.productType === 'subs');
  const pick = (basePlanId) => {
    const options = subs.filter(p => p.basePlanId === basePlanId);
    // Google only lists offers this account is eligible for, so a trial
    // offer here means the free trial applies; otherwise use the base plan.
    return options.find(p => p.freeTrial) || options.find(p => !p.offerId) || options[0] || null;
  };
  return [
    pick('monthly') && { ...pick('monthly'), id: 'monthly', name: 'Monthly', detail: pick('monthly').freeTrial ? '7 days free · then monthly' : 'per month' },
    pick('annual') && { ...pick('annual'), id: 'annual', name: 'Annual', detail: pick('annual').freeTrial ? '7 days free · then yearly' : 'per year' },
    ...plans.filter(p => p.productType === 'inapp').map(p => ({ ...p, id: 'lifetime', name: 'Lifetime', detail: 'one time' })),
  ].filter(Boolean);
}

async function verify(purchases) {
  const ready = purchases.filter(p => !p.pending);
  if (!ready.length) return null;
  return cloudRequest(FUNCTION, { method: 'POST', body: { action: 'verify', purchases: ready } });
}

export async function buyPlan(plan) {
  const session = getCloudSession();
  if (!session) throw new Error('Sign in to your AXIS account first, so Pro stays with you.');
  const accountId = await sha256(session.user.id);
  const { purchases = [] } = await billing.purchase({ productId: plan.productId, offerToken: plan.offerToken, accountId });
  if (purchases.length && purchases.every(p => p.pending)) {
    return { isPro: false, pending: true };
  }
  return verify(purchases);
}

// Re-sends this Google account's Play purchases and re-checks stored ones,
// so renewals, refunds and purchases from another phone all apply.
export async function restorePurchases() {
  if (!getCloudSession()) throw new Error('Sign in to your AXIS account first.');
  if (canBuyInApp()) {
    const { purchases = [] } = await billing.queryPurchases();
    await verify(purchases);
  }
  return cloudRequest(FUNCTION, { method: 'POST', body: { action: 'refresh' } });
}
