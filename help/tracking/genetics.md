---
title: Genetics
description: Enter relevant variants from a 23andMe or Promethease report and let the simulation use them.
category: tracking
last_reviewed: 2026-05-10
---

# Genetics

Enter variant calls from a consumer genetics test (23andMe, AncestryDNA, etc., often run through a downstream interpretation tool like Promethease) so the simulation can adjust where genetics meaningfully change physiology.

## What's tracked

The app's genetics catalog covers variants with **functional, simulation-relevant** consequences:

- **Pharmacogenomics** — CYP2D6, CYP2C9, CYP2C19, CYP3A4 (drug metabolism rates).
- **Methylation** — MTHFR (C677T, A1298C), MTR, MTRR, COMT.
- **Caffeine / catecholamine** — CYP1A2, MAOA.
- **Lipid metabolism** — APOE, LIPA.
- **Vitamin D** — VDR, GC.
- **Iron** — HFE (hemochromatosis variants).
- **Folate** — DHFR, FOLH1.
- **Other** — selected variants with documented clinical relevance.

The exact field list comes from a curated genetics panel built into the simulation engine.

## What's NOT tracked

The app deliberately doesn't try to be a full genetics platform:

- **Ancestry / heritage** — irrelevant to physiology.
- **Disease-risk SNPs** without therapeutic relevance — out of scope.
- **Polygenic risk scores** — too noisy, too complex for the simulation context.

If your interpretation report lists 100,000 SNPs, the app's catalog covers a few dozen. Those are the ones the simulation actually uses.

## How to enter values

1. **Profile → Genetics**.
2. Each panel groups related variants.
3. For each variant, pick the option matching your call:
   - **Numeric / select** — pick CC / CT / TT, etc.
   - **Boolean** — yes / no for presence of a specific variant.
4. Save.

You can leave any variant blank. Only variants you enter affect the simulation.

## Where the variants come from

For each variant, the app shows the rsID and the panel's standard nomenclature (e.g., "MTHFR C677T (rs1801133): CC / CT / TT"). Look up the same rsID in your raw 23andMe data or Promethease report and pick the matching call.

::: tip Reading 23andMe raw data
Open your raw download. Search for the rsID. The genotype column has the call (e.g., "AG"). Map to the app's options:
- Two reference alleles → "wild-type" / "no variant" / "C/C" depending on the field.
- One reference + one variant → heterozygous / "C/T" / "AG".
- Two variant alleles → homozygous variant / "T/T" / "GG".
:::

## How genetics affects the simulation

Specific examples of what the model adjusts:

- **MTHFR C677T (TT)**: reduces methylation efficiency by ~70%. Folate and homocysteine pathway responses shift.
- **CYP2D6 poor metabolizer**: drugs metabolized by CYP2D6 (some antidepressants, beta-blockers) clear more slowly.
- **APOE 4/4**: shifts lipid response to dietary fat.
- **HFE C282Y/C282Y**: iron absorption substantially increased; relevant if tracking ferritin.

The simulation doesn't make health predictions ("you'll get X disease"). It tunes biochemistry.

## Common questions

**"Do I need to enter genetics?"**
No. Default values produce a generic model. Genetics tunes it to your specifics.

**"What if I don't have a 23andMe report?"**
Don't enter anything. The simulation works fine without it. If you're curious about pharmacogenetics specifically, services like Genelex, Genomind, or AncestryDNA + Promethease can produce relevant reports.

**"Will my genetics data leave the app?"**
No. It's stored against your account, never shared, never used for anything except your own simulation. Included in your [data export](/account/export).

**"What about clinically-actionable variants like BRCA?"**
Not tracked here. The app focuses on metabolic / pharmacogenomic variants. Clinically-actionable cancer genetics is the domain of medical genetic counseling, not a tracking app.

**"Is this medical advice?"**
No. Surfacing that you have a CYP2D6 variant is informational. Acting on it (changing a medication dose, picking a different drug) requires a doctor.

## Privacy

Genetics is the most sensitive personal data in the app. It's encrypted in transit and at rest, stored against your account only, and never used in cross-user analytics. Data export and account deletion include and remove genetics fully.

## Related

- [Bloodwork](/tracking/bloodwork) — the other major subject input to the simulation.
- [Conditions](/tracking/conditions) — diagnosed conditions that complement variant data.
- [Endogenous simulation](/understanding/endogenous-simulation) — how subject inputs combine.
