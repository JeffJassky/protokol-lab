---
title: Kinetics shapes
description: Bolus, sub-Q, and depot — what they mean and which to pick.
category: tracking
last_reviewed: 2026-05-10
---

# Kinetics shapes

When you create a [custom compound](/tracking/custom-compounds), you pick a **kinetics shape**. This controls the silhouette of the active-amount curve over time. There are three options.

## The three shapes

### Bolus

**Instant peak, exponential decay.**

What it looks like:

```
Active │█
       │█
       │█▆
       │█▆▅
       │█▆▅▄
       │█▆▅▄▃▂▁
       └──────────── time
       0
```

When to pick it:

- IV-administered drugs (no absorption phase).
- Anything that hits the bloodstream within minutes — sublingual, intranasal, IV.
- Compounds with very short absorption phases relative to their elimination half-life.

The math:

$$A(t) = D \cdot e^{-k_e t}$$

Where $D$ is the dose and $k_e = \ln(2) / t_{1/2}$ is the elimination rate.

### Sub-Q (default)

**Rises over hours, declines over days.**

What it looks like:

```
Active │   ▃▄▅▆█▇▆▅▄
       │  ▂▃        ▃▂
       │ ▁            ▁
       └────────────────── time
       0  ↑  ↑           
        absorb  peak    
```

When to pick it:

- Subcutaneous self-injected peptides (most GLP-1s, BPC-157, TB-500, HRT injections).
- Intramuscular injections (slightly faster than sub-Q in real life, but close enough).
- Oral medications with non-trivial absorption.

This is the default. About 90% of the time, this is correct for what self-administered peptide users dose.

The math (Bateman function):

$$A(t) = D \cdot \frac{k_a}{k_a - k_e} \cdot (e^{-k_e t} - e^{-k_a t})$$

Where $k_a$ is the absorption rate. The app uses an absorption half-life of ~6 hours for sub-Q.

### Depot

**Slow rise, low peak, very long tail.**

What it looks like:

```
Active │       ▃▄▄▄▅▅▅▄▄
       │     ▂▃          ▃▂
       │   ▁                ▁
       │ ▁                    ▁
       └─────────────────────────── time
       0       ↑ peak         
```

When to pick it:

- Long-acting weekly preparations in oil (testosterone cypionate / enanthate, estradiol valerate in oil).
- Implants and depot formulations.
- Anything where the marketing material says "depot," "long-acting," or "extended-release."

The math is the same Bateman function, but with a much longer absorption half-life (~24 hours instead of 6).

## How to pick

A simple decision tree:

1. **Is it administered IV?** → Bolus.
2. **Is the absorption time-to-peak more than a day?** → Depot.
3. **Otherwise** → Sub-Q.

If you're not sure, sub-Q is the safest default. The shape only affects the rising edge of the curve; the elimination half-life dominates the falling edge.

## Common confusions

**"My weekly compound has a long half-life — should I use depot?"**
Not necessarily. Long half-life and depot kinetics are independent. Tirzepatide has a 5-day half-life but is administered sub-Q (you peak within hours). Use sub-Q for any standard self-injected peptide regardless of half-life.

**"What about oral GLP-1s?"**
The app's catalog handles oral Semaglutide (Rybelsus) directly. For custom oral compounds, sub-Q is the closest available approximation — both have similar Bateman-shaped absorption profiles. Bolus would assume the drug appears in your bloodstream instantly, which oral never does.

**"What's the difference visually?"**
- Bolus peaks at hour 0, declines from there.
- Sub-Q peaks 2–8 hours after dosing.
- Depot peaks 1–3 days after dosing.

If you can't tell from the silhouette which shape is right, the difference probably doesn't matter much for your tracking — pick sub-Q and move on.

## How the kinetics shape affects the dashboard

The active-amount curve is what changes. The dashboard's "active" series for a custom compound uses your chosen shape's math.

What doesn't change:

- The dose log itself.
- Which day a dose is logged on.
- The reminder system.

So if you pick the wrong shape, you can fix it without losing data — change the shape on the compound, and the curve recomputes.

## Built-in compounds have fixed shapes

For the catalog GLP-1s (Tirzepatide, Semaglutide, etc.), the kinetics shape is fixed by the canonical catalog. You can't change them. The catalog is sub-Q for all of them, except oral Semaglutide which is modeled as oral absorption.

If you have reason to believe one of those metabolizes differently for you, use a custom compound entry to model it.

## Related

- [Custom compounds](/tracking/custom-compounds) — where you pick the shape.
- [How half-life curves work](/understanding/half-life) — the math behind the curves.
- [How stacked doses combine](/understanding/stacked-doses) — when shapes overlap.
