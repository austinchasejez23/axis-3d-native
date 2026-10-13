import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import Stripe from 'npm:stripe@17.7.0';
import { secrets } from 'base44:runtime';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) return Response.json({ error: 'Missing signature' }, { status: 400 });
    const event = await stripe.webhooks.constructEventAsync(body, signature, secrets.get('STRIPE_WEBHOOK_SECRET'));
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const paid = event.type === 'checkout.session.async_payment_succeeded'
        || ['paid', 'no_payment_required'].includes(session.payment_status);
      if (paid) {
        const userId = session.metadata?.user_id || session.client_reference_id;
        if (userId) await base44.asServiceRole.entities.User.update(userId, {
          pro_active: true,
          pro_plan: session.metadata?.plan || 'monthly',
          stripe_customer_id: String(session.customer || ''),
          stripe_subscription_id: String(session.subscription || ''),
          pro_period_end: session.metadata?.plan === 'lifetime' ? 0 : undefined,
        });
      }
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const userId = subscription.metadata?.user_id;
      if (userId) {
        const active = event.type !== 'customer.subscription.deleted' && ['active', 'trialing'].includes(subscription.status);
        await base44.asServiceRole.entities.User.update(userId, {
          pro_active: active,
          pro_plan: active ? (subscription.metadata?.plan || 'monthly') : 'none',
          stripe_customer_id: String(subscription.customer || ''),
          stripe_subscription_id: String(subscription.id || ''),
          pro_period_end: Number(subscription.current_period_end || 0) * 1000,
        });
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error('stripeWebhook failed', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}