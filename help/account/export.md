---
title: Export your data
description: How to get a full copy of everything you've logged.
category: account
last_reviewed: 2026-05-10
---

# Export your data

You own your data. You can request a full export at any time, with no paywall and no special process.

## What's in an export

A full export includes:

- **Identity**: account email, display name, sign-up date, plan tier.
- **Profile**: biological sex, age, height, current weight, goal weight, activity level, timezone, units.
- **Targets**: calorie + macro targets and their history.
- **Food**: every food log entry (date, time, meal, food item, serving count, macros, micros), saved meals, custom foods, favorites, recents.
- **Doses**: every dose log (compound, value, date), enabled compounds and their settings.
- **Body**: every weigh-in, waist measurement, custom measurements, body stats history.
- **Symptoms**: every symptom log (severity, date), enabled and custom symptoms.
- **Photos**: every progress photo (the image itself plus metadata: angle, date, notes).
- **Exercise**: every exercise log, custom exercises, energy mode setting.
- **Fasting**: schedule, every fasting event.
- **Water**: every water log entry.
- **Cycle**: menstruation settings and any logged events.
- **Bloodwork, genetics, conditions**: full panels you've entered.
- **Day notes / journal**: free-text entries.
- **Day status**: tracked/untracked overrides.
- **Insights & chat**: AI chat history, generated insights.

What's **not** included:

- Your password (we don't have it — we store a bcrypt hash).
- Any internal IDs you don't need.
- Aggregated analytics events (these are anonymized and not tied to you in the data warehouse).

## Formats

- **JSON** — complete, machine-readable, the canonical format. One zipped archive with a top-level file per data type plus an `images/` folder for photos.
- **CSV** — one CSV per data type, suitable for spreadsheet apps. Photos referenced by filename.

## How to request an export

1. Open the app.
2. Go to **Profile → Settings → Account → Export data**.
3. Pick **JSON** or **CSV** (or both).
4. Tap **Request export**.

You'll get the download link by email when it's ready (usually within a few minutes; large accounts can take longer).

::: tip Manual request
If the in-app export option isn't available, [open a support ticket](https://protokollab.com/support) — we can run the export manually within one business day.
:::

## How often can I export?

As often as you want. There's no limit and no charge. Many users export quarterly as a backup.

## Privacy of the export file

The download link is per-export, time-limited (24 hours), and tied to the email on your account. After 24 hours the file is purged from our servers — you keep your local copy.

If you've shared your account email with someone else (don't), they could intercept the link. Use a strong unique email password.

## Re-importing

Re-importing a previous export back into your account isn't supported — exports are read-only archives. If you need to migrate data between two accounts (e.g., merging a research account into your personal one), [open a support ticket](https://protokollab.com/support) and we'll handle it manually.

## Common questions

**"Why do I have to wait for an email instead of getting an instant download?"**
For a fresh account it's instant. For long-term users with thousands of food logs and hundreds of photos, the export is generated in the background so the request doesn't time out.

**"Can the AI export my data?"**
No — the AI assistant has read access to your data within the app, but cannot create export archives. Use the in-app or email path.

**"Will an export include data the AI generated about me?"**
Yes. Insights, chat threads, and any AI-written log entries are all yours and are included.

## Next

- [Delete your account](/account/delete) — different from export. Deletion is permanent.
- [Security & data handling](/account/security) — how your data is stored.
