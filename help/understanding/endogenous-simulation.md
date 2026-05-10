---
title: Endogenous biomarker simulation
description: How the app predicts your hormones and biomarkers from your logs.
category: understanding
last_reviewed: 2026-05-10
---

# Endogenous biomarker simulation

The dashboard plots more than just what you logged. It also plots **predicted** values for hormones and biomarkers your body produces — driven by what you ate, what you dosed, what exercise you did, and your subject characteristics.

This page explains what's actually being computed.

## The short version

The app runs a **forward simulation** of your physiology. Inputs: your real logs. Output: predicted minute-by-minute (well, 15-minute-by-15-minute) values for a set of biomarkers — glucose, insulin, GLP-1, cortisol, growth hormone, and dozens of others.

It's a model. Not a measurement. The numbers it produces are estimates based on canonical physiology, not your specific body. But for a model with no fitting to your individual data, it gets a lot of patterns right that you'd otherwise have to infer manually.

## What it uses as input

Per-day, the simulation consumes:

- **Meals** — every consumed food entry, with full macro and micro nutrient profile, at the timestamp you ate. Pulled from your `FoodLog`.
- **Doses** — every canonical compound dose (Tirzepatide, Semaglutide, Liraglutide, Dulaglutide, oral Semaglutide, Retatrutide). Custom compounds are *not* in the simulation — they're plotted as PK curves only.
- **Exercise** — every exercise log entry with class (cardio / resistance / HIIT / recovery), duration, and intensity.
- **Your subject characteristics**:
  - Biological sex
  - Age
  - Height and weight
  - Cycle phase (if menstruation tracking is on)
  - Bloodwork values (where you've entered them)
  - Genetics variants (where you've entered them)
  - Diagnosed conditions

Day boundaries are at midnight UTC, but the simulation runs continuously across days using the previous day's end-state as the next day's start.

## What it computes

The output is a set of biomarker series, each at 15-minute resolution. The full list runs to dozens of signals, but the ones that show up most prominently on the dashboard:

- **Glucose** — blood glucose, mg/dL.
- **Insulin** — IU/mL.
- **GLP-1** — endogenous GLP-1, pmol/L. (Distinct from the receptor occupancy by exogenous compounds.)
- **Cortisol** — nmol/L. Responds to stress, exercise, sleep timing.
- **Growth hormone** — ng/mL. Pulses; responds to fasting and exercise.
- **Glucagon, GIP, ghrelin, leptin, adiponectin** — and others.

Plus **receptor occupancy** for the major targets (GLP-1R, GIPR), which combines endogenous signaling with what your dose is contributing.

## How it's not just MET × kg

Standard fitness math does things like `kcal = MET × kg × hours × intensity` for exercise burn. That's a rough proxy. The simulation does something deeper: it models the actual physiology — adrenal response, glucose uptake by muscle, fatty acid oxidation, glycogen depletion — based on your inputs.

The result is that the same "30 minutes moderate cardio" can produce different downstream effects depending on:

- Whether you ate just before or after.
- Whether you're in a fasted or fed state.
- Whether you're on a GLP-1 (changes glucose and insulin response).
- Your cycle phase (affects cortisol and insulin sensitivity).

The simulation accounts for these. The flat MET formula doesn't.

## How the math works

The simulation is a system of ODEs (ordinary differential equations) describing how each biomarker changes over time as a function of:

- The current state (every other biomarker).
- Inputs at this moment (food, doses, exercise).
- Subject parameters (genetics, conditions, bloodwork, cycle).

The solver runs at 15-minute steps and produces full series for every modeled biomarker.

When you log new data, the affected days re-simulate on the next dashboard load. Days that haven't changed reuse the prior result, so most page loads are near-instant.

## What it isn't

- **It's not a measurement.** The simulation can't tell you your actual glucose at 3pm yesterday. A continuous glucose monitor can. The simulation tells you what the model predicts your glucose did, given your logs.

- **It's not fitted to you.** The model uses canonical physiology — average parameters from published literature. It doesn't tune to your individual responses. If you have idiosyncratic insulin sensitivity, lipid metabolism, or cortisol dynamics, the predicted numbers will be off in your specific direction.

- **It's not medical.** Don't make medication decisions based on simulated glucose. Use a meter or CGM.

- **It's not a black box, but it's also not transparent line-by-line.** The math is hundreds of equations and parameter tables. We can describe what's modeled and the major mechanisms; we can't display the live derivation in the UI.

## When it's most useful

The simulation surfaces patterns you'd otherwise have to infer:

- **GLP-1 receptor occupancy** stays high for days after a weekly dose, but with a clear oscillation between dose intervals. Seeing it visually is the difference between "I dosed Sunday" and "you spent Monday–Wednesday in saturation, started dropping Thursday."

- **Cortisol response** to exercise + fasted vs fed state. Same workout, very different downstream effect on glucose and insulin depending on context.

- **Female cycle effects** on insulin sensitivity and glucose disposal. Real for many women; the simulation captures it.

- **Concomitant compound interactions.** Stacking Tirzepatide + Retatrutide isn't just adding two PK curves. The simulation models combined receptor activity.

## When it's not useful

- For specific questions about your individual response curves. Use a CGM.
- For making prescribing decisions.
- For predicting response to a compound that isn't in the canonical catalog. Custom compounds aren't in the simulation.

## Caveats specific to GLP-1 users

The canonical model assumes typical pharmacokinetics for the catalog peptides. If you're on:

- **Compounded versions** that may have non-standard absorption profiles, the model uses the canonical kinetics — your actual exposure may differ.
- **Counterfeit / low-quality sources**, the simulation is pretending you took the real thing. It can't know otherwise.
- **Doses outside the canonical range**, the model extrapolates and reliability decreases.

For most users on prescription GLP-1s at typical doses, the simulation is a useful first approximation.

## Related

- [How half-life curves work](/understanding/half-life) — the simpler PK-only view.
- [How stacked doses combine](/understanding/stacked-doses) — what changes when there are multiple compounds.
- [Pattern insights](/understanding/pattern-insights) — how the engine surfaces patterns from the simulation output.
