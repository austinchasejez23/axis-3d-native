export function trackProCheckout(checkout) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'conversion', {
      send_to: 'AW-18485410634/fMmSCOnhhIwdEMr2w-5E',
      value: checkout.value,
      currency: checkout.currency || 'USD',
    });
  }
}

export function trackProPayment(payment) {
  if (!payment.success || typeof window === 'undefined' || !window.gtag) return;
  const revenue = { value: payment.value, currency: payment.currency || 'USD' };
  window.gtag('event', 'conversion', {
    send_to: 'AW-18485410634/PpXRCKvqjowdEMr2w-5E',
    ...revenue,
    ...(payment.transaction_id ? { transaction_id: payment.transaction_id } : {}),
  });
  if (payment.checkout_mode === 'subscription') {
    window.gtag('event', 'conversion', {
      send_to: 'AW-18485410634/GZ4uCLLxjowdEMr2w-5E',
      ...revenue,
      ...(payment.subscription_id ? { transaction_id: payment.subscription_id } : {}),
    });
  }
}