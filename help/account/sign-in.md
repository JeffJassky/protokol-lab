---
title: Sign in & sign up
description: Email, Apple, Google — how each works and which to pick.
category: account
last_reviewed: 2026-05-10
---

# Sign in & sign up

Three ways to create or access your account. Pick the one that fits your privacy and convenience preferences.

## Sign-in methods

### Email + password

Classic credentials. Email + password set during sign-up, with bcrypt hashing on our end.

When to pick:

- You don't use Apple or Google for everything.
- You want a separate password not tied to a third-party account.
- You're using a shared device and don't want OS-level sign-in convenience.

Forgot password recovery available — see below.

### Sign in with Apple

Native to iOS, also works on macOS Safari and the iOS app.

When to pick:

- You're on iPhone / iPad / Mac and use Apple ID for everything.
- You want **email relay** (Apple gives us a `@privaterelay.appleid.com` proxy email; your real email never reaches us).
- You want Face ID / Touch ID convenience.

What we get from Apple:

- A unique `appleId` for your account.
- An email address (real, or relay).
- Optionally your name (only on first sign-in).

Apple Sign-In is supported on the iOS app and on `https://protokollab.com` in Safari.

::: warning Post-revoke caveat
If you revoke Apple Sign-In access from Apple's side and try to sign in again, Apple may not return any email. We can't reliably re-link the account in that case. If this happens, [open a support ticket](https://protokollab.com/support) and we'll merge manually.
:::

### Sign in with Google

OAuth with Google. Works in any browser and the iOS app.

When to pick:

- You use Gmail / Google as your main identity.
- You want password-less sign-in across devices.
- You're on Android (where Apple Sign-In isn't an option).

What we get from Google:

- Your Gmail address.
- Your Google name and profile picture (if available).

We **don't** get access to Drive, Calendar, Gmail content, or any other Google data.

## Account linking

If you've signed up with one method (say email) and then sign in with another (say Apple) using the same email address, the app links them — both methods now sign in to the same account.

If you sign up fresh with Apple (using a relay email), then later try to sign up with email at your real address, the two are separate accounts. To merge, contact support.

## Forgot password

Password sign-in only:

1. From the sign-in page, tap **Forgot password**.
2. Enter your email.
3. We email a reset link.
4. Click the link → set new password → done.

The reset link expires after 1 hour. If it expires, request a new one.

If you signed up with Apple or Google, there's no password to reset — just sign in via the same method.

## Two-factor authentication (2FA)

Not currently in the app. The Apple and Google sign-in flows benefit from those providers' built-in 2FA.

For email accounts, we strongly recommend a unique strong password.

## Switching sign-in methods

To add a new method to an existing account: sign in with the old method, then go to **Profile → Account → Add sign-in method**. Currently link new Apple or Google accounts; the linkage requires both emails to match exactly.

To remove a method: same path → **Remove**. We require at least one method remain (so you don't lock yourself out).

## Email change

Profile → Account → Change email. Verifies the new address before switching.

## Sessions

You stay signed in for 30 days of inactivity. Active use refreshes the session indefinitely.

To sign out everywhere (e.g., lost device): Profile → Account → Sign out all sessions.

## Common questions

**"Can I sign up without an email?"**
No. Even Apple Sign-In gives us a relay email; we use the email as your primary identifier.

**"What if Apple's email relay forwards stop working?"**
Apple maintains the relay. If you stop receiving emails (password reset, etc.), check Apple ID settings → Settings → Apple ID → Privacy. Re-enabling forwarding usually fixes it.

**"Can I delete my account from the sign-in screen?"**
No — you have to be signed in to delete. If you can't sign in, contact support.

**"Is my password sent securely?"**
HTTPS in transit, bcrypt-hashed at rest. We never see your plaintext password after the request.

## Related

- [Plans & billing](/account/plans) — managing your subscription.
- [Security & data handling](/account/security) — how your data is stored.
- [Delete your account](/account/delete) — for permanent removal.
