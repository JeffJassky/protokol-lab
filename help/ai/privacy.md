---
title: Privacy & what AI sees
description: Exactly what data the AI assistant has access to, and what leaves your account.
category: ai
last_reviewed: 2026-05-10
---

# Privacy & what AI sees

The AI assistant is a feature that necessarily involves a third-party model provider (Google Gemini). This page explains exactly what gets sent, what doesn't, and what controls you have.

## What the model sees per message

For each message you send, the model receives:

1. **A system prompt** — instructions on how to behave, plus a snapshot of your profile (sex, age, height, weight, targets, time zone, units).
2. **Your active conditions** — flags only (e.g., "PCOS", "ADHD"), not full clinical detail.
3. **A summary of recent insights** — top precomputed pattern findings (the dashboard's Insights surface).
4. **Your conversation history** for the current thread (capped per tier; oldest messages dropped first).
5. **Your current message** — what you typed, plus any attachments.
6. **Tool results** — when the assistant calls a tool, the result is included in the next iteration's context.

That's the full input. The model doesn't have direct database access; it can only see what flows through the prompt.

## What the model does NOT see

By default, in your message context:

- **Bloodwork values** — only sent when a tool explicitly fetches them (and only if you ask about labs).
- **Genetics variants** — only sent via tool fetch.
- **Detailed dose history** — only sent via tool fetch.
- **Your full food log** — only the portions a tool fetches.
- **Other users' data** — never. Tools are scoped to your account.

So a casual question ("how's my week?") sends profile + insights + conversation. It doesn't dump your entire bloodwork panel into the model unless the model decides it needs to fetch it.

## What stays on our servers

Everything in your account stays on our infrastructure. The model is invoked over a transient API call:

```
You → our server → Gemini API → response → our server → you
```

Your data is **not** persisted by Google as part of API usage. Per Google's Gemini API terms (current as of 2026-05-10), prompts and responses are not used for training, are not logged with your identity, and are deleted from their systems after the inference window.

Our server does log:

- That a chat request happened (timestamp, user ID, token counts) — for billing and rate limiting.
- The conversation thread itself (so you can resume threads across sessions).

We do **not** log:

- Full prompts to Gemini (we don't keep them; just the user-facing message).
- Bloodwork or genetics fields independently of your account record.

## Tool calls and data scoping

When the AI calls a tool like `get_food_log` or `get_bloodwork`:

1. The tool is executed by our server.
2. Our server queries the database with your user ID (cannot return other users' data).
3. The tool result returns to our server.
4. We send the result back into the model's next iteration.

Cross-user data leakage is **impossible by design** — the tool layer is scoped per-request to the authenticated user.

## Photos sent to the AI

Photo-of-plate logging sends the image to Gemini for visual identification.

- The photo is sent over HTTPS.
- It's processed for the inference call.
- It's not stored by Gemini after the call completes.
- We retain a copy in your account (visible to you only) for the food log entry.

If you don't want photos going to the model, don't use the photo-log flow. Manual entry is always available.

## Bloodwork & genetics

These are the most sensitive data in the app.

- **Storage**: encrypted at rest in our database.
- **Transit**: encrypted in transit (HTTPS).
- **AI access**: only when the assistant calls `get_bloodwork` or `get_genetics` (typically when you ask a labs- or genetics-relevant question). Not in default context.
- **Cross-user**: never used in any aggregate analytics that could re-identify you.
- **Model training**: never used.

If you want to disable AI access to labs/genetics specifically, the only fully-airtight option today is not entering them. (A per-domain AI toggle is on the roadmap.)

## What the model could leak

In the worst case (model misbehavior, prompt injection, etc.), the model has access to whatever was in its current context window for *this* message. That's the input we sent — your profile, conversation, and any tool results pulled in this session.

It does **not** have:

- Memory of previous sessions.
- Access to other users' data.
- Database access independent of tool calls.
- Persistent storage of anything.

The blast radius of a model leak is bounded by what's in one message's context.

## Account deletion

When you [delete your account](/account/delete):

- All your data is purged from our database.
- AI chat history is deleted alongside other data.
- Gemini's transient logs (which don't include user identity) age out per Google's retention.
- Any cached model responses on our side are invalidated.

You can also delete a single chat thread without deleting your account: open the thread → menu → delete.

## Anonymized analytics

Our internal analytics track:

- Feature usage (which page was opened, which tool was called).
- Aggregate plan-tier engagement.
- Error rates.

These events are **not** tied to your identity in the analytics warehouse — they use anonymous IDs that aren't joinable back to your user record.

Personally identifiable data (logs, bloodwork, etc.) is never in analytics.

## Third-party access

The model provider is Google (Gemini API). Their terms apply to the API call.

We don't share your data with:

- Other AI providers.
- Marketers.
- Researchers.
- Insurers.
- Anyone else.

## What you control

You can:

- **Delete chat threads** — the AI's conversation context for that thread vanishes.
- **Delete your account** — everything goes.
- **Export your data** — full archive of everything tied to your account, including chat history.
- **Turn off the assistant** — Free tier accounts effectively have it disabled (no tool calls, limited messages); paid tiers can simply not use the chat drawer.

You can't currently:

- Selectively block bloodwork or genetics from AI tool calls (roadmap).
- Self-host the model (we use a managed provider).

## Common questions

**"Are my chats used to train AI models?"**
No. Per Google's API terms, API usage doesn't feed training. We also don't share data with any other model provider.

**"Could a Gemini bug expose my data to other users?"**
Cross-user leakage at the API level would require both Google's infrastructure to misbehave AND our scoping to fail simultaneously. Neither has happened. Our scoping is enforced at the database query level, so even a misbehaving model can't pull data outside your user ID.

**"What if I'm in the EU/UK/CA — does this comply?"**
Yes. We support GDPR/UK GDPR/CCPA-compliant deletion and export. The in-app delete and export flows satisfy regulator requests.

**"Can my doctor see my chats if I share my account?"**
Don't share your account. Use [data export](/account/export) to share specific exports, which you control.

## Related

- [Tool calls explained](/ai/tool-calls) — what tools fetch when.
- [Security & data handling](/account/security) — how all data is stored.
- [Delete your account](/account/delete) — for full removal.
