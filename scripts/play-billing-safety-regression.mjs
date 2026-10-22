import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Purchases are on, but Pro may only ever come from the server, after Google
// confirms a payment. The phone never grants Pro or acknowledges an order.
const read = p => readFileSync(p, 'utf8');
const activity = read('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/MainActivity.java');
const plugin = read('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/AxisPlayBillingPlugin.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const gradle = read('android/app/build.gradle');
const purchases = read('src/lib/proPurchases.js');
const access = read('src/lib/ProAccessContext.jsx');
const server = read('supabase/functions/axis-play-purchase/index.ts');

assert.match(gradle, /com\.android\.billingclient:billing:9\.1\.0/);
assert.match(gradle, /applicationIdSuffix\s+"\.debug"/, 'Debug build must remain isolated from production');
assert.match(manifest, /com\.android\.vending\.BILLING/);
assert.match(activity, /registerPlugin\(AxisPlayBillingPlugin\.class\)/);
assert.match(plugin, /@CapacitorPlugin\(name = "AxisPlayBilling"\)/);
assert.match(plugin, /\.launchBillingFlow\s*\(/, 'Google payment sheet must open from the plugin');
assert.match(plugin, /setObfuscatedAccountId/, 'Purchases must carry the AXIS account they belong to');
assert.match(plugin, /"axis_pro"/);
assert.match(plugin, /"axis_pro_lifetime"/);
assert.doesNotMatch(plugin, /\.acknowledgePurchase\s*\(/, 'Only the server acknowledges, after verifying');
assert.doesNotMatch(plugin, /\.consumeAsync\s*\(/, 'Pro purchases are never consumed');

assert.doesNotMatch(purchases, /SERVICE_ROLE|service_role/i, 'No admin credentials in the app');
assert.match(purchases, /\/functions\/v1\/axis-play-purchase/);
assert.match(purchases, /axis_pro_entitlements/);
assert.doesNotMatch(access, /isPro:\s*true/, 'No unconditional Pro access');
assert.match(access, /readEntitlement/);
assert.match(access, /restorePurchases/);

assert.match(server, /\/auth\/v1\/user/, 'Server must identify the caller with Supabase Auth');
assert.match(server, /androidpublisher\.googleapis\.com/);
assert.match(server, /subscriptionsv2\/tokens\//);
assert.match(server, /:acknowledge/, 'Server acknowledges verified purchases');
assert.match(server, /belongs to a different AXIS account/, 'A purchase cannot unlock two accounts');
assert.match(server, /"subs:" \+ SUBSCRIPTION, "inapp:" \+ LIFETIME/, 'Only the two Pro products are accepted');
assert.match(server, /SUBSCRIPTION_STATE_EXPIRED/);
assert.match(server, /action === "refresh"/, 'Refunds and renewals are re-checked with Google');
console.log('Play purchases: Google sheet in app, verification, acknowledgement and Pro only on the server.');
