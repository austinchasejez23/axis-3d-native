import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { removeStripeCustomerData } from './stripeCleanup.ts';
import { getGoogleToken, revokeGoogleToken } from './googleCleanup.ts';

export default async function(req: Request): Promise<Response> {
  let stage = 'authentication';
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in before deleting your account.' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== 'DELETE_MY_ACCOUNT') {
      return Response.json({ error: 'Explicit account deletion confirmation is required.' }, { status: 400 });
    }
    // Identity and ownership always come from the session, never request IDs.
    stage = 'Google connection check';
    const googleToken = await getGoogleToken(base44, user.id, body.googleDisconnected === true);
    if (!googleToken && body.googleDisconnected !== true) {
      return Response.json({ code: 'GOOGLE_DISCONNECT_REQUIRED', error: 'Confirm that AXIS is disconnected from Google, or that you never connected Google.' }, { status: 409 });
    }
    stage = 'billing cleanup';
    await removeStripeCustomerData(secrets.get('STRIPE_SECRET_KEY'), secrets.get('BASE44_APP_ID'), user);
    stage = 'Google disconnect';
    await revokeGoogleToken(googleToken);
    stage = 'cloud backup record deletion';
    const projectIds = new Set();
    // Delete bounded batches until empty; do not use an offset after deletion.
    // Separate uploaded files require a supported storage erasure mechanism.
    while (true) {
      const backups = await base44.asServiceRole.entities.CloudBackup.filter({ created_by_id: user.id }, 'created_date', 100);
      if (!backups.length) break;
      for (const backup of backups) {
        projectIds.add(backup.project_id);
        await base44.asServiceRole.entities.CloudBackup.delete(backup.id);
      }
    }
    stage = 'account deletion';
    await base44.asServiceRole.entities.User.delete(user.id);
    return Response.json({ deleted: true, projectIds: [...projectIds], googleDisconnected: Boolean(googleToken) || body.googleDisconnected === true, storageFilesErased: false });
  } catch (error) {
    // Do not log tokens, payment information, or whole provider error objects.
    console.error('Account deletion stopped', { stage, status: error.status || error.response?.status || 500 });
    return Response.json({ error: `Deletion stopped during ${stage}. Earlier steps may have completed. Please retry or contact support.` }, { status: stage === 'authentication' ? 401 : 500 });
  }
}