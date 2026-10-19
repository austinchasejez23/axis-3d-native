import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const bannedPackages = ['@base44/sdk', '@base44/vite-plugin', '@stripe/react-stripe-js', '@stripe/stripe-js'];
for (const name of bannedPackages) {
  assert.equal(pkg.dependencies?.[name], undefined, name + ' remains in dependencies');
  assert.equal(lock.packages?.['']?.dependencies?.[name], undefined, name + ' remains in lock root');
}
for (const name of Object.keys(lock.packages || {})) {
  assert.doesNotMatch(name, /^node_modules\/@base44(?:\/|$)/, 'Base44 package remains in lock');
}
function walk(path) {
  for (const item of readdirSync(path)) {
    const file = join(path, item);
    if (statSync(file).isDirectory()) walk(file);
    else if (/\.(jsx?|tsx?)$/.test(item)) {
      const content = read(file);
      assert.doesNotMatch(content, /@base44|base44Client|base44:runtime|media\.base44\.com|\/api\/apps\//i, file + ' uses the retired backend');
    }
  }
}
walk('src');
const cap = JSON.parse(read('capacitor.config.json'));
assert.equal(cap.appId, 'com.base6a5340f43f8fd031c5921680.app');
assert.match(read('android/app/build.gradle'), /applicationId "com\.base6a5340f43f8fd031c5921680\.app"/);
assert.match(read('src/lib/ProAccessContext.jsx'), /isPro:\s*false/);
assert.match(read('src/lib/projectStore.js'), /indexedDB\.open/);
assert.match(read('src/lib/storage.js'), /forge3d_projects/);
assert.match(read('src/pages/Splash.jsx'), /navigate\('\/library'/);
const splash = read('src/pages/Splash.jsx');
assert.match(splash, /setTimeout\(\(\) => setVideoEnded\(true\), MAX_SPLASH_MS\)/,
  'Android video playback must have a bounded splash fallback');
assert.match(splash, /onError=\{\(\) => setVideoEnded\(true\)\}/,
  'Video decoding failure must not strand the user');
const nativeMain = read('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/MainActivity.java');
const nativeFilePlugin = read('android/app/src/main/java/com/base6a5340f43f8fd031c5921680/app/AxisFilesPlugin.java');
const exporter = read('src/lib/exporters.js');
assert.match(nativeMain, /registerPlugin\(AxisFilesPlugin\.class\)/);
assert.match(nativeFilePlugin, /Intent\.ACTION_CREATE_DOCUMENT/,
  'Native Android must use the system Save As dialog');
assert.match(nativeFilePlugin, /openOutputStream\(uri, "w"\)/,
  'Native Android must actually write model bytes to a user-chosen document');
assert.match(exporter, /AxisFiles\.saveFile\(/);
assert.match(exporter, /return 'saved'/);
assert.doesNotMatch(read('vite.config.js'), /@base44/);
console.log('Standalone isolation, Free entitlement, package ID and local storage checks passed.');
