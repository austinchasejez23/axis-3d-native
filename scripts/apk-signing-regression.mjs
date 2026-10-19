import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const action = readFileSync('.github/workflows/standalone-checks.yml', 'utf8');

assert.match(gradle, /applicationIdSuffix\s+"\.debug"/, 'Keep .debug independent from production.');
assert.match(gradle, /applicationId "com\.base6a5340f43f8fd031c5921680\.app"/, 'Never change production app ID.');
assert.match(gradle, /signingConfig signingConfigs\.axisStableDebug/);
assert.match(gradle, /AXIS_TEST_KEYSTORE_PATH/);
for (const secret of ['AXIS_TEST_KEYSTORE_BASE64','AXIS_TEST_STORE_PASSWORD','AXIS_TEST_KEY_ALIAS','AXIS_TEST_KEY_PASSWORD']) {
  assert.match(action, new RegExp('secrets\\.' + secret), 'Missing signing secret ' + secret);
}
assert.match(action, /if: success\(\) && env\.AXIS_STABLE_DEBUG == 'true'/, 'Ephemeral-signed APKs must never be published.');
assert.match(action, /name: standalone-axis-stable-debug-apk/);
assert.doesNotMatch(action, /name: standalone-axis-debug-apk\s*\n\s*path:/);
assert(!existsSync('android/app/axis-test-debug.jks'), 'Private signing key must not be in repo.');
assert(!existsSync('android/app/axis-test-debug.p12'), 'Private signing key must not be in repo.');
console.log('Debug APK signing safety: permanent key required for publication; production ID and signing untouched.');
