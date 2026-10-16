import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

// Test the actual Edge Function with a fake GoTrue and Storage API.
// The production service and the user's account are never contacted.
const source = readFileSync('supabase/functions/axis-test-delete-account/index.ts', 'utf8')
  .replace(/^import "jsr:[^\n]+\n/m, '');
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });

const currentUser = '4f27f695-4d37-42b7-a22f-93e0e6cd3ac1';
const otherUser = 'b1a88513-5a37-4d21-8715-552ef1f9db12';
const password = 'test-current-password';
let handler;
globalThis.Deno = {
  env: { get: key => ({
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_ANON_KEY: 'test-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-server-secret',
  })[key] },
  serve: fn => { handler = fn; },
};
const asJSON = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
let objects = new Set();
let adminDeletes = [];
let storageDeletes = [];
let failStorage = false;
let authenticated = true;
let requestedPaths = [];
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  requestedPaths.push(path);
  if (path === '/auth/v1/user') {
    if (!authenticated || init.headers?.Authorization !== 'Bearer test-jwt') return asJSON({}, 401);
    return asJSON({ id: currentUser, email: 'axis-test@example.invalid' });
  }
  if (path === '/auth/v1/token' && new URL(url).searchParams.get('grant_type') === 'password') {
    const body = JSON.parse(init.body);
    if (body.password !== password) return asJSON({}, 403);
    return asJSON({ user: { id: currentUser } });
  }
  if (path === '/storage/v1/object/list/axis-model-backups') {
    assert.equal(init.headers.Authorization, 'Bearer test-server-secret');
    const prefix = JSON.parse(init.body).prefix;
    const listed = [...objects].filter(x => x.startsWith(prefix))
      .map(x => ({ name: x.slice(prefix.length), id: x })).slice(0, 100);
    return asJSON(listed);
  }
  if (path.startsWith('/storage/v1/object/axis-model-backups/')) {
    assert.equal(init.method, 'DELETE');
    assert.equal(init.headers.Authorization, 'Bearer test-server-secret');
    if (failStorage) return asJSON({}, 500);
    const storagePath = decodeURIComponent(path.split('/axis-model-backups/')[1]);
    storageDeletes.push(storagePath);
    if (!objects.has(storagePath)) return asJSON({}, 404);
    objects.delete(storagePath);
    return asJSON({});
  }
  if (path.startsWith('/auth/v1/admin/users/')) {
    assert.equal(init.method, 'DELETE');
    assert.equal(init.headers.Authorization, 'Bearer test-server-secret');
    adminDeletes.push(path);
    return asJSON({});
  }
  throw Error('Unexpected backend request: ' + path);
};
const url = 'data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64');
await import(url);
assert.equal(typeof handler, 'function');

const invoke = (token, payload) => handler(new Request('https://example.invalid/functions/v1/axis-test-delete-account', {
  method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {},
  body: JSON.stringify(payload),
}));

assert.equal((await invoke(null, { password, confirm: 'DELETE' })).status, 401);
assert.equal((await invoke('test-jwt', { password, confirm: 'NO' })).status, 400);
assert.equal((await invoke('test-jwt', { password: 'wrong', confirm: 'DELETE' })).status, 403);
assert.equal(adminDeletes.length, 0);
authenticated = false;
assert.equal((await invoke('test-jwt', { password, confirm: 'DELETE' })).status, 401);
authenticated = true;

objects = new Set([currentUser + '/keep.json', otherUser + '/private.json']);
failStorage = true;
assert.equal((await invoke('test-jwt', { password, confirm: 'DELETE' })).status, 503);
assert.equal(adminDeletes.length, 0, 'An account must not be deleted after a failed cloud cleanup');
assert(objects.has(currentUser + '/keep.json'));
failStorage = false;

objects = new Set([otherUser + '/private.json']);
for (let i = 0; i < 107; i++) objects.add(currentUser + '/' + i + '.json');
const result = await invoke('test-jwt', { password, confirm: 'DELETE', user_id: otherUser });
assert.equal(result.status, 200);
assert.equal(adminDeletes.length, 1);
assert(adminDeletes[0].endsWith('/' + currentUser), 'Must only delete authenticated user');
assert.equal(storageDeletes.filter(x => x.startsWith(currentUser)).length, 107);
assert(objects.has(otherUser + '/private.json'), 'Other users\' private backups cannot be deleted');
assert.equal([...objects].filter(x => x.startsWith(currentUser)).length, 0);
assert(!requestedPaths.some(x => x.includes(otherUser)), 'No other user's data may be requested');
console.log('Account deletion: auth, password, explicit confirmation, failure, pagination and user isolation passed.');
