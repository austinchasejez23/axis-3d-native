# Axis 3D Test authentication checklist

This document applies ONLY to the **Axis 3D Test** Supabase project. Do not change production Axis.

## Email templates needed for the new Android code-based flows

The test APK does **not** handle a web link redirect or Android app-link callback. It verifies a six-digit code INSIDE the app.

In Supabase > Axis 3D Test > Authentication > Email Templates:

1. Open **Confirm signup**. Replace its body with:

```html
<h2>Confirm your Axis 3D Test account</h2>
<p>Enter this code in the Axis app:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not create this account, ignore this message.</p>
```

2. Open **Reset password**. Replace its body with:

```html
<h2>Reset your Axis 3D Test password</h2>
<p>Enter this code in the Axis app:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request a reset, ignore this message.</p>
```

Do not include `{{ .ConfirmationURL }}` in these test templates; that uses the default localhost redirect instead of the in-app code.

Supabase sends these codes with standard rate limits and expiry. Request a fresh code if it expires.

## Test plan

- Create a **separate test account**, confirm using the email code, sign in.
- Sign out and request a password reset, enter code and a new password, then sign in with the new password.
- Create a **throwaway** model and back it up, then restore it. Check geometry, settings, and reference images.
- On the throwaway account ONLY, enter current password and type DELETE, approve the confirmation, and verify both Auth user and backup files disappeared. Local models must remain.
- Use a second test account to prove it cannot view, restore, modify, or delete another account's backups or Pro entitlement.
- Keep production Pro/checkout disabled until verified Google Play purchases and server-validated entitlements are implemented.

## Remaining before production

- Email delivery through a production SMTP provider and appropriate rate limits.
- Security policies, cross-account tests, account deletion integration tests, and recovery UX/device tests.
- Enable leaked-password protection if the Supabase plan allows it.
- Implement Google Play Billing purchase-token verification by a trusted server, a verified webhook/RTDN listener, renewals/refunds/cancellations, and an authenticated entitlement response. No test account currently has Pro privileges.
- Fix pre-existing modeling/typecheck regressions separately. Do not hide them or auto-merge either PR.
