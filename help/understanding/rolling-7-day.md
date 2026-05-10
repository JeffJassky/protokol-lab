---
title: Rolling 7-day budget
description: Why we count the week instead of the day, and the math that makes it gap-aware.
category: understanding
last_reviewed: 2026-05-10
---

# Rolling 7-day budget

The dashboard's calorie budget isn't a daily target. It's a **rolling sum over the last seven counted days**, and it's specifically designed to absorb missed days, fasted days, and dose-suppression days without breaking.

This page explains why and exactly how.

## Why not a daily target?

Daily-target apps look like this:

> "You have 1,200 calories left today."

Tomorrow, the math resets. If you go over today, the only thing that happens is tomorrow starts at zero.

That's fine for steady eaters. It breaks for two common patterns:

1. **GLP-1 users with variable appetite**: Day 1 after a dose, you eat 600 calories. Day 4, you're hungry, you eat 2,200. Daily-target math says day 4 is a "failure." Weekly math says it averaged out.
2. **People who occasionally fast or eat late**: a 16-hour fasted day reads as a "0 calories logged" day to most apps. Either it counts as a 1,800-calorie deficit (wrong — you didn't eat at a 1,800 deficit, you didn't eat at all and your body knows the difference), or it counts as missing data and breaks the streak.

The rolling 7-day budget avoids both.

## The math

Concretely:

```
window = 7 most recent days, ending today
For each day d in window:
  disposition[d] = explicit DayStatus.status[d] OR autoClassify(d)
  if disposition[d] is 'untracked':
    skip this day (it doesn't enter numerator OR denominator)
  else:
    effectiveDailyTarget[d] = baseTarget
                            + (energyMode === 'earn' ? burned[d] : 0)
    consumed[d] = sum of food calories logged for d

countedDays = days that survived the filter
N = countedDays.length

weekTarget = sum of effectiveDailyTarget[d] over countedDays
weekConsumed = sum of consumed[d] over countedDays

delta = weekTarget - weekConsumed
```

So if 5 of 7 days count and your daily target is 1,800:

- `weekTarget = 5 × 1,800 = 9,000` calories.
- If you've eaten 7,500 across those 5 days, `delta = 1,500` — you have 1,500 calories of headroom.
- If today is one of the 5 counted days (it always is, see below), today's "available" is `delta` minus what you've already eaten today.

## Tracked vs untracked days

The pivot in the rule above is "how do we decide a day is `untracked`?" — that's its own page: [Tracked vs untracked days](/understanding/honest-streaks). Short version:

- **Today** is always **tracked-pending** — it counts in budget math from the moment you open the app, even before you've logged anything.
- **Past days with food logs** are auto-tracked.
- **Past days with zero food logs** are auto-untracked (reason: forgot).
- **You can override either way** by tapping a day in the weekly strip.

Crucially: untracked days drop out of *both* the numerator (consumed) *and* the denominator (target). The window shrinks to the days that count.

## What about days you intentionally fasted?

A real 0-calorie fasted day is **not** the same as a forgot-to-log day. Mark it:

1. Tap the day in the weekly strip.
2. Status: **Tracked**.
3. Reason: **Fasted**.

The day counts at 0 calories consumed against the day's target. Result: a real deficit, properly counted.

## What about exercise?

If your **energy mode** is `earn`, each counted day's effective target rises by that day's burn:

```
effectiveDailyTarget = baseTarget + caloriesBurned
```

So a 400-calorie workout on a counted day adds 400 to the week's target. Workouts on untracked days are excluded — see [Exercise energy modes](/tracking/exercise) for the rationale.

If your energy mode is `baseline` (default), workouts are informational only — they don't change the target.

## Edge cases

**No counted days.** If every day in the window is untracked, the budget can't compute. The dashboard shows empty-state copy ("Log something to see your weekly pace") instead of `0/0` math.

**Few counted days (N < 5).** The math still works, but "weekly budget" is a stretch with 3 days of data. The UI relabels to "3-day rolling budget" until you have 5 or more counted days.

**Retroactive logs.** If you log entries for 3 days ago, that day's auto-disposition can flip from untracked to tracked. The budget recomputes; you'll see a small toast like "Re-included Tuesday in your weekly budget" so the math change isn't unexplained.

**Today is special.** Today is never auto-flagged untracked, even if you haven't logged anything yet. It's `tracked-pending` — counts toward budget math from the moment you open the app. Auto-untracking it mid-morning would create jittery numbers you couldn't reason about.

## How to read the strip

The Weekly Budget Strip at the top of the dashboard shows seven days, today on the right.

- **Solid filled bar** = tracked day with food logs.
- **Striped / outlined bar** = untracked day.
- **Bar above the target line** = consumed > effectiveTarget that day (overage).
- **Bar at or below target** = within target.

The strip's footer shows `N of 7 days counted` and the running delta.

## Confirmation modes (advanced)

In **Profile → Tracking**, there's a setting called **Confirmation mode**:

- **Passive** (default): past days auto-track if they have food logs.
- **Affirmative**: past days require an explicit "Mark complete" tap to count.

Affirmative is stricter. It's for users who want to consciously commit each day. Most people are fine with passive.

## Math walkthrough

Concrete example. Daily target 1,800 calories. Energy mode `earn`. Last 7 days:

| Day | Status | Consumed | Burned | Counts? |
|---|---|---|---|---|
| Mon | tracked | 1,500 | 0 | yes |
| Tue | tracked | 2,000 | 250 | yes |
| Wed | untracked (vacation) | 1,800 | 0 | **no** |
| Thu | tracked | 1,700 | 0 | yes |
| Fri | tracked, fasted | 0 | 0 | yes |
| Sat | tracked | 2,400 | 400 | yes |
| Sun (today) | tracked-pending | 800 (so far) | 0 | yes |

Counted days: Mon, Tue, Thu, Fri, Sat, Sun = 6 of 7.

```
weekTarget = (1800) + (1800 + 250) + (1800) + (1800) + (1800 + 400) + (1800)
           = 1800 + 2050 + 1800 + 1800 + 2200 + 1800
           = 11,450

weekConsumed = 1500 + 2000 + 1700 + 0 + 2400 + 800 = 8,400

delta = 11,450 - 8,400 = 3,050
```

You have ~3,050 calories of headroom across the rest of today + tomorrow.

Notice Wed dropped out. That's the point. If we'd counted Wed at 1,800 against an 1,800 target, the math would say "neutral" — but you don't actually know what you ate. Excluding it produces honest numbers.

## Why exactly 7 days?

A week is the human-scale unit for eating patterns: weekday work meals, weekend meals, social events, grocery shop cycles. Five-day windows ignore weekends; 14-day windows take too long to react to a real change in your eating. Seven days is what most users implicitly mean by "this week's eating."

The window slides — it's not "Monday to Sunday." Today is always day 7; six days ago is always day 1.

## Related

- [Tracked vs untracked days](/understanding/honest-streaks) — the disposition rules in detail.
- [Exercise energy modes](/tracking/exercise) — how `earn` vs `baseline` change the target.
- [Trend & ETA](/understanding/trend-and-eta) — how the rolling math feeds the projection.
