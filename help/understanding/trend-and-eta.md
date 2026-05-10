---
title: Trend line and ETA
description: How the regression line on your weight chart is computed, and what the projection means.
category: understanding
last_reviewed: 2026-05-10
---

# Trend line and ETA

Your weight chart shows daily dots (raw entries) and a smoothed line through them (the trend). The "ETA to goal" stat is a forward projection from that trend. This page explains both.

## Why a trend line at all

Daily weight fluctuates by 1–3 lb on water, glycogen, sodium, sleep, and digestion. None of that is meaningful body composition change.

Looking at single days, you can't tell if you're losing fat, gaining muscle, or just retaining water. A trend line filters the noise.

## How the trend is computed

The trend line is a **linear regression** through your weight entries:

```
weight(date) ≈ slope × (date − epoch) + intercept
```

The regression finds `slope` and `intercept` that minimize the squared distance to your actual entries. Output:

- **slope** — how much weight is changing per day (or per week for display).
- **intercept** — implied "today's smoothed value" derived from the line.

The line is straight. It assumes a roughly linear rate of change. Over a few weeks of consistent intake and dosing, that's usually true. Over months with major changes (dose escalation, plateau breaks), one straight line stops fitting — which is why the chart's range tabs (30d, 90d, 6m, 1y) recompute the regression for the visible window.

## Reading the slope

The dashboard's stat grid shows trend in your unit per week:

- **−1.2 lb/wk** — you're losing about 1.2 pounds a week (averaged over the window).
- **−0.5 kg/wk** — same, in metric.
- **+0.1 lb/wk** — basically flat.

A trend of `0.0 ± 0.3 lb/wk` is statistically indistinguishable from flat over a normal data set. Don't read meaning into a trend that small.

## Weekly average vs trend

Two related but different stats:

- **Weekly average** — the **trend line's value at today**. Smoothed point estimate.
- **Trend** — the **slope** of that line.

The weekly average answers "where are you, smoothed." The trend answers "which way are you moving." Both come from the same regression.

## ETA to goal

Given a target weight and a current trend slope:

```
days remaining = (current weighted value − goal) / |slope|
ETA weeks = round(days remaining / 7)
```

The ETA stat shows weeks-until-goal, assuming the current trend continues.

## Why ETA is approximate

Several reasons it's an estimate, not a promise:

1. **Trends slow down.** Most users lose faster early and slower late. Linear projection over a long horizon over-predicts.
2. **Plateaus happen.** Real loss isn't smooth. Multi-week plateaus interleave with whoosh weeks. The regression smooths these but doesn't predict them.
3. **Body composition changes the math.** As you lose weight, your TDEE drops. Same calorie deficit produces less loss as you shrink.
4. **Behavioral drift.** Long-term targets often involve behavioral relaxation. The first 10 lb of a 30-lb cut is rarely as fast as the next 20.

Treat ETA as "if everything stayed exactly like the past N days, you'd hit your goal in M weeks." That's a useful frame, not a prediction.

## When the trend line lies

The trend line can be misleading in:

- **Very short windows** — < 14 days of data. Fits the noise.
- **Single huge outlier** — one binge or one weighted-on-shoes day pulls the slope.
- **Step changes** — when something fundamental changed (started a compound, big dose change), the line averages across the change. Use the range tabs to scope to one regime.
- **Recomp periods** — if you're losing fat and gaining muscle, weight is roughly flat. The trend reads "no progress" while body composition is changing fast. Photos and waist matter more here.

## How to read the chart

A few patterns:

**Steady deficit, normal flux:**
```
●     ●        ●
   ●     ●  ●        ●
●     ●        ●
─────────────── ← trend slopes down gently
```

**Plateau then break:**
```
●  ●  ●  ●     ●
   ●  ●     ●     ●
                      ●  ←
                    ●        whoosh
                 ─────── ← trend updates
```

**Recomp:**
```
●  ●  ●  ●  ●  ●  ●  ●
─────────────── ← trend flat
                  (but waist + photos changing)
```

If your trend line is flat but waist is dropping, you're recomping. Don't change anything.

## How the regression handles missing days

Days you didn't weigh in are simply not in the regression. The line fits whatever entries you have. More entries = tighter fit; sparse data = noisier slope.

For the trend to be reliable, aim for ≥3 entries per week. Daily is best.

## How the simulation uses the trend

The simulation doesn't read the trend directly. It reads your raw weight entries — they're a subject input alongside height, age, etc. The trend line is a UI device for human reading.

## Common questions

**"My ETA jumped from 14 weeks to 22 weeks overnight. Why?"**
You probably had a high reading that bumped the smoothed weighted-average value, or the slope flattened slightly. ETA is sensitive to slope — a 10% slope change shifts ETA noticeably. Look at the past 3 weeks; one anomalous day can shift the projection.

**"Should I weigh every day?"**
It helps. More entries reduce regression variance. If daily isn't sustainable, 3–4 times a week works. Less than that and the trend is a noisy estimate.

**"Why is the regression linear and not curved?"**
Linear fits well for typical short-to-medium horizons. Exponential or sigmoidal fits would over-fit on most users' data — the noise dominates and a curve picks up the wrong inflection. If we ever land long-horizon weight projections (year+), a non-linear fit might be worth it. Today, linear is the right call.

**"Can I change the regression window?"**
The chart's range tabs (30d, 90d, 6m, 1y, All) each compute their own regression. Pick the one that matches the period you care about.

## Related

- [Rolling 7-day budget](/understanding/rolling-7-day) — the calorie input.
- [Pattern insights](/understanding/pattern-insights) — change-point detection picks up regime changes the trend line averages over.
