---
title: Log a symptom
description: Three-second daily severity logging, with custom symptoms.
category: tracking
last_reviewed: 2026-05-10
---

# Log a symptom

Symptoms are how you tell the app how you feel. Logged on a 0–10 severity scale, one entry per symptom per day. Pattern insights use these heavily — once you have ~14 days of data, correlations between symptoms and doses, foods, or weight start to surface.

## What's preloaded

The app ships with the GLP-1 side-effect cluster turned on:

- Nausea
- Fatigue
- Bloating / gas
- Constipation
- Sulfur burps
- Injection site reaction
- Heartburn / reflux
- Headache

Enable or disable any of them in **Profile → Symptoms**. You can also add custom symptoms — see below.

## How to log

1. On the Log page, scroll to the **Symptoms** section. Each enabled symptom shows as a row.
2. Tap a row.
3. Drag the slider 0–10 (0 = none, 10 = unbearable).
4. The entry auto-saves.

Or use **Quick Log → Symptoms** from the bottom nav, which jumps you straight to the symptoms section.

The whole flow takes about three seconds per symptom. Logging at the end of each day works well — you can rate the day's worst moment.

## Custom symptoms

To track something not in the preloaded list:

1. **Profile → Symptoms → Add custom**.
2. Type a name (e.g., "Joint pain", "Brain fog", "Sleep quality", "Hunger").
3. The symptom appears with a `CUSTOM` tag in your daily log.

Common useful custom symptoms:

- **Sleep quality** (rate the night, not the day).
- **Hunger** (especially during dose escalation).
- **Mood / anxiety**.
- **Energy**.
- **Joint pain** (specific joint or general).

## What 0–10 actually means

There's no objective scale. Pick your own and stay consistent:

- **0** = "Didn't notice it today."
- **3** = "Aware of it, ignorable."
- **5** = "Distracting."
- **7** = "Affecting what I do."
- **10** = "Worst it's ever been."

Self-consistency matters more than absolute calibration. Your Day 30 score of 5 should feel comparable to your Day 60 score of 5.

## When to log

Pick one of two patterns:

**End-of-day** (most common): rate everything once before bed, capturing the worst part of the day.

**As-it-happens**: open the app when symptoms hit. Useful for specific tracking like injection-site reactions or post-meal nausea.

The app stores the **maximum severity** per symptom per day, so as-it-happens overwrites end-of-day if the second rating is higher. This is intentional — what users actually remember and act on is the worst moment.

## Editing

Tap any logged symptom and drag the slider to a new value. Set it to 0 to mark "logged but absent." Tap again and clear to remove the entry entirely.

A 0 is different from no entry: 0 says "I checked and it wasn't there today." No entry says "I didn't track this today." For pattern insights, 0 counts as data.

## What feeds off symptoms

- **Pattern insights** — symptoms vs. doses, calories, macros, weight. See [Pattern insights](/understanding/pattern-insights).
- **The dashboard's multi-series chart** can overlay any symptom on top of any other series.
- **The AI assistant** can read your symptom log and explain timing patterns ("Your nausea peaks ~36 hours after a dose escalation").
- **The endogenous simulation** doesn't directly use symptoms (it's a forward model, not a fitting one), but agent reasoning will surface symptom-dose correlations.

## Common questions

**"Should I log a 0 every day if I have no symptoms?"**
Helps a lot for pattern detection — the engine can distinguish "0 nausea today" from "didn't track nausea today." If a symptom is consistently absent, you can disable it instead.

**"What if a symptom is constant — say, 4 every day?"**
Disable it. A constant value adds nothing to correlations (zero variance breaks the math). Re-enable when something changes.

**"Can the AI add symptom entries?"**
Yes, if you ask: "Log nausea at 6 today" works. The assistant will write the entry.

## Privacy

Symptom data is one of the most personal categories in the app. It's stored against your account, shown only to you, and included in your [data export](/account/export).

## Next

- [Pattern insights](/understanding/pattern-insights) — what the engine looks for.
- [Day notes](/tracking/journal) — for symptoms that don't fit a 0–10 rating.
- [AI assistant](/ai/) — to explore symptom timing in plain language.
