---
title: Delete your account
description: Permanently remove your account and all associated data.
category: account
last_reviewed: 2026-05-10
---

# Delete your account

Deletion is permanent. There is no undo. If you might want your data later, [export it first](/account/export).

## What gets deleted

Everything tied to your account:

- Profile, settings, targets.
- All food, dose, weight, body, symptom, photo, exercise, fasting, water, cycle, bloodwork, genetics, condition, journal, day-status, day-notes data.
- AI chat history and any insights generated about you.
- Saved meals, custom compounds, custom foods, favorites, recents.
- Push subscriptions on every device.
- Sign-in identity (email, Apple ID link, Google ID link).

What survives, by design:

- **Aggregated, anonymized analytics events** — these are not tied to your identity and cannot be re-linked to you.
- **Support tickets you filed** — retained per our support records policy. Personally identifiable parts can be redacted on request.
- **Stripe billing records** — invoices and payment records are retained per Stripe's policy and applicable financial regulations. Subscription is cancelled.

## How to delete

1. Open the app.
2. Go to **Profile → Settings → Account → Delete account**.
3. You'll see a confirmation screen listing what will be erased.
4. **If you signed up with email + password**: re-enter your password.
5. **If you signed up with Apple or Google**: tap to confirm.
6. Tap **Delete account permanently**.

A few seconds later, you're signed out and your account is gone.

You'll receive a confirmation email at the address on file.

## What happens immediately

- **Subscription cancelled** — if you're on a paid plan, billing stops at the end of the current cycle. No refund for the current period unless requested separately (see [Plans & billing](/account/plans)).
- **Access revoked** — your session is terminated; signing in with the same email no longer works.
- **Data cascade** — every record tied to your account is deleted, including chat threads, insights, and any cached simulation results.
- **Photos** — every image is removed from object storage.

## What if I change my mind?

Within the deletion confirmation flow: cancel the action.

After deletion: you can sign up with the same email again, but you'll start fresh. None of your prior data is recoverable.

## Common questions

**"Can support recover my deleted account?"**
No. The deletion is a real cascade, not a soft delete. Backups are retained for disaster recovery only and cannot be used for selective restore.

**"What if I just want to pause for a while?"**
You don't need to delete. Your account stays valid even if you don't open the app for months. Free tier doesn't expire. If you're on a paid plan, cancel the subscription (Profile → Plans → Cancel) without deleting — your data stays put and you can resume.

**"Will my data show up in any AI training?"**
No. Your logs are not used for model training, and the AI assistant has no recollection of your data after deletion (or after each chat session, since the assistant's context comes from your logs at request time).

**"What about data shared with my coach / partner / doctor?"**
The app does not have account sharing. If you've manually shared an export, those are separate copies you control.

## Privacy regulators

If you're in the EU/UK, California, or another jurisdiction with data-deletion rights, this in-app flow satisfies the deletion request. You don't need to open a separate ticket. Confirmation email is your proof.

If for any reason the in-app flow doesn't work, file a support ticket from **Profile → Support** with subject "Account deletion request." We'll process it within one business day.

## Next

- [Export your data](/account/export) — do this first if you want a copy.
- [Plans & billing](/account/plans) — for cancellation without deletion.
- [Security & data handling](/account/security) — how data is stored.
