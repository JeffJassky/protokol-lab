---
title: Pattern insights
description: How the engine surfaces correlations, change points, and projections from your data.
category: understanding
last_reviewed: 2026-05-10
---

# Pattern insights

The Insights surface on the dashboard automatically scans your data and surfaces patterns: correlations between any two series, change-points in single series, and projections toward your goals. This page explains what's getting computed and why some findings appear while others don't.

## What kinds of findings exist

Three types:

### Correlation findings

The most common kind. Reads like:

> "Tirzepatide rises ~3 days before nausea rises. r=0.34 over 38 matching days."

Computed as Pearson's correlation between two daily-resolution series, optionally with a time lag. Lag detects "X precedes Y" patterns.

### Change-point findings

Reads like:

> "Weight trend accelerated on March 12. Slope shifted from −0.2 lb/day to −0.4 lb/day."

Detects abrupt regime changes in single series — a slope shift large enough to flag.

### Projection findings

Reads like:

> "On track to reach 165 lb on August 4. Current rate −0.21 lb/day over the last 60 days."

Forward extrapolation from your current trend toward a target.

## Series the engine knows

Every series the engine considers, by domain:

| Domain | Series IDs |
|---|---|
| **Body** | weight, waist |
| **Nutrition** | calories, protein, fat, carbs, score |
| **Compound** | dosage:* (per enabled compound, modeled active level) |
| **Symptom** | symptom:* (per tracked symptom, max severity per day) |

Bloodwork, genetics, and conditions don't participate (they're subject characteristics, not daily series).

## How correlations get filtered

The engine runs every i<j pair through a gauntlet before reporting:

### 1. Structural tautology filter

Pairs that are mathematically self-correlated by definition are skipped. Today this means anything involving `score` and one of its component macros (calories, protein, fat, carbs) — score is computed *from* those, so a strong r is mechanical, not insight.

### 2. Within-domain filter

Pairs where both sides share a domain are skipped — except weight × waist:

- **nutrition × nutrition** (e.g., calories ↔ fat): co-recorded from one food log, definitionally linked.
- **symptom × symptom** (e.g., gas ↔ nausea): cluster because they reflect a single underlying state.
- **compound × compound**: rare, and when present usually a self-prescribed stack — co-movement is by user design.
- **body × body** **except** weight × waist: weight + waist can move independently (recomp), so the relationship is genuinely informative.

### 3. Lag direction priors

Pearson is symmetric, but lag isn't — "A leads B by 5 days" is a specific causal claim. The engine restricts the lag search to physically plausible directions:

| Pair | Allowed lags | Why |
|---|---|---|
| compound × non-compound | A leads B (compound first) | Dose schedule is exogenous. |
| nutrition × body | nutrition leads body | Food drives weight. |
| nutrition × symptom | bidirectional | Food can cause symptoms; nausea can suppress eating. |
| body × symptom | bidirectional | Either way is plausible. |

### 4. Calorie partial-correlation

For macro × non-nutrition pairs (e.g., fat × waist, protein × nausea), the engine computes **partial correlation controlling for total calories**. The question becomes "does this macro add explanatory power *beyond* total calories?" — not "did you happen to eat more food on those days?"

This filter prevents false positives like "more fat correlates with weight gain" when the real signal is "more food."

### 5. Lag search

Within the allowed lag range, find the lag that maximizes |r|. The search aligns by **calendar date** at each lag, not array position — so a 7-day shift means 7 calendar days, even when you have gaps in your logging.

### 6. Sample-size and r floor

After lag shift:

- **n ≥ 14** paired days required (post-lag).
- **|r| ≥ 0.25** required.

Drop anything below either floor.

### 7. Confidence scoring

Final ranking uses:

```
confidence ≈ |r| × sigmoid((n − 14) / 14)
```

Combines magnitude with sample size. A weak correlation on 14 days outranks a slightly stronger one on 7 days. At n=42, the sample factor is ~0.95; at n=7, ~0.27.

