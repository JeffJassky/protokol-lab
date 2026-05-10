---
title: Progress photos
description: Capture photos by angle, view a timeline, and compare two months side-by-side.
category: tracking
last_reviewed: 2026-05-10
---

# Progress photos

The scale is one signal. Photos are another, and often a more honest one — especially during recomp, when weight stays flat while body composition changes.

## What's tracked

Photos are organized by **photo type**. The app comes with three presets:

- **Front**
- **Side**
- **Back**

You can disable any preset and add custom types — see below.

## How to capture

1. Tap **Quick Log → Photos** (or the Log page's Photos section).
2. Pick a type (Front / Side / Back / your custom type).
3. Take a photo with the camera, or upload from your library.
4. Optionally add a note.
5. Save.

The photo stores against your account against today's date. Backdate by changing the date before saving.

## Best practices for usable progress photos

For the timeline to be honest:

- **Same lighting** — natural light is most consistent (a window in the morning).
- **Same distance** — a consistent landmark (foot placement on a tile, distance to the mirror).
- **Same clothes / undress** — anything is fine if consistent.
- **Same time of day** — body changes shape mildly across the day.
- **Same camera angle** — same height, same orientation.

A simple trick: tape a small mark on the floor where you stand. Same mark every time.

## Custom photo types

Three presets are usually enough, but custom types help for specific tracking:

- **Skin condition** — for tracking acne, eczema, or dermatology issues alongside compounds.
- **Injection site** — for tracking site reactions over weeks.
- **Outfit** — for tracking how clothes fit as inputs to "did I lose / gain inches."
- **Face** — for tracking facial bloating / bone definition during cuts.

Add via **Profile → Photos → + Add custom type**.

## Timeline view

The Photos section on the Log page shows a timeline organized by type. Each row is one type (Front, Side, Back, etc.) with chronologically-ordered thumbnails.

Tap any thumbnail to view the full photo. From the full view, swipe to neighboring photos within that type.

## Side-by-side compare

Tap any two photos within the same type to enter compare mode:

1. Tap the first photo (long-press on iOS, or use the menu).
2. Pick **Compare with...**
3. Tap the second photo.

The compare view shows both photos with a draggable divider. Slide to reveal more or less of either.

This is the highest-signal feature in the app for many users. Photos one month apart often show changes that weight or waist alone miss.

## How often

Most users find weekly photos work best. Monthly is the minimum useful cadence.

Daily photos add noise (lighting, posture, fullness vary day to day). Weekly captures the meaningful drift.

## Privacy and storage

Photos are stored against your account. They're not used for any AI training, not shared with anyone, and not visible to the public.

Photos are included in your [data export](/account/export) — both the image files and the metadata — and removed on [deletion](/account/delete).

::: tip Plan limits
Free tier: monthly photos.
Premium: weekly photos.
Unlimited: no cadence limits.

These caps apply to the rate of capture, not to historical photos already saved.
:::

## Common questions

**"What if I delete a custom photo type?"**
Custom photo types cascade-delete the photos within them. Make sure you don't want those photos. Presets can't be deleted (only disabled, which preserves history).

**"Does the AI assistant see my photos?"**
The AI can describe photos you submit during chat (e.g., the "log meal from photo" flow), but it doesn't actively read your timeline of progress photos.

**"Can I export all my photos?"**
Yes. The [data export](/account/export) JSON includes a `photos/` folder with every image file plus per-photo metadata (date, type, note).

**"Will my photos appear in any aggregated analytics?"**
No. Photos are never used in cross-user analytics. They're per-user, encrypted at rest, and tied only to your account.

## Related

- [Custom measurements](/tracking/custom-measurements) — numeric companion to photos.
- [Log a weigh-in](/tracking/log-a-weigh-in) — for the third corner of body change tracking.
