// Isolated, test-only Supabase integration. No service_role key in the app.
// Auth is optional: local modeling and local saves must work offline.
const URL = 'https://zjlrwjxolxorrxpolcdf.supabase.co';
const KEY = 'sb_publishable_GZHhwBl_usG9461NYDHIuQ_5zkBqthr';
const SESSION_KEY = 'axis.test.supabase.session';
let refreshTask = null;

export const isCloudConfigured = Boolean(URL && KEY);

function readSession() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return data?.access_token && data?.refresh_token && data?.user?.id ? data : null;
  } catch { return null; }
}

export function getCloudSession() { return readSession(); }

function saveSession(payload, previous = null) {
  const session = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || previous?.refresh_token,
    user: payload.user || previous?.user,
    expires_at: Date.now() + Math.max(0, Number(payload.expires_in || 3600) - 30) * 1000,
  };
  if (!session.access_token || !session.refresh_token || !session.user?.id) {
    throw new Error('The server did not return a complete login session.');
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function errorMessage(body, status) {
  return body?.msg || body?.error_description || body?.message || body?.error || ('Request failed (' + status + ')');
}

/**
 * @param {string} path
 * @param {{ token?: string, method?: string, body?: any, headers?: Record<string,string>, raw?: boolean }} [options]
 */
async function request(path, { token, method = 'GET', body, headers = {}, raw = false } = {}) {
  let response;
  try {
    response = await fetch(URL + path, {
      method,
      headers: {
        apikey: KEY,
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : (body instanceof Blob || typeof body === 'string' ? body : JSON.stringify(body)),
    });
  } catch {
    throw new Error('Cannot reach the cloud. Local models are still available offline.');
  }
  if (raw && response.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new Error(errorMessage(result, response.status));
  return result;
}

export async function signUpWithEmail(email, password) {
  const result = await request('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password } });
  if (result?.access_token) return { session: saveSession(result), confirmationRequired: false };
  return { session: null, confirmationRequired: true };
}

export async function signInWithEmail(email, password) {
  return saveSession(await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: email.trim(), password },
  }));
}

async function accessSession() {
  const session = readSession();
  if (!session) throw new Error('Sign in to use private cloud backups.');
  if (session.expires_at > Date.now() + 60_000) return session;
  if (!refreshTask) {
    refreshTask = (async () => {
      try {
        const result = await request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', body: { refresh_token: session.refresh_token },
        });
        return saveSession(result, session);
      } catch (error) {
        // Network loss is not a reason to destroy a valid offline session.
        if (!String(error.message).includes('Cannot reach the cloud')) localStorage.removeItem(SESSION_KEY);
        throw error;
      }
    })().finally(() => { refreshTask = null; });
  }
  return refreshTask;
}

export async function getCloudIdentity() {
  const session = await accessSession();
  const user = await request('/auth/v1/user', { token: session.access_token });
  if (user?.id !== session.user.id) throw new Error('Account validation failed.');
  return user;
}

export async function cloudRequest(path, options = {}) {
  const session = await accessSession();
  return request(path, { ...options, token: session.access_token });
}

export async function signOutOfCloud() {
  const session = readSession();
  localStorage.removeItem(SESSION_KEY);
  if (session) {
    try { await request('/auth/v1/logout', { token: session.access_token, method: 'POST' }); }
    catch { /* Local sign-out must still work without a connection. */ }
  }
}
