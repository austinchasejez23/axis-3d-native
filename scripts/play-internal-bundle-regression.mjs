import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const workflow = readFileSync('.github/workflows/axis-play-internal-bundle.yml', 'utf8');
const client = readFileSync('src/lib/ProAccessContext.jsx', 'utf8');
const plugin = readFileSync('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/AxisPlayBillingPlugin.java', 'utf8');

assert.match(gradle, /applicationId "com\.base6a5340f43f8fd031c5921680\.app"/,
  'The internal Play candidate must use the existing Play Console package.');
assert.match(gradle, /applicationIdSuffix "\.debug"/,
  'Regular standalone APK must keep a separate package ID.');
assert.match(gradle, /axisPlayInternalVersionCode/,
  'Play internal version code must be supplied without changing default debug version.');
assert.match(gradle, /com\.android\.billingclient:billing:9\.1\.0/,
  'Bundle must contain the official Billing SDK, not only a permission.');
assert.match(manifest, /com\.android\.vending\.BILLING/,
  'Billing permission must appear in the merged package.');
assert.match(workflow, /bundleRelease/,
  'Build an AAB for the original package, not debug APK.');
assert.match(workflow, /AXIS_PLAY_INTERNAL_VERSION_CODE/,
  'Do not invent an upload version code.');
assert.match(workflow, /AXIS_PLAY_EXPECTED_UPLOAD_CERT_SHA256/,
  'Refuse an unknown Play signing identity.');
for (const secret of ['AXIS_PLAY_UPLOAD_KEYSTORE_BASE64','AXIS_PLAY_UPLOAD_STORE_PASSWORD','AXIS_PLAY_UPLOAD_KEY_ALIAS','AXIS_PLAY_UPLOAD_KEY_PASSWORD']) {
  assert.match(workflow, new RegExp('secrets\\.' + secret), 'Missing upload-key secret ' + secret);
}
assert.match(workflow, /AXIS_PLAY_SIGN_CANDIDATE == 'true'/,
  'Signed review artifact must require explicit configuration.');
assert.match(workflow, /jarsigner -verify/,
  'Must verify AAB signature before distributing review artifact.');
assert.doesNotMatch(workflow, /r0ad|google-github-actions\/upload-google-play|fastlane supply|gradle-play-publisher|play\/edits\/commit|publishRelease/,
  'Never upload to Play or publish a release from this workflow.');
assert.doesNotMatch(workflow, /AXIS_TEST_KEYSTORE_BASE64/,
  'Never reuse the standalone DEBUG signer for Play.');
assert.match(workflow, /No Google Play upload/);
assert.match(client, /isPro:\s*false/,
  'No unrestricted Pro.');
assert.doesNotMatch(plugin, /\.launchBillingFlow\s*\(/,
  'Do not start purchases while server verification is incomplete.');
console.log('Play internal AAB preparation: original package, billing SDK, real upload key gate, no publishing and locked Pro verified.');
