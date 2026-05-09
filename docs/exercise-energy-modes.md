# Exercise Energy Modes

How the app accounts for **exercise energy expenditure** in the user's
calorie-deficit math. Three modes, user-selectable, governing whether
logged workouts adjust the daily / weekly calorie target or just
display alongside food intake for awareness.

This doc is the reference for what each mode does, why it exists, and
how to pick. The setting lives at
`UserSettings.exercise.energyMode`.

---

## TL;DR

| Mode | Daily target | Burn shown? | Best for |
|---|---|---|---|
| **`baseline`** (default) | Unchanged | Yes (awareness only) | Users whose activity-level multiplier in TDEE already covers typical workouts. Most users. |
| **`earn`** | Bumps by today's burn | Yes (drives target) | Users who set TDEE to sedentary on purpose; exercise "earns" calories. |
| **`hidden`** | Unchanged | No | Users who don't trust MET estimates or use a wearable for energy expenditure. |

Default is `baseline` because GLP-1 users mostly aren't trying to eat
back exercise; appetite is the bottleneck, not deficit math.

---

## Why three modes

There's no universally correct answer to "should exercise raise my
calorie target?". It depends on how the user set their TDEE:

> **Activity-aware TDEE.** User's TDEE is computed as
> `BMR × moderate-activity multiplier`. The multiplier already
> assumes typical exercise. Adding logged workouts back on top would
> double-count.

> **Sedentary TDEE.** User deliberately set TDEE to `BMR × 1.2`
> (sedentary), specifically so that logged workouts can be added back
> to today's target. Each workout "earns" calories.

> **Wearable-driven.** User has an Apple Watch / Garmin / Whoop that
> overrides everything. They don't want our MET estimates competing
> with their wearable's numbers.

Both TDEE-setup styles are common and valid. Forcing one accounting
policy on every user breaks the other style. Three explicit modes let
the user pick the policy that matches their setup.

---

## Mode definitions

### `baseline` (default)

```
effectiveDailyTarget = settings.targets.calories
burnDisplayed        = sum of caloriesBurned for the day
deficitMath          = consumed - effectiveDailyTarget   (unchanged)
```

Burn appears in the daily summary strip and the dashboard's "Calories
burned" series, but neither raises the calorie target nor adjusts the
deficit calc. Just awareness.

**Display strip:**
```
1500 in · 280 out → 1220 net      target 1800
```

The `out` and `net` columns are informational. `target` stays put.

### `earn`

```
effectiveDailyTarget = settings.targets.calories + burned[today]
burnDisplayed        = sum of caloriesBurned for the day
deficitMath          = consumed - effectiveDailyTarget
```

Each workout adds calories to today's target. The same arithmetic
applies to the rolling-7 window: each counted day contributes
`(daily + that day's burn)` to `effectiveWeekTarget`.

**Display strip:**
```
1500 in · 280 out → 1220 net      target 2080  (1800 + 280 from workout)
```

Useful when the user's TDEE is set to sedentary and they want exercise
to expand the budget.

### `hidden`

```
effectiveDailyTarget = settings.targets.calories
burnDisplayed        = nothing
deficitMath          = consumed - effectiveDailyTarget   (unchanged)
```

Burn isn't surfaced anywhere — not the daily strip, not the dashboard
series. The simulation engine still consumes ExerciseLog (cortisol,
GH, etc. respond to logged workouts), but no calorie-burn math reaches
the UI.

**Display strip:**
```
1500     target 1800
```

For users who don't want to see MET-derived numbers.

---

## Math: rolling 7-day window

Folds in cleanly with the [tracked / untracked day system](./tracked-untracked-days.md):

```
for each day d in window:
  if disposition[d] is untracked: skip
  effectiveDailyTarget(d) = daily
                          + (mode === 'earn' ? burned[d] : 0)

effectiveWeekTarget = sum effectiveDailyTarget(d) over counted days
effectiveConsumed   = sum consumed[d] over counted days
weekDelta           = effectiveWeekTarget - effectiveConsumed
```

