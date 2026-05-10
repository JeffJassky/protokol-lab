---
title: Fasting
description: Schedule recurring fasts, log one-offs, and see your current state on the live banner.
category: tracking
last_reviewed: 2026-05-10
---

# Fasting

Many GLP-1 users naturally drift into intermittent fasting because appetite is suppressed enough to skip breakfast. This system tracks scheduled fasts, one-off fasts, and shows where you are in the current window.

## What you see

When enabled, the Log page shows a fasting banner with:

- **Current state** — eating, fasting, past goal, etc.
- **Elapsed / remaining time**.
- **Current stage** — Burning carbs / Switching to fat / Ketosis / Deep ketosis.
- **Progress bar** if a planned end is set.

The banner is always live. It updates every minute.

## Setup

1. **Profile → Tracking → Fasting**.
2. Enable.
3. Pick a protocol:
   - **14:10** (14h fast / 10h eating window)
   - **16:8** (most common)
   - **18:6**
   - **20:4**
   - **OMAD** (one meal a day, 23:1)
   - **Custom** — set your own duration.
4. Pick a schedule kind:
   - **Daily** — fast every day.
   - **Weekly** — different rules per weekday (e.g., 16:8 weekdays, no fast weekends).
5. For each rule, pick a start time (e.g., "fast starts at 20:00").

Save.

## Schedule types

### Daily

A single fast pattern repeats every day:

```
Start: 20:00
Duration: 16 hours → ends 12:00 next day
```

Eat between 12:00 and 20:00. Repeat.

### Weekly

Different rules per weekday. Each weekday gets its own start time and duration:

```
Mon: 20:00, 16h
Tue: 20:00, 16h
Wed: 20:00, 16h
Thu: 20:00, 16h
Fri: 18:00, 14h (longer eating window for social events)
Sat: (no fast)
Sun: 18:00, 36h (extended weekly fast)
```

Days you don't list don't have a scheduled fast.

## One-off fasts

For irregular fasts that don't fit your schedule:

1. Tap the banner → **Start fast now** (or pick a future start time).
2. Enter a planned duration.
3. The fast runs alongside (or instead of) your scheduled rule.

If you tap **Start fast** during a scheduled fast window, the manual start replaces the implicit scheduled fast — useful if your real start time differs from the scheduled one.

## Fasting stages

The banner labels your current stage by elapsed time:

| Elapsed | Stage |
|---|---|
| 0–11h59m | Burning carbs |
| 12h–17h59m | Switching to fat |
| 18h–47h59m | Ketosis |
| 48h+ | Deep ketosis |

These are loose consumer-fasting framings, not clinical thresholds. Real metabolic state depends on your last meal's composition, glycogen stores, and individual variation. The labels are useful for narrative; don't make medical decisions based on them.

## Notifications

Two notification kinds:

- **Fast start** — fires when your fast begins (or N minutes before; configurable).
- **Fast end** — fires when your fast hits its planned end (or N minutes before).

Configure in **Profile → Notifications → Fasting**.

The notification system uses your timezone (set on profile) to determine when "20:00 daily" actually fires. Daylight saving time is handled by comparing wall-clock minutes, not absolute timestamps — a "20:00" notification fires at 20:00 local regardless of DST jumps.

## How fasting affects the simulation

The simulation already accounts for fasted-vs-fed state from your food log timing. The fasting feature adds:

- **Explicit fast events** in the export and the AI assistant's context.
- **Cortisol and growth hormone** patterns associated with extended fasts (>16h).
- **Insulin** baseline shifts during prolonged fasting windows.

If you're scheduled-fasting but eating during the supposed fasted window, the food log overrides — the simulation uses what you actually ate.

## Working with day status

A scheduled-fast day with zero food logs is a 0-calorie day. By default the [tracked vs untracked days](/understanding/honest-streaks) system flags zero-log days as "untracked (forgot)." That's wrong if it was an intentional fast.

To fix:

1. Tap the day in the weekly budget strip.
2. Status: **Tracked**.
3. Reason: **Fasted**.

The day now counts at 0 calories consumed against the day's target. Real deficit, properly counted.

## Common questions

**"What if I break a fast early?"**
Tap the banner → **End fast** (or just log food). The fast event records actual end time. Simulation reflects the true duration.

**"What about extended fasts (24h+, 48h+, multi-day)?"**
Use a one-off with a longer planned duration. The "Deep ketosis" stage label kicks in at 48h. Multi-day fasts are tracked the same way; the banner just keeps counting.

**"Does the AI assistant see my fasting?"**
Yes. It can answer "How long has my current fast been?" or "What stage am I in?" or "Did my cortisol pattern change after I started 18:6?"

**"Can I disable the banner without disabling fasting?"**
Yes — toggle "Show on Log page" off. Notifications and tracking continue.

## Privacy

Fasting data is included in your [export](/account/export) and removed on [deletion](/account/delete).

## Related

- [Tracked vs untracked days](/understanding/honest-streaks) — for fasted-day status.
- [Endogenous simulation](/understanding/endogenous-simulation) — what fasted state changes in the model.
