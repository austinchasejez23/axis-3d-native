// Pure Google Play response checks. Shared by the isolated server verifier and
// offline Node regression tests. Data must have come from the authenticated
// Google Android Publisher API; NEVER evaluate client-supplied purchase JSON.
export function inspectPlayPurchase(type, productId, purchase, now = Date.now()) {
  const denied = reason => ({ accepted: false, reason, expiry: null });
  if (!purchase || typeof purchase !== 'object' || !productId) return denied('invalid_purchase');

  if (type === 'subs') {
    const state = purchase.subscriptionState;
    if (!['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(state)) {
      return denied('subscription_not_active');
    }
    // Explicitly require acknowledgement and matching live line item.
    if (purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
      return denied('subscription_unacknowledged');
    }
    const items = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
    const matching = items.filter(i => i?.productId === productId);
    if (!matching.length) return denied('product_mismatch');
    const expiries = matching.map(i => Date.parse(i.expiryTime)).filter(t => Number.isFinite(t) && t > now);
    if (!expiries.length) return denied('subscription_expired');
    return { accepted: true, reason: 'google_subscription_active', expiry: new Date(Math.max(...expiries)).toISOString() };
  }

  if (type === 'inapp') {
    if (purchase.productId !== productId) return denied('product_mismatch');
    if (purchase.purchaseState !== 0) return denied('product_not_purchased');
    if (purchase.acknowledgementState !== 1) return denied('product_unacknowledged');
    if (purchase.consumptionState !== 0) return denied('product_consumed');
    // This is eligibility for later server-side binding, NOT a grant of Pro.
    return { accepted: true, reason: 'google_product_purchased', expiry: null };
  }

  return denied('unsupported_product_type');
}
