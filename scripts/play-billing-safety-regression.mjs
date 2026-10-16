import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const activity = read('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/MainActivity.java');
const plugin = read('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/AxisPlayBillingPlugin.java');
const gradle = read('android/app/build.gradle');
const bridge = read('src/lib/playBillingTest.js');
const access = read('src/lib/ProAccessContext.jsx');

assert.match(gradle, /com\.android\.billingclient:billing:9\.1\.0/);
assert.match(gradle, /applicationIdSuffix\s+"\.debug"/, 'Debug build must remain isolated from production');
assert.match(activity, /registerPlugin\(AxisPlayBillingPlugin\.class\)/);
assert.match(plugin, /@CapacitorPlugin\(name = "AxisPlayBilling"\)/);
assert.match(plugin, /\.setListener\(/);
assert.match(plugin, /enablePendingPurchases/);
assert.match(plugin, /purchasesEnabled", false/);
assert.match(plugin, /entitlementsEnabled", false/);
assert.doesNotMatch(plugin, /\.launchBillingFlow\s*\(/, 'Do not launch purchases without verified backend');
assert.doesNotMatch(plugin, /\.acknowledgePurchase\s*\(/, 'Do not acknowledge unverified orders');
assert.doesNotMatch(plugin, /\.consumeAsync\s*\(/);
assert.match(bridge, /registerPlugin\('AxisPlayBilling'\)/);
assert.match(bridge, /Capacitor\.isNativePlatform\(\)/);
assert.match(bridge, /purchasesEnabled:\s*false/);
assert.match(access, /isPro:\s*false/, 'No unconditional Pro access');
console.log('Play Billing native connection is read-only; checkout and Pro entitlement remain disabled.');
