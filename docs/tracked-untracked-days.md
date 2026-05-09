# Tracked vs Untracked Days

How the app handles **information gaps** in user data — the days when a
user was on vacation, sick, traveling, or just forgot to log. Without
explicit handling, gaps corrupt rolling-window math: 5 missed days
makes a 7-day budget read as if the user has banked 5 days of calories
to spend tomorrow, which is wrong and dangerous.

This doc is the contract. Anything that consumes rolling-window data
must respect the rules below.

---

## Concepts

A **day disposition** is a per-day flag that classifies whether the
day's data should count toward aggregate / pace / adherence math.

| Disposition | Meaning | Effect on aggregate math |
|---|---|---|
| **tracked** | Day's data is reliable. Include it. | Counts in numerators **and** denominators of weekly windows. |
| **untracked** | Day's data is missing or unreliable. Exclude it. | Drops out of both numerator and denominator. The window shrinks. |
| **tracked-pending** | Today, in progress. Always counts as tracked, but UI may distinguish "still adding entries". | Same math as tracked. |

The disposition is **universal** across all tracking domains (food,
exercise, supplements, compounds, future additions). One row per day,
applies everywhere. Per-domain scoping is a future extension that hasn't
shipped — schema is forward-compatible.

---

## Why it has to exist

The 7-day rolling budget assumes 7 clean days. Without gap handling:

> User logs nothing for 5 days (vacation). Day 6 they open the app.
> Rolling math: `weekTarget = 7 × 1800 = 12,600 kcal`. `consumed =
> 0 + today`. `delta = 12,600 - today` → "you have ~12,000 kcal of
> headroom this week". User reads it as permission to overeat by an
> absurd amount.

GLP-1 users specifically also have legitimate fasted days (low
appetite). Those should optionally count as tracked at 0 kcal, not
auto-flag as untracked. The app needs a way to tell forgot-to-log
apart from intentional-fast.

---

## Storage

**Model**: `DayStatus` (`server/src/models/DayStatus.js`).

```
{
  userId, date (YYYY-MM-DD string),
  status: 'tracked' | 'untracked',
  reason: 'forgot' | 'partial' | 'vacation' | 'holiday' | 'illness' | 'fasted' | 'other',
  notes
}
```

**Sparse**. Rows only persist when the explicit status differs from
the implicit default. The vast majority of days have no `DayStatus` row
and rely on the auto-rule below.

Unique index on `(userId, date)`.

---

## Auto-classification rule

When no explicit `DayStatus` row exists for a day, the system
auto-classifies based on the user's confirmation mode and presence of
log data.

### Passive mode (default)

| Day's data | Auto-disposition |
|---|---|
| Has any FoodLog entries | `tracked` |
| Has zero FoodLog entries | `untracked` (auto, reason = forgot) |
| Is today | `tracked-pending` regardless of log count |

### Affirmative mode (opt-in setting)

| Day's data | Auto-disposition |
|---|---|
| Day has been explicitly confirmed via `DayStatus.status='tracked'` | `tracked` |
| Day is past and has no DayStatus row | `untracked` (must be explicitly confirmed) |
| Is today | `tracked-pending` |

In affirmative mode, the user must tap "Mark complete" on each past
day for it to count. Today is always pending and counts toward
consumed during the day; it converts to `tracked` on user
confirmation.

**Setting**: `UserSettings.tracking.confirmationMode = 'passive' | 'affirmative'`. Default `passive`.

The `tracking` namespace (not `weeklyBudget.*`) — the same setting
governs every tracking domain that consults DayStatus.

---

## Reason × status semantics

Not every reason combines with every status:

| Status | Valid reasons |
|---|---|
| `tracked` | `fasted`, `other` (intentional zero-calorie days, or explicit "this counts") |
| `untracked` | `forgot`, `partial`, `vacation`, `holiday`, `illness`, `other` |

UI must enforce these combinations — pick status first, then surface
only the valid reasons for that status.

