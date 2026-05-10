---
title: Limits & context length
description: Daily message caps, conversation context size, and what each tier actually means.
category: ai
last_reviewed: 2026-05-10
---

# Limits & context length

Each plan tier has different AI access. This page lists exactly what's capped, what "context length" means, and what to do when you hit a limit.

## Daily message limits

| Tier | Messages per day | Messages per minute |
|---|---|---|
| Free | 5 | 2 |
| Premium | 60 | 10 |
| Unlimited | Unlimited | 30 |

A "message" is one user-typed input. Tool calls don't count separately — one of your messages can trigger many tool calls in the same iteration loop.

The day rolls over at midnight UTC.

## Image recognition limits

Photo-of-plate logging counts separately:

| Tier | Images per day | Lifetime |
|---|---|---|
| Free | 0 | 0 (feature off) |
| Premium | 50 | Unlimited |
| Unlimited | Unlimited | Unlimited |

## Context length

"Context length" is how much of the conversation history + your data gets sent to the model per message:

| Tier | Max context messages | Max input tokens / message |
|---|---|---|
| Free | 10 | 8K |
| Premium | 30 | 40K |
| Unlimited | 60 | 200K |

What this means in practice:

- **Free**: about 10 back-and-forth turns of context. Long conversations forget early turns. Each message can include up to ~6 pages of text.
- **Premium**: about 30 turns. Each message can include long-form data dumps, large food logs, multiple tool results. Comfortable for most uses.
- **Unlimited**: 60 turns + 200K tokens per message — entire weeks of detailed log data fit in one prompt.

Older messages drop off the front of context as new ones are added.

## Tool call limits

| Tier | Tool calls per message | Web search calls per message |
|---|---|---|
| Free | 0 (tools disabled) | 0 |
| Premium | 6 iterations × multiple per iteration | 2 |
| Unlimited | 6 iterations × multiple per iteration | 2 |

A single message that requires a lot of work (logging 8 foods from a photo, computing 4 correlations) can use ~20 tool calls within the iteration cap.

## Cost limits

Internal cost caps (we don't expose token-by-token billing to users, but the model is rate-limited so abuse can't drive costs).

| Tier | Cost per day | Cost per month |
|---|---|---|
| Free | $0.05 | $0.50 |
| Premium | $0.25 | $2.00 |
| Unlimited | (no cap) | (no cap) |

You'd have to be doing something unusual to hit these on Premium. They mainly catch runaway loops or bot-like behavior.

## Thread count limits

| Tier | Saved threads |
|---|---|
| Free | 1 |
| Premium | 100 |
| Unlimited | Unlimited |

Each separate conversation is a thread (you can name and delete them). Free is "one running conversation"; Premium is "as many topical threads as you'd reasonably keep."

## What happens when you hit a limit

| Limit hit | Result |
|---|---|
| Daily message cap | Chat input is disabled until midnight UTC. Upgrade prompt shown. |
| Per-minute rate | Brief 30s cooldown. |
| Image cap | Photo flow disabled; manual logging still available. |
| Iteration cap on a single message | Model returns the best answer with what it has, notes the cap. |
| Thread count cap | Older threads must be deleted before creating new ones. |

## Tier-specific behavior in chat

### Free tier

- Tool calls disabled. The model gets your profile + recent insights + conversation. It can answer questions about precomputed patterns but can't pull live data.
- 5 messages per day. Use them on substantive questions.
- 1 thread. Keep it focused.
- No image input.
- 2 iterations max per message — short loops only.

### Premium

- Full tool access (read your data, run analysis, write entries).
- 60 messages per day — typical heavy users hit ~20–30.
- 100 threads — separate by topic.
- 50 image-recognition logs per day.
- Web search 2 calls per message.
- 6 iterations per message — handles complex multi-tool flows.

### Unlimited

- Everything Premium has.
- No daily cap on messages.
- Larger context window (200K tokens).
- Unlimited image recognition.
- More threads (unbounded).
- Same iteration cap (6) — cap is by complexity, not volume.

## Why the iteration cap exists

Without one, an agent loop can chain forever — call a tool, ponder, call another, ponder, call another... in pathological cases the model thrashes between tools without converging.

6 iterations covers ~99% of useful question patterns. If your question genuinely needs more, break it into two messages.

## Why context isn't infinite

Two reasons:

1. **Cost** — model API pricing scales with tokens. 200K tokens per message is already aggressive.
2. **Quality** — models can struggle with very long contexts (lost in the middle, etc.). For most questions, 30 messages of history is plenty.

Past the context limit, the assistant doesn't lose track of *who you are* — your profile re-injects every message. It loses the recent conversation only.

## Common questions

**"Can I see my current usage?"**
Profile → AI Usage shows today's message + image counts.

**"What if I want more than 60 messages a day on Premium?"**
Upgrade to Unlimited. There's no "buy more credits" option — the tier itself is the lever.

**"Why is my Free tier so limited?"**
The Free tier is a real free tier — we keep AI costs below ~$0.50/month per free user. To do that, we cap aggressively. Paid tiers fund the AI infrastructure for free users.

**"What model do you use?"**
Gemini 3 Flash, currently. We may switch as new models with better cost/quality ship — the assistant's behavior is what matters more than the underlying model.

**"Are limits the same for everyone in a tier?"**
Yes. No per-user adjustment. If you've hit a limit and have a legitimate need (research project, doctor reviewing your data), [open a support ticket](https://protokollab.com/support) — we'll consider one-off bumps.

## Related

- [What the AI can do](/ai/capabilities) — capabilities by tier.
- [Tool calls explained](/ai/tool-calls) — what counts as a tool call.
- [Plans & billing](/account/plans) — pricing and tier comparison.
