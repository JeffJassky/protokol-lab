---
title: Tracking settings reference
description: Confirmation mode, energy mode, and other knobs that govern tracking math.
category: reference
last_reviewed: 2026-05-10
---

# Tracking settings reference

This page covers the settings that affect how your data is interpreted — confirmation mode, energy mode, units, and related knobs. Most live under **Profile → Tracking** or **Profile → App**.

## Confirmation mode

**Where**: Profile → Tracking → Confirmation mode.

**What**: Controls whether past days auto-track based on the presence of food logs, or require an explicit "Mark complete" tap.

| Value | Behavior |
|---|---|
| `passive` (default) | Past days with food logs auto-flag as `tracked`. Days with no logs auto-flag as `untracked` (reason: `forgot`). |
| `affirmative` | Past days only count as `tracked` after explicit confirmation. Default for past days is `untracked` (reason: `forgot`). |

Switching from passive to affirmative makes previously-auto-tracked days flip to untracked until confirmed.

See [Tracked vs untracked days](/understanding/honest-streaks) for the full implications.

## Energy mode (exercise)

**Where**: Profile → Exercise → Energy mode.

**What**: Whether logged workouts raise your daily calorie target.

| Value | Behavior | Best when |
|---|---|---|
| `baseline` (default) | Burn shown but doesn't change daily target. | Your TDEE setting already includes typical exercise. Most users. |
| `earn` | Each workout adds calories to today's target. | TDEE set to sedentary; exercise "earns" calories. |
| `hidden` (deprecated) | Burn isn't surfaced anywhere. | Legacy; new users get baseline. |

See [Exercise energy modes](/tracking/exercise) for the full breakdown.

## Daily calorie target

**Where**: Profile → Targets → Calories.

**What**: Your base daily calorie target. The rolling 7-day budget multiplies this by the number of counted days.

Set during onboarding from your goal weight + activity level. Editable anytime.

## Macro targets

**Where**: Profile → Targets → Protein / Fat / Carbs.

**What**: Target grams per day for each macro. Used by:

- The daily summary card.
- The rolling 7-day budget.
- The [nutrition score](/understanding/nutrition-score).

## Activity level

**Where**: Profile → Targets → Activity level.

**What**: Multiplier for converting BMR to TDEE.

- Sedentary (×1.2)
- Lightly active (×1.375)
- Moderately active (×1.55)
- Very active (×1.725)
- Extra active (×1.9)

The choice flows into your suggested calorie target. If you re-pick, the suggestion updates but doesn't auto-overwrite your manual target.

## Units

**Where**: Profile → App → Units.

**What**: Imperial or metric.

| Value | Used for |
|---|---|
| `imperial` | Lbs for weight, inches for measurements, fluid ounces for water. |
| `metric` | Kg, cm, ml. |

The setting is global. Existing data re-renders in the new unit; nothing is converted destructively.

## Time zone

**Where**: Profile → App → Time zone.

**What**: IANA time zone string (e.g., `America/Los_Angeles`). Used for:

- "Today" calculations on the server (so daily summaries align with your local midnight).
- Reminder scheduling (fire at the right wall-clock time even across DST).
- Chart axis labels.

Auto-detected on signup from the browser. Update manually if you move.

## Tracking domain toggles

**Where**: Profile → Tracking → individual sections.

Each tracking domain has its own enable / disable:

- **Exercise** — `Profile → Exercise → Enabled` (default off; turning on adds the section to the Log page).
- **Fasting** — `Profile → Tracking → Fasting → Enabled`.
- **Water** — `Profile → Tracking → Water → Enabled`.
- **Menstruation** — `Profile → Tracking → Menstruation → Enabled`.
- **Photos** — `Profile → Photos → Enabled`.
- **Journal / Day notes** — `Profile → Tracking → Journal → Enabled`.

Turning a domain off:

- Removes it from the Quick Log menu and the Log page.
- Hides its dashboard chart series option.
- Stops scheduling notifications for it.
- Doesn't delete history. Re-enabling restores access.

## Show on Log / Show on Dashboard

For some domains (Fasting, Photos, Exercise), you can independently choose whether the section appears on the Log page or the Dashboard:

- **Show on Log** — section shown on `/log`.
- **Show on Dashboard** — series available on the dashboard chart.

Useful when you want a feature enabled (for tracking) but visually quieter on a specific surface.

## Insights confidence floor

**Where**: Profile → Insights → Confidence floor.

**What**: Minimum confidence level for findings to surface on the dashboard. Below the floor, findings are computed but hidden.

Default: 0.30 (30%).

Raise it for fewer / higher-quality findings. Lower it to see more weak patterns.

The floor doesn't change what the AI assistant can reach via tool calls — only the dashboard's Insights surface.

## Notifications

**Where**: Profile → Notifications.

Per-domain toggles:

- **Cycle** — N days before next predicted period.
- **Compound reminders** — per-compound, set on the Compounds page.
- **Daily tracking reminder** — evening nudge if you haven't logged.
- **Fasting** — start / end notifications.

Master toggle: Profile → Notifications → All notifications.

OS-level permission must be granted separately.

## Bloodwork / Genetics / Conditions

**Where**: Profile → Settings → individual sections.

These are subject characteristics, not toggles. See:

- [Bloodwork](/tracking/bloodwork)
- [Genetics](/tracking/genetics)
- [Conditions](/tracking/conditions)

## Profile basics (subject)

**Where**: Profile → Basics.

These shape both the simulation and the calorie / macro targets:

- **Biological sex** — `male`, `female`, `other`. Drives Mifflin-St Jeor and simulation defaults.
- **Age** — years.
- **Height** — inches or cm depending on units.
- **Current weight** — lbs or kg.
- **Goal weight** — for ETA and projection.
- **Goal rate** — lbs/wk or kg/wk to lose. Drives suggested calorie target.

Changing any of these:

- Re-suggests calorie target (you can accept or override).
- Invalidates the simulation cache (next dashboard load re-simulates).

## Where things land per setting

- **Stored against your account** — settings sync across every device you sign into.
- **Cached locally** for fast page loads; changes write through immediately.
- **Triggers a fresh simulation** when you change anything that affects the model (sex, age, weight, height, bloodwork, genetics, conditions, menstruation) — the dashboard re-simulates on the next load.

## Common questions

**"Why doesn't my macro target update when I change activity level?"**
The activity level updates the *suggested* target. To accept the new suggestion, edit the target itself — the setting is preserved as a manual override on purpose, so re-picking your activity level doesn't accidentally rewrite your custom macros.

**"Can I have different units for different things (lbs for weight, kg for measurements)?"**
For most measurements, yes — each custom measurement has its own `displayUnit` override. For weight specifically, the global Units setting wins.

**"What if my time zone is wrong?"**
Most "today" calculations and reminder timing will be off. Update Profile → App → Time zone — the next request normalizes.

## Related

- [Glossary](/reference/glossary) — definitions for terms used here.
- [Compounds settings](/reference/compounds-settings) — for compound-specific fields.