`fasted + tracked` is the canonical "I intentionally didn't eat
today, count this 0-kcal day toward my weekly average". Different
from `forgot + untracked` (the day's data is missing, exclude it).

---

## Effect by domain

The same `untracked` flag means different things across tracking
domains. **The rule:**

> `untracked` excludes the day from aggregate / pace / adherence math,
> but **never alters the underlying biology**. Whatever's actually
> logged still drives the simulation.

| Domain | What `untracked` does | What it does NOT do |
|---|---|---|
| **Food** | Excludes day from rolling weekly calorie / macro math (consumed and target both shrink). | Doesn't delete logs. Doesn't suppress the daily summary card. |
| **Exercise** | Excludes day's logged workouts from the rolling burn pool / earn-mode budget. | Doesn't remove workouts from the simulation. The cortisol / GH curves still respond to logged sessions. |
| **Supplements** (future) | Excludes from adherence stats. | Doesn't change pharmacokinetics — sims use what was logged. |
| **Compounds** | Conceptually no-op today: the only meaningful "compound math" is the PK simulation, which always reflects real DoseLog data. A future adherence-stats view would respect untracked. | **Does not pretend a missed dose was taken.** Skipping a GLP-1 dose has real physiological consequences and the simulation reflects that. The `untracked` flag is about reporting, not biology. |

---

## Math: rolling 7-day budget

Concrete computation in `useWeeklyBudget`:

```
window = 7 most recent days (ending today)
disposition[d] = explicit DayStatus.status[d] OR autoClassify(d)

countedDays = window.filter(d => disposition[d] in ['tracked', 'tracked-pending'])
N = countedDays.length

effectiveDailyTarget(d) = settings.targets.calories
                        + (energyMode === 'earn' ? burned[d] : 0)

effectiveWeekTarget = sum of effectiveDailyTarget(d) over countedDays
effectiveConsumed   = sum of consumed[d] over countedDays

delta = effectiveWeekTarget - effectiveConsumed
adjustedToday = effectiveWeekTarget - sum(consumed) over past6Counted
```

Where `past6Counted` is countedDays minus today.

### Edge cases

**Zero counted days.** If every day in the window is `untracked`,
display empty-state copy ("Log something to see your weekly pace")
instead of `0 / 0` math. The numbers are real but meaningless.

**Few counted days (`N < 5`).** Math still works, but the "weekly
budget" framing is hollow. UI dynamically relabels: "3-day rolling
budget" when `N < 5`, "weekly budget" when `N ≥ 5`.

**Retroactive logs.** User logs entries 3 days ago, flipping that day
auto-untracked → auto-tracked. Today's `delta` recomputes. UX should
surface a small toast ("Re-included Tuesday in your weekly budget") so
the change isn't unexplained.

---

## Today is special

**Today is never auto-untracked.**

In passive mode, today defaults to `tracked-pending` from the moment
the user opens the app — even before any food is logged. As entries
accrue, the disposition stays `tracked-pending` until midnight. After
midnight, today becomes "yesterday" and falls under the auto-rule like
any past day (will auto-flag untracked if zero entries were ever
logged).

In affirmative mode, today is also `tracked-pending`. Today's logs
count toward `consumed` while in progress; the user converts to
explicit `tracked` via "Mark complete" before the day ends, otherwise
yesterday-rules apply at midnight.

Rationale: today is in-progress data, not gap data. Auto-untracking it
mid-morning before any meal is logged would create jittery math the
user can't reason about.

---

## Strict-universal exclusion (workouts on untracked days)

When a day is `untracked`, **all** rolling-window aggregates exclude
that day, including workouts. This applies even when energy mode is
`earn`:

> Vacation Tuesday — user marked untracked. They went for a run.
> The run is logged in `ExerciseLog` (and feeds the simulation).
> The run does **not** add calories to the weekly earn-budget pool.

Rationale: marking the day untracked is a statement that the day's
data isn't part of the user's tracking baseline. Counting the workout
bonus while excluding food creates an asymmetric mental model. Strict-
universal is simpler to explain and reason about: untracked = "this
day doesn't count, period."

If the user wanted the workout to count, they'd mark the day tracked
(or never mark it untracked in the first place).

---

## UI

Every tracking surface that consumes rolling-window math should:

1. **Show counted-day count.** `5 of 7 days counted` near the budget
   header. Becomes `3-day budget` framing when `N < 5`.
2. **Render untracked days distinctly.** Dashed outline, greyed fill,
   and an `↷ untracked` overlay in the 7-day strip.
3. **Allow one-tap status flip.** Tap any day → menu: status (tracked
   / untracked), reason (filtered to valid options for the chosen
   status).
4. **Empty-state when `N = 0`.** Replace math with "Log something to
   see your weekly pace".
5. **Toast retroactive flips.** Small notice when a day's
   classification changes due to retroactive logs.

The day-status menu is a single shared component; food, exercise,
supplements, future surfaces all use it.

---

## Future extensions

These are **not** built yet but the schema accommodates them:

- **Per-domain scoping.** Add `domains: ['food']` to a `DayStatus`
  row to restrict the override to specific tracking domains. Most
  users won't need it; power users might.
- **Bulk-mark vacation.** A "vacation mode" UI that marks a date
  range as untracked with `reason: vacation` in one tap.
- **Adherence reports.** When supplement / dose adherence stats are
  surfaced, they consume DayStatus the same way.

---

## Reference

- Model: `server/src/models/DayStatus.js`
- Routes: `server/src/routes/dayStatus.js`
- Settings: `UserSettings.tracking.confirmationMode`
- Composable: `client/src/composables/useWeeklyBudget.js`
- UI: `client/src/components/WeeklyBudgetStrip.vue`
- Related: [Exercise Energy Modes](./exercise-energy-modes.md)
