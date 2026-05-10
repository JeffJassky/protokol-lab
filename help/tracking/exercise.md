---
title: Exercise
description: Log workouts, classify them by engine class, and pick how they interact with your calorie budget.
category: tracking
last_reviewed: 2026-05-10
---

# Exercise

Exercise tracking covers four engine classes (cardio / resistance / HIIT / recovery), three energy modes for how workouts interact with your calorie budget, and feeds the simulation for cortisol, growth hormone, and glucose disposal effects.

## Engine classes

When logging a workout, you pick one of four classes. The choice affects how the simulation models the workout and what default MET values are used:

| Class | Default MET | Examples |
|---|---|---|
| **Cardio** | 6.0 | Running, cycling, swimming, hiking. |
| **Resistance** | 5.0 | Weightlifting, calisthenics, bodyweight strength. |
| **HIIT** | 8.0 | Sprints, intense interval work, CrossFit-style. |
| **Recovery** | 2.5 | Walking, mobility, yoga, stretching, low-effort activity. |

The classes aren't interchangeable. Cortisol response is much sharper for HIIT than recovery; growth hormone burst patterns differ; glucose disposal varies. The simulation reads the class.

## Logging a workout

1. Tap **Quick Log → Exercise** (or open the Log page).
2. Pick from your enabled exercises (or type a freeform name).
3. Pick the engine class.
4. Enter duration in minutes.
5. (Optional) intensity slider — 0.5× (very easy) to 1.5× (very hard); defaults to 1.0×.
6. (Optional) detailed metadata: sets/reps/weight for resistance, distance/pace for cardio.
7. Save.

Calories burned compute automatically: `kcal = MET × kg × hours × intensity`. Editable if you have a wearable that reports a more accurate number.

## Energy modes

How workouts interact with your daily calorie target. Three modes — pick one in **Profile → Exercise → Energy mode**.

### Baseline (default)

Workouts are tracked but **don't change your daily target**. Your TDEE setting (e.g., "Moderate activity") already includes typical exercise. Adding logged workouts on top would double-count.

```
Daily target: 1,800 kcal (regardless of exercise)
Burn shown: yes
```

Best for users who set TDEE realistically. Most users.

### Earn

Each workout **adds calories** to today's target. Pairs with a sedentary TDEE — you assume zero activity baseline, then earn your way up.

```
Daily target: 1,800 + (today's burn)
Workout burn 400 kcal → today's target becomes 2,200
```

Best for users who set TDEE to sedentary on purpose. Rewards exercise visibly.

### Hidden (deprecated)

Old mode that hid exercise burn entirely. New code paths treat it as baseline. Not user-selectable for new users.

## Strict-universal exclusion

When a day is marked **untracked**, exercise drops out of the rolling earn-budget pool — even though the workout is still in the simulation:

> Vacation Tuesday — marked untracked. You went for a run.
> The run is logged in `ExerciseLog` (and feeds the simulation).
> The run does **not** add calories to the weekly earn-budget pool.

Rationale: marking the day untracked means the day doesn't count, period. Counting the workout while excluding food creates an asymmetric mental model.

## What energy mode does NOT change

- **Macro targets** (protein/carbs/fat) — fixed across modes.
- **Simulation curves** — cortisol, growth hormone, glucose, etc. all respond to logged workouts regardless of mode.
- **Per-workout calorie estimate** — computed the same way; what changes is how the budget consumes it.

## Custom exercises

Add your own exercises to the catalog (e.g., "Sunday hike," "Climbing session"). Custom exercises remember their last MET, intensity, and class so re-logging is one tap.

**Profile → Exercise → Catalog → + Add**.

## How exercise affects the simulation

Each engine class has a distinct pharmacology profile:

- **Cardio**: glucose uptake, lactate, modest cortisol.
- **Resistance**: growth hormone pulse, sharp cortisol, glucose disposal post-workout.
- **HIIT**: large cortisol response, growth hormone burst, longer recovery window.
- **Recovery**: minimal acute response; useful for the "don't double-count moderate movement" path.

Intensity modifies amplitude. Duration modifies AUC.

Cumulative effect across the day is what the simulation actually solves — three short workouts vs one long workout produce different downstream patterns even at equal kcal.

## Common questions

**"My wearable says I burned 600 kcal but the app says 400."**
Edit the `caloriesBurned` field on the entry. Wearable numbers tend to be more accurate for cardio with HR data; MET-table estimates work better for resistance training.

**"Why is the MET formula clamped at 1.5× intensity?"**
Above 1.5×, the linear MET model stops being honest. A 5× intensity slider on Running (MET 7.0) doesn't mean 5× the burn — at that effort you'd be in HIIT territory, which has a different MET base entirely.

**"What if I forget to pick a class?"**
The default is cardio (MET 6.0). For accuracy, pick the right class — the simulation uses it.

**"Does exercise affect the trend line for weight?"**
Indirectly. Weight responds to net energy balance. The trend line is computed from your weigh-ins, which already reflect whatever your exercise + intake did.

## Privacy

Exercise data is included in your [export](/account/export) and removed on [deletion](/account/delete).

## Related

- [Rolling 7-day budget](/understanding/rolling-7-day) — how energy mode interacts with weekly math.
- [Tracked vs untracked days](/understanding/honest-streaks) — strict-universal exclusion.
- [Endogenous simulation](/understanding/endogenous-simulation) — what each engine class does to the model.
