---
title: Tool calls explained
description: What the assistant is doing when you see "Searching..." or "Logging..." lines.
category: ai
last_reviewed: 2026-05-10
---

# Tool calls explained

The assistant isn't a chatbot. It's an agent: when you ask a question, it can call tools to fetch your data, compute things, search the web, or write entries on your behalf. The tool-call trail is what you see in the chat as those "Reading..." and "Logging..." lines.

This page explains what each tool does and why you'd see it.

## How the loop works

When you send a message:

1. The model reads your question + context.
2. It decides whether to call tools.
3. If yes: tools execute, results return to the model.
4. The model considers results, may call more tools, or answer.
5. Loop until done (capped at 6 iterations on Premium, 2 on Free).

Each iteration is visible in the trail. You see what the assistant is doing in real time.

## Read tools

These pull data from your account.

| Tool | What it returns |
|---|---|
| `get_food_log` | Food entries for a date range. |
| `get_daily_nutrition` | Daily macro totals. |
| `get_weight_log` | Weight entries. |
| `get_metric_log` | Custom measurements (waist, etc.). |
| `get_dose_log` | Doses for a compound or all compounds. |
| `get_compounds` | Your enabled compounds and settings. |
| `get_symptom_log` | Symptom entries. |
| `get_user_settings` | Targets, units, profile. |
| `get_saved_meals` | Saved meal templates. |
| `get_exercise_log` | Workouts. |
| `get_water_log` | Hydration entries. |
| `get_active_conditions` | Enabled conditions. |
| `get_bloodwork` | Lab values. |
| `get_genetics` | Variant entries. |
| `get_menstrual_state` | Current cycle phase, predictions. |
| `get_fasting_state` | Current fast or eating window. |
| `get_day_status` | Tracked/untracked overrides. |

When you ask "what did I eat last week," you'll see `get_food_log` in the trail.

## Analysis tools

These compute live — not retrieved, calculated.

| Tool | What it does |
|---|---|
| `correlate_series` | Pearson's r between any two series, optionally with lag. |
| `rank_correlations` | Find strongest correlations against one target series. |
| `partial_correlate` | Correlation controlling for one or more confounders. |
| `series_change_points` | Detect regime shifts in a single series. |
| `compare_windows` | Before/after analysis for two time windows. |
| `project_series` | Forward projection from current trend. |
| `get_series_daily` | Raw daily values for any series. |

When you ask "is there a pattern between my carbs and weight," `partial_correlate` runs.

## Write tools

These add or edit entries on your behalf. Premium / Unlimited only.

| Tool | What it does |
|---|---|
| `search_food_items` | Search your library + USDA + OFF for foods. |
| `create_food_item` | Add a new custom food. |
| `log_food_entry` | Write a food log entry. |
| `propose_food_entries` | Create a meal proposal for one-tap accept. |
| `propose_bloodwork_update` | Suggest bloodwork updates from pasted lab data. |

When you say "log my standard breakfast," `log_food_entry` runs (possibly multiple times for a saved meal).

## External tools

| Tool | What it does |
|---|---|
| `web_search` | Google Search for facts not in your data. |

Web search is **rate-limited per message**: 2 calls on Premium / Unlimited, 0 on Free.

## What the trail looks like

A typical photo-of-plate log:

```
You: (image of plate) Lunch.

[Reading request]
[Identifying foods in image]
[Searching food library]
  → search_food_items("grilled chicken thighs")
  → search_food_items("white rice cooked")
  → search_food_items("broccoli steamed")
[Logging entries]
  → log_food_entry(grilled chicken thighs, 6 oz, lunch)
  → log_food_entry(white rice cooked, 1 cup, lunch)
  → log_food_entry(broccoli steamed, 1 cup, lunch)

AI: Logged to lunch. Total: 540 kcal, 38g protein, 18g fat, 52g carbs.
```

A pattern question:

```
You: Why does my nausea peak two days after a dose?

[Reading request]
[Pulling dose log]
  → get_dose_log(last 60 days)
[Pulling symptom log]
  → get_symptom_log(symptom: nausea, last 60 days)
[Computing correlation]
  → correlate_series(dosage:tirzepatide, symptom:nausea, lag: auto)
[Considering pharmacology]
  → web_search("Tirzepatide pharmacokinetics peak nausea timing")

AI: Tirzepatide rises ~36 hours post-injection... [explanation]
```

## Why some lines look terse

The trail is condensed for readability. The actual tool call has structured arguments (date ranges, compound IDs, etc.) that don't matter for understanding what's happening.

Tap or hover a trail line to see the full call signature if you're curious.

## Iteration cap

The assistant can chain tool calls, but only up to a cap:

- **Free**: 2 iterations.
- **Premium**: 6 iterations.
- **Unlimited**: 6 iterations.

Each iteration is one round of "tools run → model considers → maybe more tools." Most questions resolve in 1–3 iterations. Photo-plate logging often hits 4–5 (search per food, log per food, summary).

If the cap is hit before answering, the assistant gives the best answer it has with the data it pulled and notes the limit.

## Why some tools fail silently

A few cases:

- **Date range with no data** — the tool returns empty. The model usually says "no entries in that range" instead of looking confused.
- **Reference to a compound you don't have enabled** — the tool returns empty; the model may ask for clarification.
- **A correlation pair below the relevance floor** (n < 14, |r| < 0.25) — the engine returns "no significant correlation" and the model passes that along.

If the assistant says "I couldn't find data on X," check that X is actually being tracked.

## Privacy of tool calls

All tool calls run server-side, against your account only. The model doesn't have direct database access — it sends a structured tool call which the server executes with your user ID, then returns scoped results.

Cross-user data leakage is impossible by design — the tool layer can only fetch data tied to the authenticated user.

The model itself is a third-party (Google Gemini). What it sees from you per message is documented in [Privacy & what AI sees](/ai/privacy).

## Common questions

**"Can I disable specific tools?"**
Not currently — tools are bundled by tier. Free tier has tools off; Premium / Unlimited have all tools on.

**"Why does the same question sometimes use different tools?"**
The model picks the cheapest/fastest path that answers. "What did I eat?" might pull `get_daily_nutrition` for totals or `get_food_log` for items, depending on phrasing.

**"Can I see exactly what the model received?"**
Tap a trail item to expand the call signature and result. The full prompt sent to the model is internal — for privacy reasons we don't surface it.

## Related

- [What the AI can do](/ai/capabilities) — full capability list.
- [Privacy & what AI sees](/ai/privacy) — what data leaves your account.
- [Limits & context length](/ai/limits) — caps per tier.
