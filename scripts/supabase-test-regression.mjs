import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Network is mocked: no real test account, cloud model, or production service is touched.
const src = readFileSync('src/lib/supabaseTest.js','utf8');
const deletion = readFileSync('supabase/functions/axis-test-delete-account/index.ts','utf8');
const pro = readFileSync('src/lib/ProAccessContext.jsx','utf8');
const main = readFileSync('src/App.jsx','utf8');
assert.doesNotMatch(src, /SERVICE_ROLE_KEY|service_role/i, 'Never embed admin credentials in the app.');
assert.match(pro, /isPro:\s*false/, 'Pro must stay locked until trusted billing verification exists.');
assert.match(deletion, /credentials\.user\?\.id !== user\.id/, 'Deletion must independently verify account ownership.');
assert.match(deletion, /body\.confirm !== "DELETE"/, 'Deletion must require explicit confirmation.');
assert.match(deletion, /\/auth\/v1\/admin\/users\//, 'Deletion should use the server-side admin API.');
assert.match(main, /PasswordRecovery/);
assert.match(main, /AccountDeletion/);
const cloudPage = readFileSync('src/pages/Cloud.jsx','utf8');
const recoveryPage = readFileSync('src/pages/PasswordRecovery.jsx','utf8');
assert.match(cloudPage, /open the confirmation link/, 'Default signup email links must be supported');
assert.doesNotMatch(cloudPage, /Six-digit email code/, 'Do not prompt for a code absent from default templates');
assert.match(recoveryPage, /Copy link address/, 'Recovery UI must explain how to copy default email links');
assert.doesNotMatch(recoveryPage, /six-digit code/i, 'Default recovery email does not include an OTP code');


const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
let calls = [];
const response = data => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => data,
});
const fakeUser = { id: '55a6d81e-2c70-4b58-b4f9-3d5c2d9fc111', email: 'offline-test@example.invalid' };
const tokens = { user: fakeUser, access_token: 'fake-jwt', refresh_token: 'fake-refresh', expires_in: 3600 };
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, ...options });
  if (url.includes('/auth/v1/verify')) return response(tokens);
  if (url.includes('/auth/v1/token?grant_type=password')) return response(tokens);
  if (url.includes('/auth/v1/user') && (options.method || 'GET') === 'GET') return response(fakeUser);
  if (url.includes('/functions/v1/axis-test-delete-account')) return response({ message: 'Test account deleted.' });
  return response({});
};

const cloud = await import('../src/lib/supabaseTest.js');
await cloud.requestPasswordResetEmail(fakeUser.email);
assert.equal(calls.at(-1).method, 'POST');
assert.match(calls.at(-1).url, /\/auth\/v1\/recover/);

const tokenHash = 'a'.repeat(64);
const validLink = 'https://zjlrwjxolxorrxpolcdf.supabase.co/auth/v1/verify?type=recovery&token=' + tokenHash + '&redirect_to=https%3A%2F%2Fexample.invalid';
const beforeBadLinks = calls.length;
assert.equal(cloud.parseRecoveryEmailLink(validLink), tokenHash);
for (const link of [
  'https://evil.invalid/auth/v1/verify?type=recovery&token=' + tokenHash,
  'http://zjlrwjxolxorrxpolcdf.supabase.co/auth/v1/verify?type=recovery&token=' + tokenHash,
  'https://zjlrwjxolxorrxpolcdf.supabase.co/auth/v1/other?type=recovery&token=' + tokenHash,
  'https://zjlrwjxolxorrxpolcdf.supabase.co/auth/v1/verify?type=email&token=' + tokenHash,
  'https://zjlrwjxolxorrxpolcdf.supabase.co/auth/v1/verify?type=recovery&token=',
  'https://zjlrwjxolxorrxpolcdf.supabase.co/auth/v1/verify?type=recovery&token=' + tokenHash + '&token=' + tokenHash,
  'not an email link',
]) {
  assert.throws(() => cloud.parseRecoveryEmailLink(link), Error, 'Malformed or other-project recovery links must be rejected');
}
await assert.rejects(
  cloud.resetPasswordWithEmailLink(fakeUser.email, 'https://evil.invalid/?token=' + tokenHash, 'secure-new-password'),
  /not an Axis 3D Test/,
);
assert.equal(calls.length, beforeBadLinks, 'Invalid links cannot trigger any network activity');

await cloud.resetPasswordWithEmailLink(fakeUser.email, validLink, 'secure-new-password');
assert.match(calls.at(-2).url, /\/auth\/v1\/verify/);
assert.deepEqual(JSON.parse(calls.at(-2).body), { token_hash: tokenHash, type: 'recovery' });
assert.match(calls.at(-1).url, /\/auth\/v1\/user/);
assert.equal(calls.at(-1).method, 'PUT');
assert.equal(cloud.getCloudSession(), null, 'Recovery must not grant persistent login or Pro privileges');

const signedIn = await cloud.signInWithEmail(fakeUser.email,'test-password');
assert.equal(signedIn.user.id, fakeUser.id);
assert.ok(cloud.getCloudSession());
calls = [];
await cloud.deleteCloudAccount('test-password','DELETE');
const deletionCall = calls.find(c => c.url.includes('/functions/v1/axis-test-delete-account'));
assert.ok(deletionCall);
assert.match(deletionCall.headers.Authorization, /^Bearer /, 'Deletion must forward an authenticated token.');
assert.equal(deletionCall.method, 'POST');
assert.equal(JSON.parse(deletionCall.body).confirm,'DELETE');
assert.equal(cloud.getCloudSession(),null);

console.log('Default email-link recovery (with origin and token checks), protected deletion, and Pro-lock regression checks passed.');
