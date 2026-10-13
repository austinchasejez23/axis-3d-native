import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { AXIS_PRODUCTS, stripeRequest } from '../../shared/axisStripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const input = await req.json().catch(() => ({}));
    const code = String(input.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (code.length < 3 || code.length > 32) return Response.json({ error: 'Promo code must be 3–32 letters or numbers.' }, { status: 400 });
    const percentOff = input.free ? 100 : Number(input.percentOff);
    if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) return Response.json({ error: 'Discount must be between 1% and 100%.' }, { status: 400 });
    const benefit = ['month', 'year', 'lifetime'].includes(input.benefit) ? input.benefit : 'month';
    const duration = benefit === 'lifetime' ? 'forever' : 'repeating';
    const durationMonths = benefit === 'year' ? 12 : 1;
    const promoType = ['one_time', 'limited_time', 'limited_uses'].includes(input.promoType) ? input.promoType : 'one_time';
    const body: Record<string, string> = {
      percent_off: String(percentOff),
      duration,
      name: input.free ? `Friends & Family — ${code}` : `${percentOff}% off — ${code}`,
      'metadata[base44_app_id]': secrets.get('BASE44_APP_ID'),
      'metadata[created_by]': user.id,
    };
    if (duration === 'repeating') body.duration_in_months = String(durationMonths);
    Object.values(AXIS_PRODUCTS).forEach((item, index) => { body[`applies_to[products][${index}]`] = item.productId; });
    const coupon = await stripeRequest(secrets.get('STRIPE_SECRET_KEY'), '/coupons', { method: 'POST', body, idempotencyKey: crypto.randomUUID() });
    const promoBody: Record<string, string> = {
      code,
      'promotion[type]': 'coupon',
      'promotion[coupon]': coupon.id,
      'metadata[base44_app_id]': secrets.get('BASE44_APP_ID'),
      'metadata[promo_type]': promoType,
      'metadata[benefit]': benefit,
      'metadata[percent_off]': String(percentOff),
    };
    const now = Math.floor(Date.now() / 1000);
    if (promoType === 'one_time') promoBody.max_redemptions = '1';
    if (promoType === 'limited_uses') promoBody.max_redemptions = String(Math.max(1, Math.floor(Number(input.maxRedemptions) || 1)));
    if (promoType === 'limited_time') {
      const startAt = Math.floor(new Date(input.startAt).getTime() / 1000);
      const endAt = Math.floor(new Date(input.endAt).getTime() / 1000);
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return Response.json({ error: 'Choose a valid promo start and end date.' }, { status: 400 });
      if (endAt <= now) return Response.json({ error: 'Promo end date must be in the future.' }, { status: 400 });
      promoBody.expires_at = String(endAt);
      promoBody['metadata[start_at]'] = String(startAt);
      promoBody['metadata[end_at]'] = String(endAt);
      // Stripe has no automatic future-start switch. Keep the code active in Stripe;
      // AXIS checkout enforces start_at before applying it.
    }
    const promotion = await stripeRequest(secrets.get('STRIPE_SECRET_KEY'), '/promotion_codes', { method: 'POST', body: promoBody, idempotencyKey: crypto.randomUUID() });
    return Response.json({ success: true, code: promotion.code, percentOff, benefit, promoType, active: promotion.active, maxRedemptions: promotion.max_redemptions, timesRedeemed: promotion.times_redeemed, expiresAt: promotion.expires_at, metadata: promotion.metadata });
  } catch (error) {
    console.error('createProPromotion failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}