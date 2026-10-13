import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { stripeRequest } from '../../shared/axisStripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const appId = secrets.get('BASE44_APP_ID');
    const result = await stripeRequest(secrets.get('STRIPE_SECRET_KEY'), '/promotion_codes?active=true&limit=100');
    const promos = (result.data || [])
      .filter((item) => item.metadata?.base44_app_id === appId)
      .map((item) => ({
        id: item.id,
        code: item.code,
        active: item.active,
        promoType: item.metadata?.promo_type || (item.max_redemptions === 1 ? 'one_time' : 'legacy'),
        benefit: item.metadata?.benefit || 'legacy',
        percentOff: Number(item.metadata?.percent_off || 0),
        startAt: Number(item.metadata?.start_at || 0),
        endAt: Number(item.metadata?.end_at || item.expires_at || 0),
        maxRedemptions: item.max_redemptions || null,
        timesRedeemed: item.times_redeemed || 0,
      }));
    return Response.json({ promos });
  } catch (error) {
    console.error('listProPromotions failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
