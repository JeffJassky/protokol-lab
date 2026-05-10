---
title: Security & data handling
description: How your data is stored, protected, and what we do (and don't do) with it.
category: account
last_reviewed: 2026-05-10
---

# Security & data handling

This page is the technical version of "is my data safe." If you want the privacy policy in legal language, that's at the privacy page link in the app footer. Here's the engineering reality.

## Where your data lives

- **Database**: MongoDB Atlas (managed cloud), encrypted at rest with AWS KMS.
- **Photos and media**: object storage (DigitalOcean Spaces / S3-compatible), encrypted at rest.
- **Backups**: daily automated, retained 30 days, encrypted.
- **Application servers**: managed compute (DigitalOcean App Platform / Heroku), in US-East region.

All data is in one geographic region (US). We don't replicate across regions.

## Encryption

- **In transit**: HTTPS everywhere, TLS 1.2+. No HTTP fallback.
- **At rest**: database and object storage are encrypted at the disk / blob level.
- **Application-level**: bloodwork and genetics fields are stored as opaque values in the user's settings document. Not separately encrypted at the field level (the disk encryption is the layer).

We do **not** end-to-end encrypt your data with a key only you hold. That's a real tradeoff: it would prevent us from running the simulation, the AI assistant, or pattern insights. The honest framing: your data is encrypted on the server, the server can read it (because it has to compute on it), and we trust our infrastructure access controls.

## Authentication

- **Passwords**: bcrypt-hashed with a per-user salt. We never see your plaintext.
- **Session tokens**: JWT in HTTP-only cookies, rotated on auth events.
- **Apple Sign-In**: identity tokens verified against Apple's JWKS (public-key signature check) before account creation or login.
- **Google OAuth**: standard OAuth 2.0 flow with our verified client.
- **Password reset tokens**: single-use, 1-hour expiry, stored hashed.

There's no 2FA in-app today. Apple and Google sign-in inherit 2FA from those providers if you've set it up there.

## Access controls

- Production database access is gated to a small engineering team via IAM with audit logging.
- Routine application code does not have ad-hoc query access — all data access goes through the application's request handlers, which scope queries by user ID.
- Customer support cannot read your bloodwork, photos, or chat history without escalation. They can see account-level info (email, plan, signup date) for ticket resolution.

## What we do with your data

- **Compute on it** for your benefit: simulation, insights, AI responses.
- **Display it back to you** in the UI.
- **Include it in your exports** when you request one.
- **Use anonymized aggregate metrics** for product analytics (event counts, feature usage, performance) — not joinable to your identity.

## What we don't do

- **Sell to advertisers, marketers, insurers, or data brokers.** Ever.
- **Use your data for AI model training.** Not by us, not by Google (per their API terms).
- **Share with researchers** without explicit per-user opt-in (which doesn't exist as a feature).
- **Cross-reference accounts** to build behavioral profiles.

## Third-party services

We use:

- **MongoDB Atlas** — database hosting.
- **DigitalOcean / Heroku** — application servers.
- **Stripe** — payment processing. Card details go to Stripe; we get a customer ID, not the card.
- **Google (Gemini API)** — AI inference. See [AI privacy](/ai/privacy).
- **SendGrid** — transactional email (welcome, reset, deletion confirmation).
- **Sentry** — error tracking. Stack traces are stored; PII in the stack trace is best-effort scrubbed.
- **Apple / Google identity providers** — sign-in.

Each is bound by a data processing agreement (DPA).

## Data residency

US only. We don't currently offer EU or other regional data residency. If your jurisdiction requires it, we may not be the right product for you.

## Incident response

If we discover a security incident:

1. **Investigate** the scope and impact.
2. **Contain** within hours.
3. **Notify** affected users by email within 72 hours of confirmation.
4. **Disclose** publicly when investigation is complete and remediation is in place.

We've not had a notifiable breach to date.

## Your rights

If you're in the EU/UK (GDPR), California (CCPA), or other jurisdictions with data subject rights:

- **Access** — your data export (JSON or CSV) satisfies access requests.
- **Deletion** — the in-app account deletion flow satisfies erasure requests.
- **Correction** — edit any data directly in the app.
- **Portability** — JSON export is portable.
- **Opt-out of sale** — N/A (we don't sell data).

If you can't perform any of these in-app, [open a support ticket](https://protokollab.com/support) with your request and we'll handle within applicable statutory timelines.

## Account compromise

If you suspect your account is compromised:

1. **Sign in** if possible. Profile → Account → Sign out all sessions.
2. **Change your password** (or rotate the linked Apple / Google account).
3. **Email support** if you can't access the account.

We can lock and reset access if you've lost access to your sign-in method.

## Things you can do

- Use a unique strong password (or rely on Apple / Google with 2FA enabled).
- Don't share screenshots of your account in places that include your email.
- Sign out from shared devices.
- Periodically review Profile → Account for unfamiliar sessions or sign-in methods.

## Open questions / honest disclosures

- **Field-level encryption for bloodwork / genetics**: not implemented today. We rely on disk-level encryption + access controls. Roadmap-able if there's demand.
- **End-to-end encryption with user-held keys**: not implemented. Would prevent server-side AI / simulation.
- **Cross-region failover**: not configured. A US-East outage takes the app offline until it recovers.
- **HIPAA compliance**: not certified. The app is not a covered entity. If you need a HIPAA-compliant service, this isn't it.

## Related

- [Privacy & what AI sees](/ai/privacy) — AI-specific data handling.
- [Export your data](/account/export) — get your data out.
- [Delete your account](/account/delete) — for permanent removal.
