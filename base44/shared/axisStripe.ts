export const AXIS_PRODUCTS = {
  monthly: { priceId: 'price_1UIBFaCWuzwrZRKR0Uprkit9', productId: 'prod_VImpYxfRZxkbEc', mode: 'subscription' },
  annual: { priceId: 'price_1UIBFaCWuzwrZRKRwb0oETA3', productId: 'prod_VImpArXILRbNmH', mode: 'subscription' },
  lifetime: { priceId: 'price_1UIBFbCWuzwrZRKReVmqETOJ', productId: 'prod_VImpeUvQMlPEu4', mode: 'payment' },
};

export async function stripeRequest(secret, path, options = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': '2025-10-29.clover',
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: options.body ? new URLSearchParams(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Stripe request failed (${response.status})`);
  return data;
}