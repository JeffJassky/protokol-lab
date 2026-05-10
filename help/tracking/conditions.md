---
title: Conditions
description: Track diagnosed conditions so the simulation accounts for them.
category: tracking
last_reviewed: 2026-05-10
---

# Conditions

Some diagnoses meaningfully change how your body responds to food, exercise, and compounds. The app lets you enable a small set of clinically-relevant conditions so the simulation accounts for them in your baseline.

## What's tracked

The app's condition catalog is intentionally narrow — only conditions whose physiology is modeled:

- **ADHD**
- **Autism spectrum**
- **Depression**
- **Anxiety**
- **POTS** (Postural Orthostatic Tachycardia Syndrome)
- **MCAS** (Mast Cell Activation Syndrome)
- **Insomnia**
- **PCOS** (Polycystic Ovary Syndrome)
- **COMT (slow)** — catechol-O-methyltransferase variant affecting dopamine clearance.
- **MTHFR** — methylation pathway variant.

Why so few? The simulation engine has explicit pharmacology adjustments for each one. Adding a condition means writing the math for how it shifts the model. We only add conditions where we can actually back the change with real biology.

## What's not in the list

If your condition isn't here, don't shoehorn it into something close:

- General autoimmune conditions, IBS, IBD, GERD, migraine, fibromyalgia — not modeled. Track via [day notes](/tracking/journal) and [symptoms](/tracking/log-a-symptom) instead.
- Rare diseases — out of scope.
- Cancer history — out of scope.

## How to enable

1. **Profile → Conditions**.
2. Toggle each condition you have.
3. Some conditions have parameters (e.g., POTS has a "severity" parameter, PCOS has subtype options). Fill in if applicable.
4. Save.

Only enabled conditions affect the simulation. Disabling reverts the simulation to baseline for that condition.

## How conditions affect the simulation

Each condition has its own adjustments. Examples:

- **PCOS**: shifts insulin sensitivity, modifies cycle hormone profiles, adjusts androgen baseline.
- **POTS**: alters cardiovascular response to exercise and posture changes.
- **ADHD / autism**: dopamine and norepinephrine baseline shifts; affects stimulant response if the user logs related compounds.
- **Depression / anxiety**: HPA axis (cortisol response) tuning.
- **Insomnia**: cortisol, melatonin, growth hormone pulse timing changes.
- **MTHFR / COMT**: pathway-level adjustments to methylation and catecholamine clearance.

The adjustment factors are designed to be conservative — significant enough to matter, not so aggressive that any one condition swamps the rest of the model.

## Combinations

Multiple conditions stack. PCOS + insomnia + anxiety produces a cumulative shift in cortisol baseline. The math doesn't double-count where conditions overlap; the engine handles the combinations explicitly.

## Should I enable conditions I'm not sure I have?

No. Only enable diagnosed conditions or ones where you have strong evidence (e.g., a documented genetic variant for COMT or MTHFR; a positive lab result for PCOS criteria).

The simulation is more useful when its assumptions match reality. Enabling conditions you don't have produces a model tuned to the wrong baseline — you'd be reading predictions from a person who doesn't exist.

## Common questions

**"Why is PCOS in here but not endometriosis?"**
PCOS has well-characterized metabolic effects (insulin sensitivity, androgens) that the engine models. Endometriosis affects the reproductive system but doesn't have the same kind of system-wide metabolic signature. We don't add a condition unless we have something specific to tune.

**"What if I have something like type 2 diabetes?"**
Enter your diabetes-relevant labs (HbA1c, fasting glucose, insulin) on [Bloodwork](/tracking/bloodwork). The simulation reads from labs, not from a "T2D" flag. The values themselves drive the model.

**"Are conditions visible to the AI assistant?"**
Yes. The AI sees enabled conditions and can reference them in explanations. Same for the [export](/account/export) and account deletion.

**"Will more conditions be added?"**
Slowly. The threshold is "we can model this in the simulation." Conditions purely for context (without simulation impact) might be added as informational tags, but they don't drive math.

## Privacy

Conditions are personal medical data. Stored encrypted, against your account only, never used in cross-user analytics. Included in [export](/account/export) and removed on [deletion](/account/delete).

## Related

- [Bloodwork](/tracking/bloodwork) — labs that complement condition flags.
- [Genetics](/tracking/genetics) — variant-level tuning.
- [Endogenous simulation](/understanding/endogenous-simulation) — how conditions plug into the math.
