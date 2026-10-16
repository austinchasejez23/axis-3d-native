package com.base6a5340f43f8fd031c5921680.app;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Read-only Google Play Billing connection probe for the Axis 3D TEST build.
 *
 * This deliberately contains NO launchBillingFlow, purchase-token forwarding,
 * acknowledgement, consuming, product ID or entitlement changes.
 * Actual purchases remain disabled until the Play Developer API verifier,
 * RTDN/refund handling and product catalog have been fully tested.
 */
@CapacitorPlugin(name = "AxisPlayBilling")
public class AxisPlayBillingPlugin extends Plugin {
    private BillingClient billingClient;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener((billingResult, purchases) -> {
                // Never grant Pro based on a client-side purchase callback.
                // A future handler must validate on the server and then refresh.
            })
            .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts().build())
            .build();
    }

    @PluginMethod
    public void checkConnection(PluginCall call) {
        if (billingClient == null) {
            call.reject("Google Play Billing is not initialized.");
            return;
        }
        if (billingClient.isReady()) {
            reply(call, true, BillingClient.BillingResponseCode.OK, "Connected to Google Play.");
            return;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                reply(call, result.getResponseCode() == BillingClient.BillingResponseCode.OK,
                      result.getResponseCode(), result.getDebugMessage());
            }

            @Override
            public void onBillingServiceDisconnected() {
                // A later request retries; no purchases or entitlements depend on this.
            }
        });
    }

    private void reply(PluginCall call, boolean ready, int responseCode, String message) {
        JSObject response = new JSObject();
        response.put("connected", ready);
        response.put("responseCode", responseCode);
        response.put("message", message);
        response.put("purchasesEnabled", false);
        response.put("entitlementsEnabled", false);
        call.resolve(response);
    }
}