## Why some findings don't appear

You'd think correlations would be everywhere. They're not, by design — most candidates fail at least one filter:

- The pair is in the same domain and skipped.
- |r| < 0.25 (real but weak — call it noise for now).
- n < 14 paired days (insufficient sample).
- Lag direction was implausible.
- Calorie partial correlation showed the signal was just "more food."

The engine intentionally **under-reports** to keep findings actionable rather than statistically present. False positives erode trust.

## Change-point detection

Single-series scan for slope shifts:

- Sliding window across the last 6 months.
- Two-window linear-fit comparison: fit a line to days 1–N, fit another to days N+1–N+M, look at slope difference.
- Flag where the difference exceeds 0.5σ of the local noise.
- One change-point per series (the strongest).

The look-back is fixed at 6 months regardless of the chart range — change-point questions are meaningless if scoped to one side of a shift.

## Projections

For series with a target value (today: weight has `goalWeightLbs`; others coming):

- Linear regression over recent data.
- Project the line forward to the target.
- Report the date of crossing.

See [Trend & ETA](/understanding/trend-and-eta) for caveats.

## How findings are surfaced

Each finding gets:

- **Title** — e.g., "Tirzepatide rises ~3d before nausea rises."
- **Claim** — the supporting stats: "r=0.34 over 38 matching days."
- **Confidence bar** — visible 0–100%.
- **"Show chart" action** — opens an inline chart with the two series and the paired days highlighted.
- **"Explain" action** — opens the AI assistant with the finding pre-loaded for natural-language explanation.

The AI assistant has read access to all of this — you can also just ask "what patterns do you see?" and the assistant pulls and ranks findings live.

## What feeds the assistant

Even on free-tier accounts (where AI tool calls are disabled), the system embeds the **top precomputed insights** into the assistant's context. So you can ask "what's notable in my data" without paying for tool-call quota.

## Common questions

**"I see no insights at all. Why?"**
You probably need more data. The engine needs n ≥ 14 paired days for any pair to clear the floor. Two weeks of consistent logging is the minimum; one month is when patterns start surfacing reliably.

**"The engine says X correlates with Y. Is that causation?"**
No. Correlation is co-movement, not causation. The phrasing is intentionally symmetric ("X and Y rise and fall together"), and the lag directionality is filtered to plausible halves. But "plausible" doesn't equal "true." Use findings as starting points for hypotheses you'd then test.

**"What if I see a finding I disagree with?"**
You can ignore it. The findings list refreshes daily; if a pattern was specific to a 14-day window and goes away with more data, it stops appearing.

**"Why don't all my symptom-symptom pairs show up?"**
The within-domain filter excludes them. Symptoms cluster because they often reflect one underlying state (GLP-1 GI cluster, for example). Reporting them as separate correlations would be noise.

**"Can I get the raw correlation numbers?"**
The AI assistant has tools for `correlate_series`, `rank_correlations`, `partial_correlate`, etc. Ask: "What's the partial correlation between protein and weight controlling for calories over the last 90 days?"

## Caveats and where the engine could improve

This system is heuristic, not statistical hypothesis testing. Known limitations:

- **No multiple-comparison correction.** With ~15 series and ~100 candidate pairs × 29 lags, several false positives are expected by chance. The confidence floor mitigates but doesn't eliminate.
- **No detrending.** Two monotonic series (rising dose, dropping weight) correlate at almost any lag. The lag-search picks the strongest, but the underlying signal may be just "two trends, same direction."
- **No symptom clustering.** When 4 symptoms reflect one state, you might see all 4 as separate correlations to the same external factor.

We're aware of these and tune over time. If a finding looks suspicious, flag it via support — that's how the heuristics get sharpened.

## Related

- [How half-life curves work](/understanding/half-life) — the dose series the engine sees.
- [Trend & ETA](/understanding/trend-and-eta) — the projection part.
- [AI tool calls explained](/ai/tool-calls) — for asking the assistant for raw analysis.
