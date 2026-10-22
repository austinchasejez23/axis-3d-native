import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectPlayPurchase } from '../supabase/functions/axis-test-play-verify/playPurchaseRules.mjs';

const time = Date.parse('2026-10-16T12:00:00Z');
const future = '2026-11-16T12:00:00Z';
const past = '2026-09-16T12:00:00Z';
const product = 'test_pro_monthly';
const subscription = {
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  lineItems: [{ productId: product, expiryTime: future }],
};
const check = (type, id, data) => inspectPlayPurchase(type, id, data, time);

assert.deepEqual(check('subs', product, subscription), {
  accepted: true, reason: 'google_subscription_active', expiry: new Date(future).toISOString(),
});
assert.equal(check('subs', product, { ...subscription, subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }).accepted, true);
for (const state of [
  'SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
]) {
  assert.equal(check('subs', product, { ...subscription, subscriptionState: state }).accepted, false, state);
}
assert.equal(check('subs', product, { ...subscription, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }).accepted, false);
assert.equal(check('subs', product, { ...subscription, lineItems: [{ productId: 'another_sku', expiryTime: future }] }).accepted, false);
assert.equal(check('subs', product, { ...subscription, lineItems: [{ productId: product, expiryTime: past }] }).accepted, false);
assert.equal(check('subs', product, { ...subscription, lineItems: [] }).accepted, false);
assert.equal(check('subs', product, { ...subscription, lineItems: [{ productId: product, expiryTime: 'garbage' }] }).accepted, false);

const inapp = { productId: 'test_pro_lifetime', purchaseState: 0, acknowledgementState: 1, consumptionState: 0 };
assert.equal(check('inapp', inapp.productId, inapp).accepted, true);
assert.equal(check('inapp', 'another_sku', inapp).accepted, false);
for (const invalid of [
  { ...inapp, purchaseState: 1 },
  { ...inapp, purchaseState: 2 },
  { ...inapp, acknowledgementState: 0 },
  { ...inapp, consumptionState: 1 },
  { ...inapp, purchaseState: undefined },
]) {
  assert.equal(check('inapp', inapp.productId, invalid).accepted, false);
}
assert.equal(check('unknown', product, inapp).accepted, false);
assert.equal(check('subs', product, null).accepted, false);

const api = readFileSync('supabase/functions/axis-test-play-verify/index.ts', 'utf8');
const client = readFileSync('src/lib/ProAccessContext.jsx', 'utf8');
const android = readFileSync('android/app/build.gradle', 'utf8');
assert.match(api, /AXIS_TEST_PLAY_VERIFY_ENABLED/);
assert.match(api, /=== "true"/);
assert.match(api, /AXIS_TEST_PLAY_PRODUCTS/);
assert.match(api, /AXIS_TEST_PLAY_SERVICE_ACCOUNT_JSON/);
assert.match(api, /\/auth\/v1\/user/, 'Must identify caller against Supabase Auth');
assert.match(api, /https:\/\/oauth2\.googleapis\.com\/token/);
assert.match(api, /androidpublisher\.googleapis\.com/);
assert.match(api, /subscriptionsv2\/tokens\//);
assert.match(api, /proGranted: false/, 'Read-only verifier must never unlock Pro');
assert.doesNotMatch(api, /\/rest\/v1\/axis_pro_entitlements/);
assert.doesNotMatch(api, /\/rest\/v1\/axis_google_play_receipts/);
assert.doesNotMatch(api, /POST.*acknowledge/);
assert.doesNotMatch(client, /isPro:\s*true/, 'Free tier stays enforced until the server confirms Pro');
assert.match(android, /applicationIdSuffix\s+"\.debug"/, 'Do not alter production package');
console.log('Play verification rule matrix and fail-closed staging checks passed. No Pro grant or receipt writes.');
