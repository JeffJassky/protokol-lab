---
title: Bloodwork
description: Track lab results across panels with reference ranges, and feed them into the simulation.
category: tracking
last_reviewed: 2026-05-10
---

# Bloodwork

Track lab values across the panels you actually run. Each value is checked against a reference range; over time the trend is more informative than any single result.

## What's tracked

The app organizes labs into panels matching what most lab-order systems use. Coverage includes:

- **Metabolic** — glucose, insulin, HOMA-IR, HbA1c, leptin, ghrelin, etc.
- **Lipids** — total cholesterol, LDL, HDL, triglycerides, ApoB, Lp(a).
- **Hormones** — testosterone (total, free, SHBG-corrected), estradiol, progesterone, DHEA-S, cortisol, prolactin.
- **Thyroid** — TSH, free T3, free T4, reverse T3, TPO antibodies.
- **CBC** — RBC, WBC, hemoglobin, hematocrit, platelets, etc.
- **Iron studies** — ferritin, iron, TIBC, transferrin saturation.
- **Inflammation** — hsCRP, fibrinogen, homocysteine.
- **Renal & liver** — BUN, creatinine, eGFR, ALT, AST, GGT, alkaline phosphatase, bilirubin.
- **Vitamins** — D (25-OH), B12, folate, methylmalonic acid.
- **Other** — uric acid, magnesium, RBC magnesium, vitamin K markers, etc.

The exact field list comes from a curated bloodwork catalog built into the simulation engine. As the catalog grows, the app picks up new fields automatically.

## How to enter values

1. **Profile → Bloodwork**.
2. Pick the panel (Metabolic, Lipids, etc.).
3. Each field shows its reference range and units.
4. Type your value — the app coerces and clamps to the field's reasonable range.
5. Save.

Each entry stores against your account at the date you enter (defaults to today). Backdate by changing the date when entering a value.

## What the numbers mean

The reference ranges are population averages for healthy adults. They're a starting point, not a target.

What "normal" means depends on:

- **Lab-specific ranges** — Quest, LabCorp, and ZRT all use slightly different boundaries. Don't worry about ±5% of the line.
- **Your context** — TSH 4.0 is "normal" by lab range but considered high by many endocrinologists. The app shows the field's standard range; clinical interpretation is your doctor's job.
- **Trends matter more than single values** — a steady drift in one direction across multiple draws is more meaningful than any single number.

## How bloodwork affects the simulation

Bloodwork values are part of your **subject characteristics** that feed the [endogenous biomarker simulation](/understanding/endogenous-simulation). Specifically:

- Baseline metabolic markers (glucose, insulin, leptin) tune the model's starting point.
- Hormone levels (testosterone, estradiol, cortisol) shift the relevant pathways.
- Lipid panel and liver enzymes affect drug clearance assumptions for some compounds.

Concretely: with a normal HbA1c, the simulation starts you in a euglycemic baseline. With elevated HbA1c, the baseline shifts toward chronic hyperglycemia, and dose responses model accordingly.

## Frequency

There's no app-side requirement for how often to update labs. Common patterns:

- **Quarterly** — for users on GLP-1 or HRT, tracking quarterly is enough to see meaningful trends.
- **Pre/post protocol** — before starting and after 12 weeks of any new compound.
- **Annual** — minimum baseline, but not enough to read trends.

When you add a new value, the app retains the old one in history so you can see the trajectory.

## Trends and history

The Bloodwork page shows the latest value per field plus a small inline trend if you have ≥2 entries. Tapping a field surfaces a chart of all entries over time.

Bloodwork values are also a **series** for the multi-series dashboard chart, so you can overlay (say) HbA1c against weight, or testosterone against energy symptom logs.

## Common questions

**"What if I don't have a value for a field?"**
Leave it blank. Missing fields don't break anything — the simulation falls through to default values. Only fields you actually enter shape the model.

**"What if my lab uses different units (e.g., mmol/L vs mg/dL)?"**
Each field has a fixed unit listed in the form. If your lab reports in a different unit, convert before entering.

**"Can I upload a PDF of my labs?"**
Not currently — entries are manual. You can copy from a PDF into the form. (PDF parsing is on the roadmap.)

**"Will my doctor see this?"**
Only if you share an [export](/account/export) with them. Nothing leaves your account otherwise.

**"Are values used for anything beyond the simulation?"**
Yes — the AI assistant can reference them, and the multi-series chart can plot them against any other series.

## Privacy

Lab values are some of the most sensitive data in the app. They're stored against your account, encrypted in transit and at rest, and never used in any cross-user analytics. They're included in your [data export](/account/export).

## Related

- [Endogenous simulation](/understanding/endogenous-simulation) — what bloodwork affects.
- [Pattern insights](/understanding/pattern-insights) — overlay labs vs other tracked series.
