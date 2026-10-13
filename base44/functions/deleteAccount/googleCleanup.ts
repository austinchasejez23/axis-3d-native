export async function getGoogleToken(base44, userId, manuallyDisconnected) {
  if (manuallyDisconnected) return null;
  try {
    const result = await base44.asServiceRole.sso.getAccessToken(userId);
    return typeof result === 'string' ? result : result?.access_token || null;
  } catch (error) {
    const status = error.status || error.response?.status;
    if ([400, 401, 404].includes(status)) return null;
    throw new Error('Google connection could not be checked. Please try again.');
  }
}

export async function revokeGoogleToken(token) {
  if (!token) return;
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    // An already-revoked token has no remaining access to remove.
    if (response.status === 400 && result.error === 'invalid_token') return;
    throw new Error('Google could not disconnect AXIS. Please try again.');
  }
}