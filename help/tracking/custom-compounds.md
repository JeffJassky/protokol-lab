---
title: Custom compounds
description: Add peptides, prescriptions, or any compound the built-in catalog doesn't cover.
category: tracking
last_reviewed: 2026-05-10
---

# Custom compounds

The app ships with the major GLP-1s built in (Tirzepatide, Semaglutide, Liraglutide, Dulaglutide, oral Semaglutide, Retatrutide). For anything else — research peptides, prescription medications, supplements you dose on a schedule — add a custom compound.

## When to add one

Common reasons:

- **Other peptides**: BPC-157, TB-500, GHK-Cu, Cagrilintide, Survodutide, etc.
- **Compounded versions** with non-standard doses or kinetics that warrant separate tracking.
- **Hormone replacement therapy**: testosterone, estradiol, progesterone, T3/T4, etc.
- **Prescription medications** with a meaningful half-life curve: psychiatric, cardiovascular, etc.
- **Supplements you treat as scheduled** rather than as needed.

::: warning Plan limits
Free tier: no custom compounds.
Premium: up to 3 custom compounds.
Unlimited: no limit.
:::

## How to add

1. **Profile → Compounds → + Add compound**.
2. Fill in the fields:
   - **Name** — what you'll call it (e.g., "BPC-157", "Testosterone Cypionate").
   - **Half-life** — in days. See "Picking a half-life" below.
   - **Dose interval** — how often you dose, in days. Daily = `1`, weekly = `7`, every 4 days = `4`.
   - **Kinetics shape** — bolus, sub-Q, or depot. See [Kinetics shapes](/tracking/kinetics-shapes).
   - **Dose unit** — mg, mcg, iu, or ml.
   - **Color** (optional) — for the dashboard chart.
3. **Save**.

The new compound appears in your Compounds list, ready to dose against.

## Picking a half-life

For peptides, look up the published half-life in research literature. Some common ones:

| Compound | Typical half-life | Notes |
|---|---|---|
| BPC-157 | ~4 hours (~0.17 days) | Short. Often dosed daily or BID. |
| TB-500 (Thymosin Beta-4) | 1–2 days | |
| Cagrilintide | ~7 days | Weekly. |
| Survodutide | ~6 days | Weekly. |
| Testosterone Cypionate | ~8 days | Common HRT compound. |
| Estradiol Valerate | ~3.5 days | |
| L-Thyroxine (T4) | ~7 days | Long. |
| Liothyronine (T3) | ~1 day | Short. |
| Tesamorelin | ~30 min | Very short — daily dosing. |
| Cortisol (hydrocortisone) | ~1.5 hours | |

Half-life isn't always tabulated. For a compound you can't look up:

- **Daily dosing** → start with 1 day half-life. The curve will look like a sawtooth.
- **Weekly dosing** → 5–7 days.
- **Twice-weekly** → 3–4 days.

You can change the half-life later if the curve doesn't match how the compound feels.

## Picking a kinetics shape

Three options. Pick based on **how it absorbs**, not how long it lasts:

- **Bolus** — instant peak. IV-administered drugs, or anything that hits peak within minutes.
- **Sub-Q** (default) — rises over a few hours, then declines. Almost all self-injected peptides.
- **Depot** — slow-release, lower peak, longer tail. Long-acting weeklies in oil suspension.

If you don't know, **sub-Q is right ~90% of the time**. See [Kinetics shapes](/tracking/kinetics-shapes) for the math.

## What you can't do with custom compounds

- **The endogenous biomarker simulation** doesn't include custom compounds. The simulation engine has built-in pharmacology models for the canonical GLP-1 catalog only. Your custom compound's PK curve will plot on the dashboard, but it won't drive simulated cortisol, glucose, or insulin responses.

- **Receptor mapping** isn't possible — there's no way for the app to know that BPC-157 hits VEGF or GHK-Cu hits copper transport. Only catalog peptides have receptor metadata.

- **Pharmacological interactions** with catalog compounds aren't modeled.

What custom compounds *do* give you:

- A real PK curve on the dashboard.
- Per-compound reminders.
- Inclusion in the dose log and pattern insights (correlations between dose and weight / symptoms still work).
- Inclusion in the [data export](/account/export).

## Reminders

Custom compounds get the same reminder system as built-ins:

1. Toggle **Reminder** on for the compound.
2. Pick a time of day.
3. The reminder fires only on dose days, computed from your interval and last logged dose. Smart-skip suppresses the reminder if you've already logged today.

See [Log a dose → Reminders](/tracking/log-a-dose#reminders).

## Editing or deleting

Tap a compound to edit any field. Half-life, kinetics shape, and interval can all be changed retroactively — the dashboard recomputes the curve with the new parameters.

Deleting removes the compound but **doesn't** delete its dose history. The dose entries become orphans (still in your data, but with no associated curve). If you re-create a compound with the same name, the orphan doses don't auto-rejoin — they stay as orphans. To re-attach them, edit each affected dose entry.

## Common questions

**"Why doesn't my custom compound show up in the simulation?"**
The simulation needs receptor / target metadata that only the canonical catalog has. Custom compounds don't have that, by design — we'd be making up biology if we tried to fit one to a generic peptide model.

**"Can I make a custom version of Tirzepatide for compounded products?"**
Sure, but we recommend using the built-in Tirzepatide entry for standard compounded versions — the kinetics are the same. Use a custom only when the formulation is truly different (e.g., long-acting depot version, atypical concentration).

**"What if my compound has multiple compartments / non-first-order kinetics?"**
The app uses single-compartment first-order kinetics. Multi-compartment (alpha + beta) PK isn't modeled. For most exogenous peptides, the single-compartment approximation is fine. If you're tracking something where multi-compartment matters (lithium, digoxin), the app's curves will be approximate.

## Related

- [Log a dose](/tracking/log-a-dose) — using the compound after you've added it.
- [Kinetics shapes](/tracking/kinetics-shapes) — bolus, sub-Q, depot.
- [Plans & billing](/account/plans) — custom compound limits per tier.
