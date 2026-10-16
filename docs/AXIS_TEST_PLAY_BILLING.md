# Axis 3D Test: Google Play Billing staging

This work is intentionally isolated to **Axis 3D Test** and draft PR #2, based on the standalone Base44-removal test branch, NOT `main`.

## What is implemented

- Google Play Billing Library **9.1.0** is linked into the Android test app.
- A Capacitor native bridge, `AxisPlayBilling.checkConnection()`, can connect to the Google Play Billing service from the Cloud page.
- The native plugin only reports connectivity. No product purchases, billing sheets, checkout, purchase token export, acknowledgement, subscription restoration or entitlement changes are implemented.
- A private `axis_google_play_receipts` database table exists in the **test** Supabase project. Purchase tokens are intended to be stored *only as a SHA-256 digest* to detect duplicate claims. No client role can access or modify that ledger.
- `axis_pro_entitlements` is still server-controlled and empty. The actual app context still returns `isPro: false` with Free-tier limits.
- CI rejects adding a client purchase launch/acknowledgement or unconditional Pro grants before verification is ready.

## Read-only verification staging (still OFF by default)

- `axis-test-play-verify` is an authenticated Supabase Edge Function for the **TEST** project. It validates the bearer token against Supabase Auth.
- It refuses to call Google unless server-only `AXIS_TEST_PLAY_VERIFY_ENABLED=true` AND `AXIS_TEST_PLAY_PRODUCTS` AND `AXIS_TEST_PLAY_SERVICE_ACCOUNT_JSON` are configured. Do **not** enable these until the Play Console catalog and restricted service account have been reviewed.
- The allowlist `AXIS_TEST_PLAY_PRODUCTS` uses comma-separated exact type/SKU tuples such as `subs:YOUR_REAL_SUBSCRIPTION_ID,inapp:YOUR_REAL_ONE_TIME_ID`. These are **examples of configuration format, not actual Axis SKUs**.
- The verifier exchanges the service-account signing key for a scoped Google OAuth token, then checks Google Android Publisher `purchases.subscriptionsv2.get` or `purchases.products.get` without any write actions.
- The pure `_shared/playPurchaseRules.mjs` denies unknown products and unauthorized states. `scripts/play-purchase-verifier-regression.mjs` covers inactive, pending, unacknowledged, mismatched, and expired purchases.
- **The verifier NEVER grants Pro, writes entitlements, records tokens, starts purchases, or acknowledges orders.** Even a good Google result is insufficient without one-user receipt binding, replay protection, ledger reconciliation, acknowledgement, RTDN, and revocation handling.
- Do not paste Play service account credentials into ChatGPT, source files or the Android app. Store them as encrypted Supabase secrets when configuration is approved.

## Important package distinction

The debug APK has `applicationIdSuffix ".debug"`; its installed package is `com.base6a5340f43f8fd031c5921680.app.debug`, while the production Play listing is `com.base6a5340f43f8fd031c5921680.app`.

This avoids overwriting your existing production Axis installation. It also means the debug APK **cannot validate real Play products for the production package**. Google license-tester sideload exemptions still require the package name to match the Play Console listing.

The connectivity probe only tests BillingClient integration and Google Play service availability. A green status is NOT purchase verification.

For real sandbox purchase testing later, use a Play Console internal-testing build matching the existing package, and eligible license testers. **Do not publish or upload that build until explicitly approved.** Alternatively register a separate test-only Play listing matching the debug package, if desired.

## Requirements BEFORE enabling billing

1. Obtain the exact **Google Play Console product IDs** (not guessed IDs), product types, subscription base plans and eligible offer tokens. Identify monthly, annual, and any lifetime one-time purchase only if actually configured in Play.
2. Configure a Google Cloud service account with Android Publisher API and narrowly scoped Play Console permissions. Its private key goes into Supabase secrets, never source code, Android assets, JavaScript or GitHub.
3. Create a server-side purchase verification function. It must verify an authenticated Axis user, allowlisted package and product ID, token uniqueness and owner binding, Google Play Developer API purchase state, expiry, and linked token upgrades. Use subscriptionsv2 and the current products purchase API. Grant entitlements ONLY on verified `PURCHASED`, NEVER `PENDING`.
4. The backend must handle acknowledgement, renewal, cancellation, refunds/voided purchases and RTDN lifecycle events. Expired/refunded/canceled purchases must not keep Pro access indefinitely. Tests must cover retries, duplicate notifications and purchases made on another device.
5. Design secure restore-purchases behavior and account linking, especially if any original Base44/Stripe users or subscriptions must be honored.
6. Provide a Play Console license-testing track with the correct package name and tester accounts. Don't charge non-testers.
7. Review Google Play payment policies for distributing premium modeling tools. Do not silently replace existing Stripe entitlements.

Until these conditions are completed, **the Pay/Upgrade UI must remain disabled** and installing this APK must not change access to Pro.

Official guidance:
- https://developer.android.com/google/play/billing/integrate
- https://developer.android.com/google/play/billing/security
- https://developer.android.com/google/play/billing/test
- https://developer.android.com/google/play/billing/backend
- https://developer.android.com/google/play/billing/release-notes
