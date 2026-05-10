---
title: Custom measurements
description: Track waist, hip, neck, body fat, and any other body measurement that matters to you.
category: tracking
last_reviewed: 2026-05-10
---

# Custom measurements

Beyond weight, the app tracks body circumferences and composition values. Built-in presets cover common measurements; you can add custom ones for anything else.

## What's preloaded

The app ships with these measurement presets, organized by category:

**Body circumferences (length):**
- Arm (left, right)
- Forearm (left, right)
- Thigh (left, right)
- Calf (left, right)
- Wrist
- Neck
- Shoulders
- Chest
- Waist
- Hips

**Body composition:**
- Body fat (%)
- Lean mass (mass)

Each preset has a sensible default unit (inches or cm depending on your unit system).

## How to enable

By default, **all presets are disabled**. Enable the ones you'll actually measure:

1. **Profile → Measurements**.
2. Toggle on the ones you want.
3. They appear as rows on the Log page's Measurements section.

Disabling a preset hides it but **does not delete history** — re-enabling later restores the data.

## Logging a measurement

1. Log page → Measurements section → tap a row.
2. Enter the value.
3. Date defaults to today.
4. Save.

## Custom measurements

If a preset doesn't cover what you want to track, add your own:

1. **Profile → Measurements → + Add custom**.
2. Pick a name.
3. Pick a dimension (length, mass, volume, duration, count).
4. Pick a default display unit if you want to override the system default.
5. Save.

Custom measurements work the same as presets — they appear on the Log page and the dashboard.

Examples of useful custom measurements:

- **Resting heart rate** (count, bpm).
- **Blood pressure** (custom dimension; see workaround below).
- **Sleep duration** (duration, hours).
- **Step count** (count).

::: tip Two-value measurements
The app stores one numeric value per measurement entry. For things like blood pressure (systolic + diastolic), create two custom measurements ("BP systolic" and "BP diastolic") and log them paired.
:::

## Frequency

There's no app-side requirement. Most users:

- **Daily**: weight, body fat (if from a smart scale).
- **Weekly**: waist, hip, neck.
- **Monthly**: arms, thighs, chest.

Trends matter more than precision. Same time of day, same conditions (post-bathroom, fasted, no clothes or consistent clothes) makes the trend cleaner.

## Why waist matters

Of all the circumferences, waist is the highest-signal measurement for body composition change. While weight bounces with water, glycogen, and digestion, waist tracks abdominal fat with much less noise.

If you're recomp-ing (gaining muscle while losing fat), weight may be flat or even rising while waist drops. That's the case where weight alone is misleading.

## What the dashboard shows

Each enabled measurement is a series on the multi-series dashboard chart. You can:

- Plot weight + waist together on a dual axis.
- Overlay body fat % against weight to see recomp.
- Compare an arm measurement against resistance training volume.

## Pattern insights

Measurements participate in the [pattern insights](/understanding/pattern-insights) engine. With ≥14 days of overlap, the engine can find correlations like:

- "Waist drops 2 days after dose escalation."
- "Body fat % co-tracks weight at r=0.92" (definitional, but useful as a reality check).
- "Neck stable, chest declining" — recomp signature.

## Common questions

**"Why aren't BMI / FFMI shown as measurements?"**
They're computed from other values (BMI from weight + height; FFMI from lean mass + height). The Weight section's stat grid surfaces BMI directly. FFMI we don't currently compute — feature request via support if you'd like it.

**"Can I delete a preset?"**
No. Disable instead. Deleting presets would orphan history. Disabled presets don't appear in the UI.

**"Can I delete a custom measurement?"**
Yes. Deletion cascade-deletes all logged values for that measurement. Make sure you actually want it gone.

**"My smart scale gives me 12 numbers. Can I import all of them?"**
Not via direct integration. You can manually log the ones you care about. Body fat % and lean mass are the two most useful from smart scales.

## Privacy

Measurement data is included in your [export](/account/export) and removed on [deletion](/account/delete).

## Related

- [Log a weigh-in](/tracking/log-a-weigh-in) — the most-tracked measurement.
- [Progress photos](/tracking/photos) — visual confirmation alongside numbers.
- [Pattern insights](/understanding/pattern-insights) — finding measurement patterns.
