---
title: What the AI can do
description: The full list of capabilities, with examples.
category: ai
last_reviewed: 2026-05-10
---

# What the AI can do

The AI assistant is built on Gemini 3 Flash, with read access to your full data and a set of tools for taking action. This page documents what it can and can't do.

## Capabilities by category

### Read your data

The assistant can pull from any of these:

- **Food log** — entries by date range, meal type, with full macros and micros.
- **Daily nutrition totals** — calories/protein/fat/carbs aggregated per day.
- **Weight log** — every weigh-in.
- **Custom measurements** — every metric entry (waist, hip, body fat, etc.).
- **Dose log** — every dose with compound, value, date.
- **Compounds** — your enabled compounds, half-lives, kinetics.
- **Symptom log** — every symptom rating with severity.
- **Saved meals** — the templates you've created.
- **Exercise log** — every workout.
- **Water log** — daily totals.
- **Bloodwork** — every lab value you've entered.
- **Genetics** — your variant entries.
- **Active conditions** — diagnosed conditions you've enabled.
- **Menstrual state** — current cycle day, phase, predictions.
- **Fasting state** — current fasting status.
- **Day status** — tracked / untracked overrides.
- **User settings** — targets, units, preferences.

For each, you can ask date-ranged questions: "What did I eat last week?", "Show me my weight trend since I started Tirzep."

### Run analysis

The assistant has tools that compute live, not just retrieve:

- **Correlate any two series** — Pearson's r and lag analysis between any two tracked series.
- **Partial correlate** — same, controlling for one or more series (e.g., "protein × weight controlling for calories").
- **Rank correlations** — find the strongest correlations against any target series.
- **Detect change points** — find regime shifts in a single series.
- **Compare time windows** — before/after analysis for a date range.
- **Project a series** — extrapolate forward, optionally to a target value.
- **Get series daily** — raw values for any series, for ad-hoc analysis.

### Search the web

For lookups not in your data — drug information, nutrition databases, research. The assistant uses Google Search and cites sources.

### Answer support questions

The assistant can pull this help site's full documentation on demand, so you can ask it how Protokol itself works:

- "How do I turn on fasting tracking?"
- "Where do I change my calorie target?"
- "What's the difference between earn and baseline energy mode?"
- "Does Premium include photo logging?"

It fetches the docs live and answers from them rather than guessing, so the response stays in sync with the actual app.

### Add or edit entries

Premium and Unlimited tiers can write:

- **Log food entries** — by name, by photo, or natural-language description.
- **Create custom food items** — add to your library.
- **Search food items** — across your library, USDA, OFF.
- **Propose food entries** — for review and one-tap acceptance.
- **Propose bloodwork updates** — when you paste lab results.

### Read your insights

The dashboard's pattern insights are precomputed and embedded into the assistant's context. So even free-tier accounts (which can't make tool calls) get pattern-level reasoning grounded in real findings.

## Examples that work well

**Photo-of-plate logging:**
> *(attach photo)* "Lunch."
>
> AI: I see chicken thighs, rice, broccoli, and what looks like a slice of cheese. Logging to lunch.
>   ↳ tool: search_food_items(chicken thighs grilled)
>   ↳ tool: search_food_items(white rice cooked)
>   ↳ tool: search_food_items(broccoli steamed)
>   ↳ tool: log_food_entry(chicken thighs, 6 oz, lunch)
>   ↳ tool: log_food_entry(white rice, 1 cup, lunch)
>   ↳ tool: log_food_entry(broccoli, 1 cup, lunch)
>   Logged. Total: 540 kcal, 38g protein, 18g fat, 52g carbs.

**Patterns:**
> "Why does my nausea peak two days after a dose?"
>
> AI: Looking at your dose log and nausea entries... Tirzepatide rises ~36 hours post-injection (peak plasma at hour 24–48). Your nausea data shows the same window — r=0.42 over 47 paired days. The mechanism: GLP-1R activation slows gastric emptying, peaks aligned with peak plasma. This is consistent with the published Tirzepatide PK literature.

**Hitting numbers:**
> "I've eaten 1,400 kcal so far. What should I have for dinner to hit 80g protein?"
>
> AI: You're at 52g protein, target is 130g. So 78g protein remaining and ~400 kcal. Suggestions from your library:
> - Greek yogurt + protein powder shake (~30g protein, ~200 kcal).
> - Grilled chicken breast 6 oz + steamed vegetables (~50g protein, ~300 kcal).
> - Tuna salad on greens (~35g protein, ~250 kcal).
> Combine the chicken + a protein shake to hit ~80g exactly.

**Editing past entries:**
> "Move yesterday's pasta from lunch to dinner."
>
> AI: Updated. The entry "Spaghetti, 1 cup" moved from lunch to dinner. Yesterday's totals unchanged.

**Correlation lookups:**
> "Is there a relationship between my sleep quality and weight?"
>
> AI: Running correlation... Sleep quality (custom symptom, 0–10) and weight: r = -0.18 over 28 days, partial r = -0.22 controlling for calories. Weak signal. Direction is consistent with poor-sleep → higher weight, but the effect is small enough I'd want more data before treating it as actionable.

## Examples that don't work

**Medical advice:**
> "Should I increase my dose?"
>
> AI: I can describe what's in your data — at your current 5mg dose, your weight trend is X, symptom profile is Y. But I can't recommend a dose change. That's a conversation for your prescribing physician.

**Speculative scenarios:**
> "If I switch to Retatrutide, what would my glucose look like?"
>
> AI: I can't simulate switching — I'd be making numbers up. The simulation only runs on what you've actually logged. Once you've started Retatrutide and logged a dose or two, the simulation will model it.

**Changing app settings:**
> "Turn on the rolling 7-day budget."
>
> AI: I can't change settings for you, but I can tell you where it lives — Profile → Tracking → Confirmation mode. The rolling 7-day budget is on by default for tracked accounts. (Pulled from the help docs.)

## Tier differences

| Capability | Free | Premium | Unlimited |
|---|---|---|---|
| Read your data | ✓ (via insights context) | ✓ | ✓ |
| Tool calls (live data + analysis) | — | ✓ | ✓ |
| Web search | — | 2 per message | 2 per message |
| Add/edit entries | — | ✓ | ✓ |
| Photo recognition | — | 50/day | Unlimited |
| Daily messages | 5 | 60 | Unlimited |
| Conversation context | Low | Medium | Extreme |
| Multi-thread chats | — | ✓ | ✓ |

Free tier still gets useful answers — the assistant has the pre-computed insights and your basic profile in context. It just can't pull live data or take actions.

## What the model is

Gemini 3 Flash. We pick this over alternatives because it combines acceptable cost with real tool-use plus Google Search support in a single request — older flash models forced a choice between user-defined tools and web search.

The model knows nothing about you besides what's in the system prompt + your data + this conversation. There's no persistent memory beyond that. Each message starts fresh with the same context-loading flow.

## What about hallucinations?

Limitations are real:

- The model can misread an OFF entry's macros if the underlying data is wrong.
- It can invent a serving size when one isn't in the source.
- It can be confidently wrong about pharmacology details — always check claims against published sources for medication-relevant questions.

Mitigations in the system:

- Tool calls return real data from your DB; the model can't fabricate your own logs.
- Web search results are cited.
- Food entries created by AI are visible in your log and reviewable.

Verify anything that affects health decisions.

## Related

- [Tool calls explained](/ai/tool-calls) — what those "Searching..." lines mean.
- [Privacy & what AI sees](/ai/privacy) — exact data scoping.
- [Limits & context length](/ai/limits) — daily caps and tier differences.
