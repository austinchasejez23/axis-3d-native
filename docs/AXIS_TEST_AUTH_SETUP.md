# Axis 3D Test authentication and recovery checklist

Applies ONLY to the isolated **Axis 3D Test** Supabase project, not production Axis.

## Default Supabase emails (no SMTP setup)

Supabase's default built-in templates send clickable confirmation and recovery **links**. On the user's test project's free configuration, email template editing requires custom SMTP; **do not configure SMTP solely for testing**.

The test APK supports those unmodified templates:

- **Sign up:** Create a TEST account in Axis > Cloud. Open the confirmation link from your email in a browser. Return to Axis and sign in with the email and original password. You may see a generic redirect page after confirming; login in Axis still happens separately.
- **Forgot password:** In Axis > Cloud > Forgot password, enter the test-account email and request a reset. In the email, **long press** the password-reset link and select **Copy link address**. **Do not open it first**; visiting the link consumes the one-time token. Return to Axis and paste the link into the reset form, enter a new password of at least 8 characters and submit. After a successful reset, sign in with the new password.
- The pasted link must be an HTTPS URL for the exact isolated test Supabase host, with path `/auth/v1/verify`, `type=recovery`, and a valid `token` hash. Axis never navigates to arbitrary pasted links. The recovery verification session is used only to update the password and is not saved as a cloud login.
- Expired or previously visited links must be re-requested. Default email rate limits apply. Test the flow on disposable test credentials before relying on it.
- **No Android package ID, Supabase SMTP settings, Site URL, redirect allowlist, or production app modifications are needed for this copy-link fallback.** This is a deliberate manual fallback; an automatic app-link flow requires further isolated redirect configuration and device tests.

## Test plan

- Confirm a **disposable** test account via the default email link and sign in.
- Sign out, copy (do not open) the default password-recovery email link into Axis, update the password, then sign in using the new password.
- Keep the existing account and backed-up model intact. For additional backup tests, create a *throwaway* model and back it up, restore it, inspect geometry and reference images.
- Test account deletion only with a brand-new throwaway account and explicitly approved test data; never delete the existing user's account.
- With two disposable test accounts, test that neither can see, restore, modify, or delete the other's backups or Pro entitlement.
- Keep purchases and Pro access disabled until Play purchases are server-verified.

## Remaining before production

- Improve the UX to launch and securely return from email links directly to the Android app, including redirect allowlist and installed-app verification.
- Configure production-quality SMTP and email deliverability when ready to serve real users.
- Finish end-to-end signup, recovery, cross-account RLS, and deletion tests on disposable accounts.
- Enable leaked-password protection if available.
- Implement Google Play Billing token verification on a trusted server, RTDN/refunds/renewals and authenticated entitlements before enabling Pro.
- Fix pre-existing modeling and TypeScript errors without bypassing tests or merging unreviewed work.
