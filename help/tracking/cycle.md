---
title: Menstruation
description: Track your cycle, see phase predictions, and let the simulation account for it.
category: tracking
last_reviewed: 2026-05-10
---

# Menstruation

About half the GLP-1 audience is women, but most trackers ignore that the menstrual cycle changes how the body responds to almost everything — appetite, water retention, insulin sensitivity, mood. This system tracks your cycle and feeds it into the simulation.

## What you'll see

If menstruation is enabled, the Log page shows a small banner with:

- **Current cycle day** (e.g., "Cycle day 14").
- **Current phase** (menstrual / follicular / ovulation / luteal).
- **Days until next period** (countdown).

The banner replaces a generic "today's date" header on the Log page when the feature is on.

## Setup

1. **Profile → Settings → Tracking → Menstruation**.
2. Enable.
3. Enter:
   - **Last period start** — first day of your most recent period.
   - **Cycle length** — how many days between starts. Default 28; the app accepts 20–45.
   - **Period length** — how many days you bleed. Default 5; range 1–10.
   - **Luteal phase length** — second half of cycle. Default 14; range 10–20.
4. Save.

You don't need to be perfectly regular. The app uses your average cycle length as a baseline; if you're irregular (PCOS, perimenopause, post-partum), the math gracefully handles cycles that land 7+ days early or late.

## Logging a new period

When your period starts:

1. Log page → cycle banner → **Start period today** (or pick a different date).
2. The app updates "last period start" and recomputes everything downstream.

The "Start period" option only appears in plausible windows — within ~7 days of the expected next period, or when you have no anchor yet. The mid-follicular window hides it (a fresh start there isn't biologically plausible).

## Phase math

The four phases are defined relative to your cycle:

- **Menstrual** — days 1 through your period length (default: days 1–5).
- **Follicular** — period end through ovulation−1.
- **Ovulation** — a 3-day window centered on `cycleLength − lutealPhaseLength`. For a 28-day cycle with 14-day luteal, that's days 13–15.
- **Luteal** — ovulation+2 through end of cycle.

If your cycle runs over its expected length, the math wraps — cycle day 32 of an "expected 28" cycle is treated as day 4 of the next.

## Predictions

The app predicts:

- **Next period date** = anchor + cycle length, advancing if past.
- **Next ovulation date** = next cycle start + (cycleLength − lutealPhaseLength).

These are just averages projected forward. They're not contraception-grade. If you're tracking for fertility purposes, use a dedicated tool with temperature, cervical mucus, and LH testing.

## Notifications

If notifications are enabled, the app can alert you a configurable number of days before your next period:

1. **Profile → Notifications → Cycle**.
2. Toggle on.
3. Pick lead time (default: 2 days before).

The reminder fires once per cycle.

## How cycle affects the simulation

The simulation reads:

- **Sex = female**, and
- **Menstruation enabled**, and
- **Last period start + cycle length + luteal length**.

From those, it computes your current cycle day and phase, and applies phase-specific adjustments:

- **Insulin sensitivity** — varies across the cycle (typically higher follicular, lower luteal).
- **Cortisol baseline** — shifts with hormonal context.
- **Glucose disposal** — affected by progesterone in luteal.
- **Water retention** — predictable luteal effect.

Concrete example: a fixed-calorie day late luteal vs early follicular produces different predicted glucose and insulin responses. The dashboard chart will show the difference if you compare.

## Common reactions

**"My cycle is wildly irregular — does this still work?"**
The app uses your provided cycle length as a baseline but doesn't punish irregularity. If you get a period 35 days into a 28-day cycle, log the new start; the cycle resets. The simulation uses whatever the current cycle's anchor and length are.

**"I'm post-menopausal."**
Disable menstruation. The simulation handles post-menopausal physiology when sex=female and menstruation is off.

**"I'm on hormonal contraception or HRT."**
This complicates things. If your contraception suppresses ovulation entirely (most combined pills, hormonal IUDs after a few months), turning menstruation off and tracking hormones in [Bloodwork](/tracking/bloodwork) is more accurate. If you have breakthrough bleeding patterns that approximate a cycle, you can track them, but understand the model is fitting to apparent cycle phases that may not reflect underlying physiology.

**"I want to track period symptoms specifically."**
Add custom [symptoms](/tracking/log-a-symptom): "cramping," "PMS mood," "breast tenderness," etc. They'll show up alongside everything else in the symptom log.

## Privacy

Cycle data is sensitive personal data. Stored encrypted, against your account only, never used in cross-user analytics. Included in [export](/account/export) and removed on [deletion](/account/delete).

## Related

- [Bloodwork](/tracking/bloodwork) — for tracking cycle hormones (estradiol, progesterone, LH, FSH).
- [Conditions](/tracking/conditions) — PCOS specifically interacts with cycle math.
- [Endogenous simulation](/understanding/endogenous-simulation) — phase effects on the model.
