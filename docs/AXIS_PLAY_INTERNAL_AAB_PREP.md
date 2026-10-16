# Axis 3D: INTERNAL Play Console billing-catalog AAB preparation

**Do not merge to main, upload to Play, or invite production users yet.** This branch and its workflow are a **preparation and inspection process only**. The original app stays live and unaffected.

## Why this is necessary

Play Console > Subscriptions displays **Upload a new APK**, rather than **Create subscription**, when the uploaded app version has not enabled Google Play Billing. The new Axis 3D test source links Google Play Billing Library 9.1.0 and explicitly declares `com.android.vending.BILLING`.

The current local TEST APK is `com.base6a5340f43f8fd031c5921680.app.debug`. **Do not upload this APK:** it differs from the original production Play listing.

The **release AAB** built from this branch uses the exact Play listing package: `com.base6a5340f43f8fd031c5921680.app`. This is why it must be treated as a potentially install-over-production build for any users enrolled in its testing track. Although this source keeps Pro disabled and cloud accounts isolated to Supabase TEST, it is not yet approved for real users.

## Current safe state

The isolated GitHub Actions workflow `.github/workflows/axis-play-internal-bundle.yml` runs on pushes to **only** `chore/play-internal-bundle-prep`. It builds a **release AAB unsigned** and checks the original package ID and merged BILLING permission. It **does not distribute the unsigned file** or upload anything to Google Play.

A signed review artifact is forbidden unless **all** of the following are provided on this test repository:

1. Confirm in Play Console > Test and release > App bundle explorer that the intended internal version code is **larger than EVERY version code already uploaded**. Set a GitHub Actions **repository variable** `AXIS_PLAY_INTERNAL_VERSION_CODE` to that code. It must be greater than the source default (25); do not assume 26 works.
2. Locate the existing **UPLOAD KEY certificate** SHA-256 fingerprint in Play Console (App integrity > App signing, or the current equivalent). It is NOT necessarily the Play **app-signing** certificate. Set repository variable `AXIS_PLAY_EXPECTED_UPLOAD_CERT_SHA256` to that fingerprint.
3. Only if the actual **existing Play upload keystore** and its password/alias are available, configure four GitHub Actions **repository secrets**:
   - `AXIS_PLAY_UPLOAD_KEYSTORE_BASE64`: base64 of the **real existing Play upload** .jks or .keystore file, not the Axis TEST .debug key.
   - `AXIS_PLAY_UPLOAD_STORE_PASSWORD`
   - `AXIS_PLAY_UPLOAD_KEY_ALIAS`
   - `AXIS_PLAY_UPLOAD_KEY_PASSWORD`
4. Only after independently reviewing the version code and upload certificate, set **repository variable** `AXIS_PLAY_SIGN_CANDIDATE` = `true` and rerun or retrigger the workflow on the **preparation branch**. The workflow refuses to sign if the certificate differs from the expected **upload** certificate, if secrets are absent or if the version code is invalid.

Never paste any passwords, keys or base64 keystore content into a chat, code file, GitHub issue or pull request. GitHub Actions secrets are the only designated signing-key destination in this process. If Base44 previously controlled the upload key and you don't have it, **stop**. First establish which upload key Play expects; a Play App Signing upload-key reset may be required. Do **not** generate a random replacement key or use the debug key and assume Google Play will accept it.

The workflow publishes `axis-play-internal-review-aab-DO-NOT-PUBLISH` **only after signature verification** and upload-certificate fingerprint matching. The workflow has no Play API credentials or Play upload action, so it cannot create a release.

## Required manual checks BEFORE approving upload

- Review the full migration app source and Play requirements. Pro/payment functions remain unavailable, and the Base44-independent cloud backend is still labeled TEST. A correctly signed AAB is not proof that the app is ready for production or safe for existing customers.
- Validate the app bundle contains Google Play Billing, is signed by the expected upload key, uses the exact Play Console package, has a unique/version code greater than all submitted builds, and targets Google's current Android API requirements.
- Prepare **Internal testing** in Play Console. Only designated license/tester accounts should opt in. An internal-track release can update the app installed by enrolled testers with the SAME production package ID, so avoid using a device holding irreplaceable production local models.
- Obtain explicit approval *before* any upload; manually upload from the Play Console website and keep the release in internal testing. Never promote automatically.
- After the Play Console recognizes the SDK, set up subscriptions and base plans **as drafts**, not automatically billed products.
- Neither signing nor uploading a billing-capable test AAB enables real checkout: the current Axis test app only probes BillingClient connection and has `isPro: false`. Server side `axis-test-play-verify` remains fail-closed and disabled.

## Existing inherited failures

The baseline repository contains known TypeScript and modeling regression failures. The new bundle workflow runs the mandatory standalone safety tests and a real Gradle Android release build; neither those inherited failures nor the production users are hidden or changed. Do not claim full functional certification based on an AAB build alone.
