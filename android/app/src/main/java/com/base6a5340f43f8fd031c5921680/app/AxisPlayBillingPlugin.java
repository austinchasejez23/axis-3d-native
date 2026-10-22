package com.base6a5340f43f8fd031c5921680.app;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Google Play Billing bridge for AXIS Pro.
 *
 * It only lists products, opens Google's own payment sheet and reports the
 * purchase tokens back. It never grants Pro and never acknowledges: the
 * Supabase function axis-play-purchase checks each token with Google,
 * acknowledges it and decides Pro for the signed-in account.
 */
@CapacitorPlugin(name = "AxisPlayBilling")
public class AxisPlayBillingPlugin extends Plugin {
    static final String SUBSCRIPTION = "axis_pro";
    static final String LIFETIME = "axis_pro_lifetime";

    private BillingClient billingClient;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private PluginCall purchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener((result, purchases) -> {
                PluginCall call = purchaseCall;
                purchaseCall = null;
                if (call == null) return;
                int code = result.getResponseCode();
                if (code == BillingClient.BillingResponseCode.OK) {
                    call.resolve(purchasesResponse(purchases));
                } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
                    call.reject("Purchase canceled.", "CANCELED");
                } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                    call.reject("You already own this. Tap Restore purchases.", "ALREADY_OWNED");
                } else {
                    call.reject(message(result, "Google Play could not complete the purchase."), String.valueOf(code));
                }
            })
            .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts().enablePrepaidPlans().build())
            .build();
    }

    private interface Ready { void run(); }

    private void connected(PluginCall call, Ready then) {
        if (billingClient.isReady()) { then.run(); return; }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else call.reject(message(result, "Google Play Billing is unavailable."), String.valueOf(result.getResponseCode()));
            }

            @Override
            public void onBillingServiceDisconnected() { }
        });
    }

    private static String message(BillingResult result, String fallback) {
        String text = result.getDebugMessage();
        return text == null || text.isEmpty() ? fallback : text;
    }

    @PluginMethod
    public void checkConnection(PluginCall call) {
        connected(call, () -> {
            JSObject response = new JSObject();
            response.put("connected", true);
            response.put("responseCode", BillingClient.BillingResponseCode.OK);
            response.put("message", "Connected to Google Play.");
            call.resolve(response);
        });
    }

    /** Lists the Pro plans with Google's localized prices. */
    @PluginMethod
    public void getProducts(PluginCall call) {
        connected(call, () -> {
            List<QueryProductDetailsParams.Product> subs = new ArrayList<>();
            subs.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(SUBSCRIPTION).setProductType(BillingClient.ProductType.SUBS).build());
            billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(subs).build(),
                (subsResult, subsDetails) -> {
                    List<QueryProductDetailsParams.Product> once = new ArrayList<>();
                    once.add(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(LIFETIME).setProductType(BillingClient.ProductType.INAPP).build());
                    billingClient.queryProductDetailsAsync(
                        QueryProductDetailsParams.newBuilder().setProductList(once).build(),
                        (onceResult, onceDetails) -> {
                            JSArray plans = new JSArray();
                            for (ProductDetails product : subsDetails.getProductDetailsList()) {
                                details.put(product.getProductId(), product);
                                List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
                                if (offers == null) continue;
                                for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                                    List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                                    if (phases.isEmpty()) continue;
                                    ProductDetails.PricingPhase last = phases.get(phases.size() - 1);
                                    boolean trial = false;
                                    for (ProductDetails.PricingPhase phase : phases) {
                                        if (phase.getPriceAmountMicros() == 0) trial = true;
                                    }
                                    JSObject plan = new JSObject();
                                    plan.put("productId", product.getProductId());
                                    plan.put("productType", "subs");
                                    plan.put("basePlanId", offer.getBasePlanId());
                                    plan.put("offerId", offer.getOfferId());
                                    plan.put("offerToken", offer.getOfferToken());
                                    plan.put("price", last.getFormattedPrice());
                                    plan.put("billingPeriod", last.getBillingPeriod());
                                    plan.put("freeTrial", trial);
                                    plans.put(plan);
                                }
                            }
                            for (ProductDetails product : onceDetails.getProductDetailsList()) {
                                details.put(product.getProductId(), product);
                                List<ProductDetails.OneTimePurchaseOfferDetails> offers = product.getOneTimePurchaseOfferDetailsList();
                                if (offers == null || offers.isEmpty()) continue;
                                ProductDetails.OneTimePurchaseOfferDetails offer = offers.get(0);
                                JSObject plan = new JSObject();
                                plan.put("productId", product.getProductId());
                                plan.put("productType", "inapp");
                                plan.put("offerToken", offer.getOfferToken());
                                plan.put("price", offer.getFormattedPrice());
                                plans.put(plan);
                            }
                            JSObject response = new JSObject();
                            response.put("plans", plans);
                            call.resolve(response);
                        });
                });
        });
    }

    /** Opens Google's payment sheet for one plan. */
    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken");
        String accountId = call.getString("accountId");
        ProductDetails product = productId == null ? null : details.get(productId);
        if (product == null) { call.reject("Load the Pro plans first."); return; }
        if (purchaseCall != null) { call.reject("A purchase is already open."); return; }
        connected(call, () -> {
            BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(product);
            if (offerToken != null && !offerToken.isEmpty()) item.setOfferToken(offerToken);
            List<BillingFlowParams.ProductDetailsParams> items = new ArrayList<>();
            items.add(item.build());
            BillingFlowParams.Builder flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(items);
            if (accountId != null && !accountId.isEmpty()) flow.setObfuscatedAccountId(accountId);
            purchaseCall = call;
            getActivity().runOnUiThread(() -> {
                BillingResult result = billingClient.launchBillingFlow(getActivity(), flow.build());
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK && purchaseCall == call) {
                    purchaseCall = null;
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                        call.reject("You already own this. Tap Restore purchases.", "ALREADY_OWNED");
                    } else {
                        call.reject(message(result, "Google Play could not open the purchase."), String.valueOf(result.getResponseCode()));
                    }
                }
            });
        });
    }

    /** Purchases Google Play currently has for this Google account. */
    @PluginMethod
    public void queryPurchases(PluginCall call) {
        connected(call, () -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (subsResult, subs) -> billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (onceResult, once) -> {
                    List<Purchase> all = new ArrayList<>(subs);
                    all.addAll(once);
                    call.resolve(purchasesResponse(all));
                })));
    }

    private static JSObject purchasesResponse(List<Purchase> purchases) {
        JSArray list = new JSArray();
        if (purchases != null) {
            for (Purchase purchase : purchases) {
                for (String productId : purchase.getProducts()) {
                    JSObject item = new JSObject();
                    item.put("productId", productId);
                    item.put("productType", LIFETIME.equals(productId) ? "inapp" : "subs");
                    item.put("purchaseToken", purchase.getPurchaseToken());
                    item.put("pending", purchase.getPurchaseState() == Purchase.PurchaseState.PENDING);
                    list.put(item);
                }
            }
        }
        JSObject response = new JSObject();
        response.put("purchases", list);
        return response;
    }
}
