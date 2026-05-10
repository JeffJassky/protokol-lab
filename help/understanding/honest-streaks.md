---
title: Tracked vs untracked days
description: How the app handles missed days, fasted days, and gaps in your data.
category: understanding
last_reviewed: 2026-05-10
---

# Tracked vs untracked days

Every day in the app has a **disposition** — a flag that says whether the day's data should count toward rolling-window math. The dispositions are:

- **Tracked** — data is reliable, include it.
- **Untracked** — data is missing or unreliable, exclude it.
- **Tracked-pending** — today, in progress. Counts as tracked.

This doc explains why the system exists, how dispositions are assigned, and what they affect.

## Why this exists

Without gap handling, the rolling 7-day budget breaks on missed days:

> User logs nothing for 5 days (vacation). Day 6 they open the app.
> Rolling math: `weekTarget = 7 × 1,800 = 12,600 kcal`. `consumed = 0 + today`.
> Headroom: 12,000+ kcal. The app reads as "go ahead, eat 12,000 calories" — wrong and dangerous.

The fix is to drop missed days out of the math instead of zeroing them. The disposition system makes that explicit and configurable.

## How dispositions are assigned

Two layers: **explicit** (you tapped a status) and **automatic** (the app inferred it).

### Explicit

If you've tapped a day in the weekly strip and picked a status, that's the disposition. Status options:

- **Tracked** with reason: `fasted`, `other`.
- **Untracked** with reason: `forgot`, `partial`, `vacation`, `holiday`, `illness`, `other`.

`fasted + tracked` is the canonical "I intentionally didn't eat that day, count this 0-calorie day." Different from `forgot + untracked`, which excludes the day from math.

### Automatic

When you haven't explicitly set a status, the app infers one. The rule depends on your **confirmation mode** (set in **Profile → Tracking**).

**Passive mode (default):**

| Day's data | Auto-disposition |
|---|---|
| Has any food log entries | tracked |
| Has zero food log entries | untracked (reason: forgot) |
| Is today | tracked-pending (regardless of log count) |

**Affirmative mode:**

| Day's data | Auto-disposition |
|---|---|
| Has been explicitly marked tracked | tracked |
| Past, not explicitly marked | untracked (reason: forgot) |
| Is today | tracked-pending |

In affirmative mode, you have to tap "Mark complete" on every past day. Stricter; recommended only for users who want a high-commitment workflow.

## Today is special

Today is **never auto-flagged untracked**. Even at 8am with nothing logged yet, today is `tracked-pending` and counts toward budget math.

Why: today is in-progress data, not gap data. Auto-untracking it mid-morning would create jittery numbers that bounce around as you log meals. The math gets cleaner if today is always pending until midnight.

After midnight, "today" becomes "yesterday" and falls under the auto-rule like any past day.

## What dispositions affect

The same flag means different things across tracking domains. The rule:

> `untracked` excludes the day from aggregate / pace / adherence math, but **never alters the underlying biology**. Whatever's actually logged still drives the simulation.

Concretely:

| Domain | What `untracked` does | What it does NOT do |
|---|---|---|
| **Food** | Excludes from rolling weekly calorie / macro math. Both consumed and target shrink. | Doesn't delete logs. The daily summary still shows what you ate. |
| **Exercise** | Excludes day's workouts from the rolling burn pool / earn-mode budget. | Workouts are still in the simulation — cortisol, GH, glucose all respond. |
| **Compounds / doses** | No effect today. The PK curves and simulation always reflect real dose data. | **Does not pretend a missed dose was taken.** Skipping a dose has real biology consequences. The flag is about reporting, not metabolism. |
| **Symptoms** | Currently no effect. Future: adherence stats might respect it. | Doesn't filter from chart, history, or correlation engine. |

## Strict-universal exclusion

When a day is `untracked`, **everything** drops out — including workouts, even in `earn` energy mode:

> Vacation Tuesday — marked untracked. You went for a run.
> The run is in `ExerciseLog` (and feeds the simulation).
> The run does **not** add calories to the weekly earn-budget pool.

Rationale: marking the day untracked is a statement that the day's data isn't part of your tracking baseline. Counting the workout bonus while excluding food creates an asymmetric mental model. Strict-universal is simpler: untracked = "this day doesn't count, period."

If you want the workout to count, mark the day tracked.

## Edge cases

**Zero counted days.** If every day in your 7-day window is untracked, the budget can't compute. The dashboard shows empty-state copy ("Log something to see your weekly pace") instead of `0/0` math.

**Few counted days (N < 5).** The math still works, but "weekly" is generous with 3 days of data. The UI relabels to "3-day rolling budget" until N ≥ 5.

**Retroactive logs.** Logging entries for 3 days ago auto-flips that day from untracked to tracked (in passive mode). The budget recomputes; you'll see a small toast like "Re-included Tuesday in your weekly budget" so the change isn't unexplained.

## Where to set the confirmation mode

**Profile → Tracking → Confirmation mode.**

- **Passive** (default) — past days with food logs auto-track. Best for most users.
- **Affirmative** — every past day requires an explicit "Mark complete." Strict commitment workflow.

You can switch back and forth. Switching to affirmative makes past auto-tracked days flip to untracked retroactively until you confirm them.

## How to mark a day manually

1. On the dashboard or Log page, find the weekly budget strip.
2. Tap any day's bar.
3. Pick a status (tracked or untracked).
4. Pick a reason (filtered to valid options for the chosen status).

The change saves immediately and the budget recomputes.

## Why not just a "streak counter"?

Many trackers gamify with streaks: 30 days in a row, 100 days in a row. Skip a day, the streak resets to zero.

The behavioral data on this is unkind. The most common time users churn out of those apps is the day after they break the streak. The streak counter rewards perfection and punishes any flexibility.

The disposition system is a deliberate alternative. Skipping a day doesn't break your math — it shrinks the window. Vacation, illness, or a forgotten log don't reset anything. The system stays useful through real-life messiness.

## Related

- [Rolling 7-day budget](/understanding/rolling-7-day) — the consumer of the disposition flag.
- [Exercise energy modes](/tracking/exercise) — how earn vs baseline interact with disposition.
