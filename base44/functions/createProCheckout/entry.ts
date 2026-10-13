import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { AXIS_PRODUCTS, stripeRequest } from '../../shared/axisStripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in before upgrading.' }, { status: 401 });
    const { plan, returnUrl, promoCode } = await req.json().catch(() => ({}));
    const selected = AXIS_PRODUCTS[plan];
    if (!selected) return Response.json({ error: 'Invalid plan.' }, { status: 400 });
    const defaultDestination = new URL('https://axis-3d.base44.app/library');
    const destination = new URL(returnUrl || defaultDestination.toString());
    const trustedOrigins = new Set([defaultDestination.origin]);
    for (const header of ['origin', 'referer']) {
      const value = req.headers.get(header);
      if (!value) continue;
      try {
        const caller = new URL(value);
        if (caller.protocol === 'https:') trustedOrigins.add(caller.origin);
      } catch {}
    }
    if (destination.protocol !== 'https:' || !trustedOrigins.has(destination.origin)) {
      return Response.json({ error: 'Invalid return URL.' }, { status: 400 });
    }
    destination.hash = '';
    destination.searchParams.delete('upgrade');
    destination.searchParams.delete('session_id');
    const separator = destination.search ? '&' : '?';
    const successUrl = `${destination.toString()}${separator}upgrade=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${destination.toString()}${separator}upgrade=cancelled`;
    const appId = secrets.get('BASE44_APP_ID');
    const body: Record<string, string> = {
      mode: selected.mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'line_items[0][price]': selected.priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      customer_email: user.email,
      'metadata[base44_app_id]': appId,
      'metadata[user_id]': user.id,
      'metadata[plan]': plan,
    };
    const normalizedPromo = String(promoCode || '').trim().toUpperCase();
    if (normalizedPromo) {
      const promos = await stripeRequest(secrets.get('STRIPE_SECRET_KEY'), `/promotion_codes?code=${encodeURIComponent(normalizedPromo)}&active=true&limit=10`);
      const promotion = promos?.data?.find((item) => item.code === normalizedPromo);
      if (!promotion) return Response.json({ error: 'Promo code is invalid or no longer active.' }, { status: 400 });
      const now = Math.floor(Date.now() / 1000);
      const startAt = Number(promotion.metadata?.start_at || 0);
      const endAt = Number(promotion.metadata?.end_at || promotion.expires_at || 0);
      if (startAt && now < startAt) return Response.json({ error: 'This promo code is not active yet.' }, { status: 400 });
      if (endAt && now > endAt) return Response.json({ error: 'This promo code has expired.' }, { status: 400 });
      if (promotion.max_redemptions && promotion.times_redeemed >= promotion.max_redemptions) return Response.json({ error: 'This promo code has reached its use limit.' }, { status: 400 });
      body['discounts[0][promotion_code]'] = promotion.id;
    } else {
      body.allow_promotion_codes = 'false';
    }
    if (selected.mode === 'subscription') {
      body['subscription_data[metadata][base44_app_id]'] = appId;
      body['subscription_data[metadata][user_id]'] = user.id;
      body['subscription_data[metadata][plan]'] = plan;

      // Seven-day trial is for the account's first paid subscription only.
      // Check Stripe history server-side so clearing local storage or reinstalling
      // the app cannot manufacture another trial.
      let trialEligible = !user.stripe_customer_id && !user.stripe_subscription_id;
      if (trialEligible) {
        const previous = await stripeRequest(
          secrets.get('STRIPE_SECRET_KEY'),
          `/checkout/sessions?client_reference_id=${encodeURIComponent(user.id)}&limit=10`
        );
        trialEligible = !(previous?.data || []).some((session) =>
          session.mode === 'subscription' && ['complete', 'expired'].includes(session.status)
        );
      }
      if (trialEligible) {
        body['subscription_data[trial_period_days]'] = '7';
        body['subscription_data[trial_settings][end_behavior][missing_payment_method]'] = 'cancel';
        body.payment_method_collection = 'always';
        body['metadata[trial_days]'] = '7';
      }
    }
    const session = await stripeRequest(secrets.get('STRIPE_SECRET_KEY'), '/checkout/sessions', {
      method: 'POST', body, idempotencyKey: crypto.randomUUID(),
    });
    return Response.json({ url: session.url, value: Number(session.amount_total || 0) / 100, currency: String(session.currency || 'usd').toUpperCase() });
  } catch (error) {
    console.error('createProCheckout failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}