In `baseline` and `hidden`, `effectiveWeekTarget` is just
`countedDays × daily` — workouts don't enter the math.

In `earn`, each counted day's target rises by that day's burn. So a
workout-heavy week with 3 of 7 untracked days produces a target like
`(4 × 1800) + (250 + 400 + 200 + 0) = 7,200 + 850 = 8,050`. The
banked-from-exercise headroom is real and visible.

**Strict universal:** workouts on `untracked` days are excluded from
the earn-mode pool. See [tracked-untracked-days § Strict-universal](./tracked-untracked-days.md#strict-universal-exclusion-workouts-on-untracked-days)
for the rationale.

---

## What energy mode does NOT affect

- **Macro targets.** Carbs / protein / fat targets stay put across
  all modes. The "more protein for lifting, more carbs for cardio"
  intuition is real but variance from user goals (cut vs maintain vs
  bulk) dominates variance from exercise type. Out of scope for v1.
- **Simulation curves.** The endogenous-signal worker consumes
  ExerciseLog regardless of energy mode. Cortisol spikes,
  growth-hormone bursts, glucose dips, vagal tone changes — all happen
  the same way in baseline / earn / hidden. Energy mode is a calorie-
  accounting policy, not a physiological one.
- **Calories-burned series on the dashboard chart.** The "Calories
  burned" series (red dashed) renders the same numbers in every mode
  — though `hidden` mode hides the series option from the picker
  entirely.

---

## Where the mode is consumed

Anything reading `settings.exercise.energyMode`:

- **LogPage daily summary strip.** Renders `in / out / net / target`
  per the active mode.
- **WeeklyBudgetStrip.** Computes `effectiveWeekTarget` per mode.
- **DailySummary card.** Same daily math.
- **DashboardPage chart.** "Net calories" series respects mode for
  the math (consumed − burned in baseline/earn, just consumed in
  hidden).

If you add a new surface that displays a calorie target or deficit,
**read the mode**. Default behavior should be `baseline` if the user
hasn't set anything. Don't hard-code `consumed - target` math
anywhere.

---

## Settings UI

Lives at `/profile/settings/exercise`. Three radio cards, each with:

- Label (e.g. "Activity-aware TDEE")
- Description of what it does
- "Best when" hint
- A live "Today preview" strip below all three options, showing what
  the user's actual numbers would read under each mode

The live preview is the important piece — it converts an abstract
policy choice into concrete numbers using the user's real today data.
Most users can't reason about TDEE-multiplier semantics in the
abstract; they can recognize "yeah, target should bump when I work
out" or "no, my target should stay the same".

---

## Caveats

- **MET estimates are rough.** `kcal = MET × kg × hours × intensity`.
  Real burn varies ±20% based on individual metabolism, fitness level,
  body composition, and ambient temperature. The `caloriesBurned`
  field on `ExerciseLog` is user-editable for this reason — wearable
  overrides plug in here.
- **`MET × intensity` is multiplicative.** A 1.5× intensity slider on
  Running (MET 7.0) gives effective MET 10.5 — about right for
  vigorous running. The intensity model isn't physiologically
  rigorous; it's a single-knob convenience.
- **Mode switching is retroactive in display.** Switching from
  `baseline` to `earn` mid-week makes the rolling math jump. Real
  numbers don't change — just how they're presented. Users tend to
  notice; brief explanatory copy on the settings page covers it.

---

## Reference

- Setting: `UserSettings.exercise.energyMode = 'baseline' | 'earn' | 'hidden'`
- Settings UI: `client/src/pages/settings/ExercisePage.vue`
- Daily summary math: (TBD — central composable for "today's calorie strip")
- Weekly math: `client/src/composables/useWeeklyBudget.js`
- Burn computation (server): `kcal = MET × kg × hours × intensity` in `server/src/routes/exerciselog.js`
- Related: [Tracked vs Untracked Days](./tracked-untracked-days.md)
