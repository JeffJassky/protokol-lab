---
title: Log a dose
description: Record GLP-1 and peptide doses, with active-amount curves computed automatically.
category: tracking
last_reviewed: 2026-05-10
---

# Log a dose

A "dose" is a single administration of a compound. The app stores when you took it and how much, then computes how much is active in your system over time. That curve is what the dashboard plots.

## Before your first dose

You need at least one **enabled compound**. The app comes preloaded with the major GLP-1s:

- Tirzepatide (Mounjaro / Zepbound)
- Semaglutide (Ozempic / Wegovy)
- Oral Semaglutide (Rybelsus)
- Liraglutide
- Dulaglutide
- Retatrutide

Enable the ones you take in **Profile → Compounds**. For anything else (custom peptides, prescriptions, supplements you dose on a schedule), see [Custom compounds](/tracking/custom-compounds).

## Logging a dose

The fast path:

1. Tap **Quick Log → Dosage** (or open the Log page).
2. If you have one enabled compound, the modal opens for it directly. If you have multiple, pick one first.
3. Enter the dose amount. The unit (mg, mcg, iu, ml) is whatever the compound uses.
4. The date defaults to today and the time to now. Change either if you're back-dating.
5. Tap **Add**.

That's it. The dashboard's PK curve updates the next time it loads. The simulation invalidates the affected day so the next request reflects your new dose.

## Stacked doses

If you dose more than once on the same day (rare for weeklies, common for daily peptides), each entry is its own log. The active-amount curve sums them: at any given moment, the dashboard shows the total of every dose's contribution at that point in its decay.

The sum is correct PK math, not a UI fiction. See [How stacked doses combine](/understanding/stacked-doses).

## Editing or deleting

Tap any dose entry on the Log page → edit or delete. Changes recompute the active-amount curve and re-trigger the simulation for that day onward.

## Reminders

The app can push a reminder when your next dose is due.

To set one up:

1. Open **Profile → Compounds**.
2. Tap a compound to expand it.
3. Toggle **Reminder** on.
4. Pick a time of day (HH:MM).

The reminder fires at that time on **dose days only**. Dose days are computed from the compound's interval (e.g., every 7 days for a weekly) plus your last logged dose. Skip a week, the next reminder shifts.

Reminders require:

- The app installed on your phone (see [Install](/getting-started/install)).
- Notification permission granted at the OS level.
- Notifications enabled in **Profile → Notifications**.

::: tip Smart skip
If you've already logged today's dose by the time the reminder would fire, the reminder is suppressed automatically.
:::

## What the curve means

The dashboard plots the **active amount** of each compound over time, not just dose dots. The math depends on the compound's:

- **Half-life** — how fast it eliminates from your system.
- **Kinetics shape** — bolus, sub-Q, or depot. See [Kinetics shapes](/tracking/kinetics-shapes).

For built-in GLP-1s, these come from the canonical catalog and aren't editable. For custom compounds, you set them yourself.

The math itself is documented in [How half-life curves work](/understanding/half-life).

## Common questions

**"Why does my Tirzepatide curve drop slowly between weekly doses?"**
That's the long half-life (~5 days). A weekly dose still has substantial active amount when the next one lands — you accumulate to a steady state over several weeks.

**"Can I log a dose I missed?"**
You shouldn't log doses you didn't actually take. The simulation depends on real data. If you're tracking adherence separately, mark the day's status (see [Tracked vs untracked days](/understanding/honest-streaks)) — a missed dose is real biology, the curve will reflect it.

**"What if my dose unit isn't in the list?"**
Built-in compounds have their unit fixed by the catalog. For custom compounds, the available units are mg, mcg, iu, and ml. If you need something else, normalize to one of those when entering.

**"Does the simulation use my dose log?"**
Yes. The endogenous biomarker simulation is driven by your DoseLog plus food, exercise, weight, and other inputs. See [Endogenous simulation](/understanding/endogenous-simulation).

## Privacy note

Dose data is some of the most sensitive data in the app. It never leaves your account, isn't used in any aggregated analytics that could re-identify you, and is included in your [data export](/account/export) along with everything else.

## Next

- [Custom compounds](/tracking/custom-compounds) — for anything not in the built-in list.
- [Kinetics shapes](/tracking/kinetics-shapes) — bolus, sub-Q, depot — and which to pick.
- [How half-life curves work](/understanding/half-life) — the math behind the curve.
