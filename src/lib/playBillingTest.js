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
    return {
      connected: response.connected === true,
      purchasesEnabled: false,
      entitlementsEnabled: false,
      responseCode: response.responseCode,
      message: response.message || 'No response from Google Play Billing.',
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
