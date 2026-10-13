import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { stripeRequest } from '../../shared/axisStripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { promotionId } = await req.json().catch(() => ({}));
    if (!promotionId || !/^promo_[A-Za-z0-9]+$/.test(String(promotionId))) {
      return Response.json({ error: 'Invalid promotion.' }, { status: 400 });
    }

    const secret = secrets.get('STRIPE_SECRET_KEY');
    const promotion = await stripeRequest(secret, `/promotion_codes/${promotionId}`);
    if (promotion.metadata?.base44_app_id !== secrets.get('BASE44_APP_ID')) {
      return Response.json({ error: 'Promotion does not belong to this app.' }, { status: 403 });
    }
    if (!promotion.active) return Response.json({ success: true, code: promotion.code, active: false });

    const disabled = await stripeRequest(secret, `/promotion_codes/${promotionId}`, {
      method: 'POST',
      body: { active: 'false' },
      idempotencyKey: crypto.randomUUID(),
    });
    return Response.json({ success: true, code: disabled.code, active: disabled.active });
  } catch (error) {
    console.error('disableProPromotion failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
