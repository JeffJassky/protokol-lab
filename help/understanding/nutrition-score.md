---
title: Nutrition score
description: How the 0–100 daily nutrition score is computed.
category: understanding
last_reviewed: 2026-05-10
---

# Nutrition score

The nutrition score is a single 0–100 number summarizing how well a day's eating matched your macro targets. It's an asymmetric score — under-protein is bad, extra protein isn't; over-fat is penalized, under-fat isn't. This page explains exactly how the score is computed.

## TL;DR

```
score = 100 × (1 − weighted-penalty-sum)
```

Where the weighted penalty sum combines four asymmetric penalties:

| Macro | Weight | Penalty when |
|---|---|---|
| Calories | 0.40 | Either over OR under target |
| Protein | 0.30 | Only when under target |
| Fat | 0.20 | Only when over target |
| Carbs | 0.10 | Either over OR under target |

So 40% of the score is calorie adherence, 30% is protein adequacy, 20% is fat moderation, 10% is carb fidelity.

## The asymmetry, explained

### Calories: bidirectional

Eating too much pushes you out of a deficit. Eating too little (significantly under target) signals under-fueling, which can suppress metabolic rate and cause muscle loss. Both directions hurt.

### Protein: under-only

Eating extra protein doesn't hurt the score. Hitting protein is critical for muscle preservation, especially during weight loss; falling short does meaningful damage. Going over is fine — the score doesn't punish a high-protein day.

### Fat: over-only

Fat is the macro that "fills up" calorie space when carbs and protein are at target. Going over often means total calories went over too. Eating less fat than target isn't usually a problem (your essential fatty acid needs are met by relatively small amounts).

### Carbs: bidirectional

Carbs are bidirectional but down-weighted. Hitting carbs matters for energy and training, but missing the target on either side has less effect on body composition than calories or protein.

## The math

For each macro, we compute a **ratio** (actual ÷ target):

```
calRatio  = actual.calories  / target.calories
proRatio  = actual.protein   / target.protein
fatRatio  = actual.fat       / target.fat
carbRatio = actual.carbs     / target.carbs
```

Then per-macro **penalty** in [0, 1]:

```
calories penalty:  |1 − calRatio|             clamped to [0, 1]
protein penalty:   max(0, 1 − proRatio)       clamped to [0, 1]
fat penalty:       max(0, fatRatio − 1)        clamped to [0, 1]
carbs penalty:     |1 − carbRatio|             clamped to [0, 1]
```

The deduction is the weighted sum:

```
deduction = 0.4 × calPenalty
          + 0.3 × proPenalty
          + 0.2 × fatPenalty
          + 0.1 × carbPenalty
```

And the score:

```
score = round(100 × (1 − deduction))
```

## Worked examples

### Hit every target perfectly

```
calRatio = 1.0, calPenalty = 0
proRatio = 1.0, proPenalty = 0
fatRatio = 1.0, fatPenalty = 0
carbRatio = 1.0, carbPenalty = 0
deduction = 0
score = 100
```

### Over calories by 20%, all else on target

```
calRatio = 1.2, calPenalty = 0.2
all other penalties = 0
deduction = 0.4 × 0.2 = 0.08
score = 92
```

### Under protein by 30%, all else on target

```
proRatio = 0.7, proPenalty = 0.3
all other penalties = 0
deduction = 0.3 × 0.3 = 0.09
score = 91
```

### Over fat by 50%, all else on target

```
fatRatio = 1.5, fatPenalty = 0.5
all other penalties = 0
deduction = 0.2 × 0.5 = 0.10
score = 90
```

### Hard day: over calories 30%, under protein 40%, over fat 50%, on carbs

```
calPenalty = 0.3, weighted = 0.12
proPenalty = 0.4, weighted = 0.12
fatPenalty = 0.5, weighted = 0.10
carbPenalty = 0.0, weighted = 0
deduction = 0.34
score = 66
```

### Twice protein target (extra)

```
proRatio = 2.0, proPenalty = max(0, 1−2) = 0
score = 100  (extra protein doesn't hurt)
```

## Where you see the score

- **Daily summary card** on the Log page.
- **Log history table** on the Dashboard.
- **Multi-series chart** can plot score as a series.
- **Pattern insights** can use score as one side of a correlation (with structural-tautology filtering — score vs. its component macros is excluded).

## When the score is null

The score returns `null` (instead of 0) when:

- You have no targets set (the score has no reference).
- You have no food logs for the day.

A null score doesn't drag down averages — it's excluded.

## What it is and isn't

**It is** a quick adherence summary. Useful for "did I hit my targets this week" without parsing four numbers.

**It is not** a measure of food quality. A 100-score day on Pop-Tarts and protein powder beats a 70-score day on whole foods, by score. The score is about hitting *your* targets, not about ideal nutrition.

**It is not** a clinical metric. Adherence to self-set macros doesn't translate to clinical outcomes. The trend in your weight, waist, bloodwork, and how you feel is what matters.

## Common questions

**"Why isn't sodium / fiber / sugar in the score?"**
Adding more axes lowers signal. Calories + macros are the four most users actually target. Micronutrients are tracked separately and visible per-day, but they don't enter the score.

**"Can I customize the weights?"**
Not currently. Different users have different priorities (someone on HRT might prefer down-weighting protein), but a customizable score makes cross-user comparisons noisy. Roadmap-able if there's demand.

**"Why does extra protein not hurt?"**
The cost of extra protein is mostly satiety (you eat too few carbs/fats), but the calorie penalty already catches that. Penalizing high protein twice would over-discount a high-protein bias that's actually fine for most users.

## Related

- [Rolling 7-day budget](/understanding/rolling-7-day) — calorie math.
- [Pattern insights](/understanding/pattern-insights) — using score as a series.
