import { Capacitor, registerPlugin } from '@capacitor/core';

// Isolated read-only bridge. Neither this JS module nor its native counterpart
// provides a way to start purchases, acknowledge orders, or grant Pro.
const nativeBilling = registerPlugin('AxisPlayBilling');

export async function checkPlayBillingConnection() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return {
      connected: false,
      purchasesEnabled: false,
      entitlementsEnabled: false,
      message: 'Google Play Billing is only available in the Android app.',
    };
  }
  try {
    const response = await nativeBilling.checkConnection();
    const connected = response.connected === true;
    const responseCode = Number.isInteger(response.responseCode) ? response.responseCode : null;
    const diagnostic = typeof response.message === 'string' ? response.message.trim() : '';
    return {
      connected,
      purchasesEnabled: false,
      entitlementsEnabled: false,
      responseCode,
      // BillingClient can legitimately return an empty debug message on success.
      // Do not show "No response" after a successful native connection.
      message: diagnostic || (connected
        ? 'Google Play Billing service ready.'
        : 'Google Play Billing unavailable (response code ' + (responseCode ?? 'unknown') + ').'),
    };
  } catch (err) {
    return {
      connected: false,
      purchasesEnabled: false,
      entitlementsEnabled: false,
      message: err?.message || 'Could not connect to native Play Billing.',
    };
  }
}
