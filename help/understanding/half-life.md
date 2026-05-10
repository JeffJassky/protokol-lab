---
title: How half-life curves work
description: The math the app uses to plot how much of a compound is active in your system over time.
category: understanding
last_reviewed: 2026-05-10
---

# How half-life curves work

Every dose curve on your dashboard plots **active amount over time** — not just dose timing. This page explains where the numbers come from.

## The basic idea

When you take a compound, two things happen:

1. **Absorption** — the compound enters your bloodstream from wherever you administered it (subcutaneous tissue, an oral mucosa, an IV).
2. **Elimination** — your body clears it (liver, kidneys, breakdown).

Both processes follow first-order kinetics in the simple case: at any moment, the rate of change is proportional to how much is left. That gives you exponential curves and a single number — the **half-life** — that summarizes them.

## Half-life

The half-life is how long it takes for the amount of a compound in your system to drop to half of what it was. It's a property of the compound (and you, but the variation is small relative to the average).

Some half-lives the app knows:

| Compound | Half-life |
|---|---|
| Tirzepatide | ~5 days |
| Semaglutide | ~7 days |
| Liraglutide | ~13 hours |
| Dulaglutide | ~5 days |
| Retatrutide | ~6 days |

A 5-day half-life means: after 5 days, half the dose remains active. After 10 days, a quarter. After 15, an eighth. And so on.

## The math

For a single dose of a compound with elimination rate $k_e = \ln(2) / t_{1/2}$, the active amount $A(t)$ at time $t$ after dosing is:

**Bolus (instant peak):**
$$A(t) = D \cdot e^{-k_e t}$$

Where $D$ is the dose. This is what you'd see if you took the compound IV — instant peak, exponential decay.

**Sub-Q or oral (Bateman absorption + elimination):**

Real-world peptides aren't bolus. They absorb through tissue over hours, peak, then eliminate. That's the **Bateman function**:

$$A(t) = D \cdot \frac{k_a}{k_a - k_e} \cdot (e^{-k_e t} - e^{-k_a t})$$

Where $k_a = \ln(2) / t_{1/2,abs}$ is the absorption rate.

For the app's defaults:

- **Sub-Q** absorption half-life: ~6 hours (0.25 days).
- **Depot** absorption half-life: ~24 hours (1 day).

The Bateman curve rises from zero to a peak, then declines. Sub-Q peaks fast, depot peaks slow and lower.

## What you see on the dashboard

For each enabled compound, the dashboard plots one curve. Each curve is the **sum** of all your dose contributions: at any moment, the line shows the total active amount across all doses you've taken.

This is what makes weekly compounds interesting. With a 5-day half-life and a weekly schedule, by the time the next dose lands, you still have most of the previous one. You accumulate to a steady state over several weeks — the floor (trough before next dose) and ceiling (peak after) both rise until they level off.

## Stacked doses

If you take more than one compound, each gets its own curve. They don't interact in the math — each curve is independent. See [How stacked doses combine](/understanding/stacked-doses) for the longer version.

If two compounds act on the same receptor (Tirzepatide + Retatrutide both hit GLP-1R, GIPR), the **clinical effect** combines, but the active-amount curves are still plotted separately. Combining receptor occupancy is what the [endogenous biomarker simulation](/understanding/endogenous-simulation) does.

## What "active amount" actually means

The active-amount curve plots the **mass** of compound remaining (in mg, mcg, iu, or whatever unit the compound uses), not its **effect**.

Effect doesn't track active amount linearly. GLP-1 receptor agonists, for example, saturate — past a certain receptor occupancy, more compound doesn't add more effect. The curve tells you how much is in your system. Effect modeling is the job of the simulation.

## Caveats

- **Individual variation matters.** Half-lives in the table above are population averages. Your liver, kidneys, body composition, age, and concomitant drugs can shift them by ±20% or more. The curve is an estimate, not a measurement.
- **Custom compounds inherit the kinetics shape you pick.** If you set up a custom peptide as "sub-Q" but it's actually a long-acting depot formulation, the curve shape will be wrong. See [Kinetics shapes](/tracking/kinetics-shapes).
- **The app doesn't model bioavailability.** Oral compounds have low bioavailability (Rybelsus is ~1%). The catalog adjusts the effective dose where applicable; for custom compounds, you'd enter the effective dose, not the swallowed dose.
- **Half-life isn't constant for everyone.** Compromised liver/kidney function lengthens it. The numbers above assume healthy adults.

## Where to change kinetics for custom compounds

**Profile → Compounds → [your compound] → Half-life / Kinetics shape.**

For built-in GLP-1s, kinetics are fixed by the canonical catalog and aren't editable. If you have reason to believe yours metabolize differently (which would be unusual), use a custom compound entry instead.

## Related

- [Kinetics shapes](/tracking/kinetics-shapes) — bolus, sub-Q, depot.
- [How stacked doses combine](/understanding/stacked-doses) — multi-dose math.
- [Endogenous biomarker simulation](/understanding/endogenous-simulation) — what the app does with the curves.
