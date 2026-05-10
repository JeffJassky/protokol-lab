---
title: Migrating from MyFitnessPal
description: How to bring your history over, and what's different here.
category: getting-started
last_reviewed: 2026-05-10
---

# Migrating from MyFitnessPal

If you're coming from MyFitnessPal, Cronometer, LoseIt, or another macro tracker, most of the muscle memory transfers. A few things work differently — covered below.

## What you can bring over

You can import:

- **Recent foods** — most users care about a couple dozen common foods. Add them as [custom foods](/tracking/custom-foods) once and they'll appear in your Recents from then on.
- **Saved meals** — [Saved meals](/tracking/saved-meals) work like MFP's recipes / meals. Recreate the ones you actually use.
- **Weight history** — backdated entries supported. From MFP: export → CSV of weights → enter manually. (Direct CSV import isn't built yet.)

What doesn't migrate, and why:

- **MFP's full food database** — covered by USDA + Open Food Facts inside the app. You don't need to import.
- **MFP's macro history** — restart the macro log fresh. The trend you care about starts when you start logging consistently. Two weeks in, you'll have a useful baseline.
- **Step counts / wearable data** — not currently imported.

## What's different

If you're used to MFP, expect these differences:

### 1. Rolling 7-day budget instead of a daily cap

MFP gives you "calories left today." Protokol Lab gives you a 7-day window. Off days don't break the math — see [Rolling 7-day budget](/understanding/rolling-7-day).

In practice: you won't see a hard "1,200 left today" number. You'll see a *delta against the week*, with today's available calculated as the week's remainder minus what you've eaten so far.

### 2. Honest streaks, not gamified ones

MFP's streak counter rewards perfect logging. Skip a day and the counter resets. Many users churn out at this point.

Protokol Lab uses [tracked vs untracked days](/understanding/honest-streaks). A skipped day drops out of the math instead of zeroing it. There's no "streak counter" you can break by going on vacation.

### 3. Photo-of-plate logging via AI

MFP doesn't have a photo flow. Protokol Lab's [photo-of-plate](/tracking/log-a-meal#method-3-photo-of-your-plate) flow uses the AI assistant — premium feature.

### 4. Real PK curves for compounds

If you were using MFP for GLP-1 dose tracking (which it isn't built for), you'll find a real difference here. The dashboard plots active amount over time, not just dose dots — see [How half-life curves work](/understanding/half-life).

### 5. Pattern insights instead of just charts

MFP shows you the chart. Protokol Lab also tells you what's in it: "Nausea rises ~2 days before Tirzepatide" or "Carbs and weight track together with r=0.42 over 35 days." See [Pattern insights](/understanding/pattern-insights).

### 6. No social / community surface

MFP has friends and feeds. Protokol Lab doesn't. Your data is yours; there's no sharing to other users.

### 7. Macros default differently

MFP defaults to 50/30/20 carbs/fat/protein for everyone. Protokol Lab suggests targets based on your goal weight, current weight, and rate-of-loss preference. You can override during onboarding or anytime in Profile → Targets.

## Practical migration plan

A week-long plan:

**Day 1**: Sign up, finish onboarding. Don't worry about importing. Just log today's meals, weight, and dose.

**Day 2–3**: As you log meals, add the ~20 foods you eat most often as [custom foods](/tracking/custom-foods) or favorites. After this, your Recents covers ~80% of meals.

**Day 4**: Pick your most-used MFP meals (recipes) and recreate them as [Saved meals](/tracking/saved-meals).

**Day 5–7**: You're effectively migrated. Start ignoring MFP. Backdate your weight history if you want a longer trend line.

**Week 2**: Patterns start showing up on the dashboard. Compare what the rolling budget says vs MFP's daily count — you'll see why the math is more useful.

## Getting your MFP data out (for export, not import)

If you want a copy before deleting MFP:

1. MFP web → Settings → Privacy → Request my data.
2. They email a download link within ~24 hours.

The export is an HTML zip. Useful as a personal archive; not directly importable here.

## Common reactions

**"Why don't you import MFP exports directly?"**
Two reasons: (1) the food entries reference MFP's internal food IDs that don't map cleanly to USDA / OFF, and (2) most users actually log differently here once they see the rolling budget — re-importing months of MFP-style logs into a different system creates a noisy baseline. Starting fresh with a 2-week ramp produces cleaner trends.

**"I have years of weight data."**
That's worth bringing. Backdate weight entries — the date picker accepts any past date. The trend line will compute correctly across the imported history.

**"I'm worried about losing my MFP food library."**
You won't miss it. USDA has more reliable data for branded foods, and Open Food Facts covers international long-tail items. Your custom foods + saved meals will rebuild quickly from the foods you actually eat.

## Next

- [Your first week](/getting-started/first-week) — day-by-day plan.
- [Custom foods](/tracking/custom-foods) — the migration mechanism.
- [Saved meals](/tracking/saved-meals) — for repeated combos.
