---
title: How stacked doses combine
description: What happens when multiple doses of the same or different compounds overlap.
category: understanding
last_reviewed: 2026-05-10
---

# How stacked doses combine

Most users dose more than once a week. Many stack multiple compounds. The dashboard's curves combine these correctly — this page explains how.

## Same compound, multiple doses

If you dose Tirzepatide weekly, you have many doses overlapping over the course of a month. Each dose contributes its own Bateman curve (rise → peak → exponential decay). The active-amount curve at any moment is the **sum** of every dose's contribution at that moment.

```
       Dose 1 alone:   ▁▃▆█▆▅▄▃▂▁
       Dose 2 alone:           ▁▃▆█▆▅▄▃▂▁
       Sum:            ▁▃▆█▆▆▇█▇▆▅▄▃▂▁
                       ↑       ↑
                       Dose 1  Dose 2
```

This is mathematically correct. Pharmacokinetics is linear at therapeutic doses — two simultaneous doses produce the additive sum, not some squared or saturated combination.

## Build-up to steady state

For weekly compounds with ~5-day half-lives, the trough of each dose is still ~50% of the peak when the next dose lands. Over several weeks, the trough rises until peak and trough stabilize:

- Week 1: peak X, trough ~0.5X.
- Week 2: peak ~1.5X, trough ~0.75X.
- Week 3: peak ~1.75X, trough ~0.875X.
- ...
- Steady state: peak ~2X, trough ~X.

The dashboard's PK curve shows this build-up. If you started Tirzepatide three weeks ago, you're still climbing toward steady state. By week 5–6, you're stable.

## Different compounds (independent curves)

Doses of different compounds don't combine in the active-amount math. Each compound gets its own curve. If you take both Tirzepatide and Retatrutide, the dashboard plots two separate curves, each summing only its own doses.

```
Tirzepatide:  ▁▃▆█▆▅▄▃▂▁
Retatrutide:  ▁▃▆█▆▅▄▃▂▁
              (two separate lines on the chart)
```

The two curves don't get added together because they represent **different molecules**. Adding them would be a category error.

## What does combine: receptor effects

Two compounds that hit the same receptor (e.g., Tirzepatide and Retatrutide both activate GLP-1R) produce a **combined receptor effect**, even though their molecules are tracked separately.

That combined effect is what the [endogenous biomarker simulation](/understanding/endogenous-simulation) computes. The simulation knows:

- Tirzepatide's affinity for GLP-1R, GIPR.
- Retatrutide's affinity for GLP-1R, GIPR, glucagon receptor.
- How much of each is currently in your system (from the PK curves).
- Combined receptor occupancy at any moment.

So the dashboard shows two separate active-amount curves, but the **simulated downstream effects** (insulin response, glucose disposal, satiety) reflect the combined receptor activation.

## What about same-day multiple doses?

Some users split a weekly dose across days (e.g., half-Monday, half-Thursday) to smooth the peak. The math handles this fine — each half-dose is its own Bateman curve, and the sum is two smaller waves instead of one big one.

For daily peptides with very short half-lives (BPC-157, Tesamorelin), multiple doses per day are normal. Same math: each dose adds its curve.

## Stacked custom + canonical

You can mix custom and canonical compounds. Canonical compounds (Tirzepatide, etc.) are in the simulation engine; custom compounds aren't. So:

- **PK curves**: both plot independently on the dashboard.
- **Simulation receptor effects**: only canonical compounds contribute.
- **Pattern insights**: both participate (correlations between custom dose and weight, symptoms, etc. all work).

If you're stacking BPC-157 (custom) with Tirzepatide (canonical), the dashboard shows two curves. The simulation models Tirzepatide's effects on your hormones; BPC-157's effects aren't simulated (we'd need pharmacology metadata we don't have for generic peptides).

## Practical implications

**You can dose the same week as a previous one without "starting over."** The previous dose is still partly active. The next one stacks.

**Skipping a week** means the curve declines for ~2 weeks before bottoming out. Skipping doesn't fully reset — at week 2 post-skip you're still at ~0.5x normal trough.

**Switching compounds** (e.g., Tirzep → Reta) creates a transition window. Your residual Tirzep curve continues for ~3 weeks while the new Reta curve builds up. The simulation models receptor occupancy across this transition correctly.

**Compounded versions** with the same active ingredient stack with the catalog version. If you use both prescription Tirzepatide and a compounded version, log both — the math is additive at the molecule level.

## Common questions

**"Should I see the combined active amount across all my GLP-1s?"**
The dashboard plots them separately by default — clearer for understanding individual contributions. The simulation handles the combined receptor effect downstream.

**"What if I dose at different doses each week (titration)?"**
The math handles it. Week 1 at 2.5mg gives a smaller curve. Week 2 at 5mg gives a bigger curve overlapping the residual. You'll see the build-up clearly during titration.

**"Why doesn't my curve match published PK studies?"**
Published curves usually show single-dose pharmacokinetics in healthy volunteers. Real-world stacked dosing produces accumulated curves that don't look like the textbook diagram. The math is the same; the visual is different.

**"Is the math for stacked doses different from single-dose math?"**
No. Linear pharmacokinetics. The sum of two single-dose curves is the multi-dose curve.

## Related

- [How half-life curves work](/understanding/half-life) — single-dose math.
- [Endogenous simulation](/understanding/endogenous-simulation) — what receptor occupancy does.
- [Kinetics shapes](/tracking/kinetics-shapes) — bolus, sub-Q, depot.
