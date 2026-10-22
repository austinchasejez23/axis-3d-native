// Isolated, test-only Supabase integration. No privileged credentials in the app.
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

// Lets Pro access follow sign-in and sign-out without a reload.
function announceSession() {
  try { window.dispatchEvent(new Event('axis-cloud-session')); } catch { /* not in a browser */ }
}

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
  const changedUser = readSession()?.user?.id !== session.user.id;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (changedUser) announceSession();
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
  announceSession();
  if (session) {
    try { await request('/auth/v1/logout', { token: session.access_token, method: 'POST' }); }
    catch { /* Local sign-out must still work without a connection. */ }
  }
}


// Supabase's unmodified default emails contain confirmation / recovery LINKS,
// not the optional {{ .Token }} code. Signup is confirmed in the user's browser,
// after which they sign in normally. Password recovery works with a copied link,
// so no custom SMTP, redirect allowlist, or Android URI handler is required.
export async function requestPasswordResetEmail(email) {
  await request('/auth/v1/recover', {
    method: 'POST', body: { email: email.trim() },
  });
}

// Accept only an ORIGINAL recovery link for this isolated Axis TEST project.
// Never fetch or navigate to arbitrary user-supplied links; only send the token
// hash to our own Supabase Auth endpoint over HTTPS.
export function parseRecoveryEmailLink(link) {
  if (typeof link !== 'string' || link.trim().length > 8192) {
    throw new Error('Paste the complete reset link from the email.');
  }
  let parsed;
  try { parsed = new globalThis.URL(link.trim()); }
  catch { throw new Error('Paste the complete reset link from the email.'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== URL || parsed.pathname !== '/auth/v1/verify') {
    throw new Error('This is not an Axis 3D Test password-reset link.');
  }
  if (parsed.searchParams.getAll('type').length !== 1 || parsed.searchParams.get('type') !== 'recovery') {
    throw new Error('This link is not for password recovery.');
  }
  const tokens = parsed.searchParams.getAll('token');
  if (tokens.length !== 1 || !/^[a-zA-Z0-9_-]{16,512}$/.test(tokens[0])) {
    throw new Error('The reset link is incomplete or invalid.');
  }
  return tokens[0];
}

export async function resetPasswordWithEmailLink(email, link, newPassword) {
  if (newPassword.length < 8) throw new Error('Your new password must contain at least 8 characters.');
  const token_hash = parseRecoveryEmailLink(link);
  const verification = await request('/auth/v1/verify', {
    method: 'POST', body: { token_hash, type: 'recovery' },
  });
  if (!verification.access_token || !verification.user?.id || !verification.user.email) {
    throw new Error('The recovery link did not return a valid account session.');
  }
  if (verification.user.email.toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error('That reset link belongs to a different account email. Request a new link for the email entered above.');
  }
  await request('/auth/v1/user', {
    method: 'PUT', token: verification.access_token, body: { password: newPassword },
  });
  // Recovery tokens never become the app's normal sign-in session.
  // An existing cloud session is cleared only after a successful password change.
  localStorage.removeItem(SESSION_KEY);
}

export async function deleteCloudAccount(password, confirmation) {
  if (confirmation !== 'DELETE' || !password) throw new Error('Enter your current password and type DELETE.');
  // The Edge Function independently verifies the JWT and the current password.
  const result = await cloudRequest('/functions/v1/axis-test-delete-account', {
    method: 'POST', body: { password, confirm: confirmation },
  });
  localStorage.removeItem(SESSION_KEY);
  return result;
}
