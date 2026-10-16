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
await cloud.requestPasswordResetCode(fakeUser.email);
assert.equal(calls.at(-1).method, 'POST');
assert.match(calls.at(-1).url, /\/auth\/v1\/recover/);
await cloud.resetPasswordWithCode(fakeUser.email,'123456','secure-new-password');
assert.match(calls.at(-2).url, /\/auth\/v1\/verify/);
assert.equal(JSON.parse(calls.at(-2).body).type, 'recovery');
assert.match(calls.at(-1).url, /\/auth\/v1\/user/);
assert.equal(calls.at(-1).method, 'PUT');
assert.equal(cloud.getCloudSession(),null);

const signedIn = await cloud.signInWithEmail(fakeUser.email,'test-password');
assert.equal(signedIn.user.id, fakeUser.id);
assert.ok(cloud.getCloudSession());
calls = [];
await cloud.deleteCloudAccount('test-password','DELETE');
assert.ok(calls.some(c => c.url.includes('/auth/v1/user')));
const deletionCall = calls.find(c => c.url.includes('/functions/v1/axis-test-delete-account'));
assert.ok(deletionCall);
assert.equal(JSON.parse(deletionCall.body).confirm,'DELETE');
assert.equal(cloud.getCloudSession(),null);

console.log('Isolated auth, password recovery, protected deletion request, and Pro-lock regression checks passed.');
