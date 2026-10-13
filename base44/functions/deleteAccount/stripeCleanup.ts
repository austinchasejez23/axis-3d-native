import { stripeRequest } from '../../shared/axisStripe.ts';

async function* stripePages(secret, path, params = {}) {
  let cursor;
  do {
    const query = new URLSearchParams({ ...params, limit: '100', ...(cursor ? { starting_after: cursor } : {}) });
    const page = await stripeRequest(secret, `${path}?${query}`);
    yield page.data;
    cursor = page.has_more ? page.data.at(-1)?.id : null;
  } while (cursor);
}

export async function removeStripeCustomerData(secret, appId, user) {
  const ownsSession = (s) => s.metadata?.base44_app_id === appId
    && s.metadata?.user_id === user.id && s.client_reference_id === user.id;
  const ownsSubscription = (s) => s.metadata?.base44_app_id === appId && s.metadata?.user_id === user.id;
  const customers = new Set();
  const openSessions = [];
  // Earlier checkouts created new customers; the User record holds only the
  // latest one. Discover every checkout by signed server-created association,
  // never by email or a customer ID supplied by the browser.
  for await (const sessions of stripePages(secret, '/checkout/sessions')) {
    for (const session of sessions) {
      if (!ownsSession(session)) continue;
      if (session.customer) customers.add(session.customer);
      if (session.status === 'open') openSessions.push(session.id);
    }
  }
  if (user.stripe_subscription_id) {
    const subscription = await stripeRequest(secret, `/subscriptions/${encodeURIComponent(user.stripe_subscription_id)}`);
    if (!ownsSubscription(subscription)) throw new Error('Billing ownership could not be verified. Contact support.');
    if (subscription.customer) customers.add(subscription.customer);
  }
  if (user.stripe_customer_id && !customers.has(user.stripe_customer_id)) {
    const customer = await stripeRequest(secret, `/customers/${encodeURIComponent(user.stripe_customer_id)}`);
    if (!customer.deleted) throw new Error('Billing ownership could not be verified. Contact support.');
  }
  // Preflight all customers before making any destructive request.
  const deletable = [];
  for (const id of customers) {
    const customer = await stripeRequest(secret, `/customers/${encodeURIComponent(id)}`);
    if (customer.deleted) continue;
    for await (const sessions of stripePages(secret, '/checkout/sessions', { customer: id })) {
      if (sessions.some((s) => !ownsSession(s))) throw new Error('This billing profile is shared. Contact support before deleting it.');
    }
    for await (const subscriptions of stripePages(secret, '/subscriptions', { customer: id, status: 'all' })) {
      if (subscriptions.some((s) => !ownsSubscription(s))) throw new Error('This billing profile is shared. Contact support before deleting it.');
    }
    deletable.push(id);
  }
  for (const id of openSessions) {
    await stripeRequest(secret, `/checkout/sessions/${encodeURIComponent(id)}/expire`, { method: 'POST', body: {}, idempotencyKey: crypto.randomUUID() });
  }
  for (const id of deletable) {
    // Stripe customer deletion cancels active subscriptions and removes stored
    // payment details. It does NOT erase retained transactions or invoices.
    await stripeRequest(secret, `/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  return { removedCustomers: deletable.length };
}