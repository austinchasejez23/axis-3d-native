import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { stripeRequest } from '../../shared/axisStripe.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { sessionId } = await req.json().catch(() => ({}));
    if (!sessionId || !String(sessionId).startsWith('cs_')) return Response.json({ error: 'Invalid checkout session.' }, { status: 400 });
    const session = await stripeRequest(secrets.get('STRIPE_SECRET_KEY'), `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`);
    if (session.client_reference_id !== user.id) return Response.json({ error: 'Checkout does not belong to this account.' }, { status: 403 });
    if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) {
      return Response.json({ error: 'Payment is not complete.' }, { status: 409 });
    }
    const plan = session.metadata?.plan;
    const subscription = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
    const update = {
      pro_active: true,
      pro_plan: plan,
      stripe_customer_id: String(session.customer || ''),
      stripe_subscription_id: String(subscription?.id || session.subscription || ''),
      pro_period_end: plan === 'lifetime' ? 0 : Number(subscription?.current_period_end || 0) * 1000,
    };
    await base44.auth.updateMe(update);
    return Response.json({ success: true, ...update, transaction_id: session.id, subscription_id: subscription?.id || (typeof session.subscription === 'string' ? session.subscription : null), checkout_mode: session.mode, value: Number(session.amount_total || 0) / 100, currency: String(session.currency || 'usd').toUpperCase() });
  } catch (error) {
    console.error('verifyProCheckout failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}