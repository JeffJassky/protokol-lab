import { sendTelegram, escapeMarkdownV2 } from '../../../shared/notify/telegram.js';

// redditEngagement.triage — Haiku classifier. Buckets each post into one
// of four action-oriented categories per plans/reddit-classification.md:
//
//   DIRECT_ASK       — explicit "what app does X / MFP alternatives?". Reply
//                      ASAP (1-hour window matters), recommend the app.
//   INDIRECT_PROBLEM — venting about a problem the app solves. Reply within
//                      a day, substance-first, app as a footnote.
//   TOPIC_ADJACENT   — on-topic for the niche but not about the app's
//                      problem space. Useful comment, no app mention,
//                      build profile credibility.
//   SKIP             — off-topic, vent with no question, drama, or nothing
//                      useful to add. Tombstone.
//
// Two flavors:
//   - triageOpportunity (single) — used by manual /triage endpoint
//   - triageBatch (N at once)    — used by scan; one Haiku call rates N

export const TRIAGE_PROMPT_KEY = 'redditEngagement.triage';
export const TRIAGE_BATCH_PROMPT_KEY = 'redditEngagement.triageBatch';

const BUCKETS_DESCRIPTION = `
- DIRECT_ASK = User explicitly asks for a tracking app, MFP alternative, or any app that does what we do. "What app does X?", "alternatives to MyFitnessPal?", "is there a tracker for Y?". Question is about apps/tools/trackers specifically.
- INDIRECT_PROBLEM = User has a problem the app specifically solves (bouncy daily weight, inconsistent hunger throughout cycle, macro targets with GLP-1s, logging friction, dose timing/half-life confusion, weekly vs daily macro thinking, appetite cycling on GLP-1s) but isn't asking for an app.
- TOPIC_ADJACENT = On-topic for the niche (peptides, GLP-1s, biohacking, weight loss) but not about anything the app addresses. Vendor/sourcing questions, dosing protocols, side effects, reconstitution, etc.
- SKIP = Off-topic, pure vent with no question, drama, brigade-bait, or nothing useful to add.`;

const DEFAULT_BODY = `Classify a Reddit thread into one of four buckets for a builder of an ADHD-friendly tracking app for GLP-1 patients.

PERSONA / VOICE:
{{voiceCard}}

THREAD:
r/{{subreddit}} · score {{postScore}} · {{postCommentCount}} comments · matched: {{matchedKeywords}}
Title: {{title}}
Body: {{postExcerpt}}

BUCKETS:${BUCKETS_DESCRIPTION}

Return ONLY this JSON, nothing else:
{"bucket":"DIRECT_ASK|INDIRECT_PROBLEM|TOPIC_ADJACENT|SKIP","because":"≤15 words"}
`;

export function registerTriagePrompt(promptRegistry) {
  promptRegistry.register({
    key: TRIAGE_PROMPT_KEY,
    module: 'redditEngagement',
    title: 'Reddit Triage System Prompt',
    description: 'Classifies a single Reddit thread into one of four action-oriented buckets (DIRECT_ASK / INDIRECT_PROBLEM / TOPIC_ADJACENT / SKIP).',
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'voiceCard', description: 'Slim persona triage card (~150 tokens).' },
      { name: 'subreddit', description: 'Subreddit name (no r/)' },
      { name: 'title', description: 'Post title' },
      { name: 'postScore', description: '' },
      { name: 'postCommentCount', description: '' },
      { name: 'matchedKeywords', description: 'Keywords that triggered the match' },
      { name: 'postExcerpt', description: 'First ~800 chars of selftext' },
    ],
    outputSchema: {
      type: 'object',
      required: ['bucket', 'because'],
      properties: {
        bucket: { type: 'string', enum: ['DIRECT_ASK', 'INDIRECT_PROBLEM', 'TOPIC_ADJACENT', 'SKIP'] },
        because: { type: 'string' },
      },
    },
    modelSlot: 'triage',
  });
}

// ──────────────────────────────────────────────────────────────────────
// Bucket → action mapping (used by both single + batch handlers).
//   DIRECT_ASK / INDIRECT_PROBLEM / TOPIC_ADJACENT → status='triaged',
//     auto-enqueue a draft. Drafter receives the bucket and frames the
//     reply accordingly (recommend the app vs footnote vs no mention).
//   SKIP → permanent tombstone (decision='dismissed') so future scans
//     hit the unique index and skip re-triage cost.
// ──────────────────────────────────────────────────────────────────────
function applyBucketDecision(opp, bucket, because, isBatch) {
  opp.triage = { bucket, because: because || '', completedAt: new Date() };
  if (bucket === 'SKIP') {
    opp.status = 'low-fit-archived';
    opp.decision = 'dismissed';
    opp.decidedAt = new Date();
    opp.decisionNote = `auto-dismissed: triage bucket=SKIP${isBatch ? ' (batch)' : ''}`;
    return { autoDraft: false };
  }
  opp.status = 'triaged';
  return { autoDraft: true };
}

// Fire-and-forget Telegram alert. DIRECT_ASK posts have a 1-hour visibility
// window per the rubric, so push immediately when found. Silent no-op if
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set.
function notifyDirectAsk(opp, logger) {
  if (opp.triage?.bucket !== 'DIRECT_ASK') return;
  const url = opp.postUrl || '';
  const title = (opp.title || '').slice(0, 200);
  const because = (opp.triage?.because || '').slice(0, 200);
  // MarkdownV2 — escape user-supplied substrings; keep our own asterisks
  // raw for bold formatting.
  const text =
    `🎯 *DIRECT ASK* in r/${escapeMarkdownV2(opp.subreddit)}\n` +
    `*${escapeMarkdownV2(title)}*\n` +
    (because ? `_${escapeMarkdownV2(because)}_\n` : '') +
    `\n${escapeMarkdownV2(url)}`;
  // Don't await — alert latency must never block triage throughput.
  sendTelegram(text, { parseMode: 'MarkdownV2' })
    .then((r) => {
      if (!r.ok && !r.skipped) {
        logger?.warn?.({ err: r.error, oppId: String(opp._id) }, '[triage] telegram alert failed');
      }
    })
    .catch(() => {}); // belt + suspenders — sendTelegram already swallows
}

export function registerTriageJob(registry) {
  registry.register('redditEngagement.triageOpportunity', async ({ job, ctx }) => {
    const opp = await ctx.models.EngagementOpportunity.findById(job.opportunityId);
    if (!opp) throw new Error(`opportunity ${job.opportunityId} not found`);
    const sub = await ctx.models.MonitoredSubreddit.findById(opp.subredditId);
    if (!sub) throw new Error(`subreddit ${opp.subredditId} not found`);
    const voice = await ctx.models.Contact.findById(sub.voiceContactId).lean();

    const voiceCard = voice?.voiceProfile?.triageCard
      || (voice
        ? `${voice.name} — ${voice.niche || ''}\nTop tags: ${(voice.voiceProfile?.expertiseTags || []).slice(0, 8).join(', ')}`
        : '(no voice profile configured)');

    const result = await ctx.agent.run({
      promptKey: TRIAGE_PROMPT_KEY,
      context: {
        voiceCard,
        subreddit: opp.subreddit,
        title: opp.title,
        postScore: opp.postScore,
        postCommentCount: opp.postCommentCount,
        matchedKeywords: (opp.matchedKeywords || []).join(', '),
        postExcerpt: opp.postExcerpt,
      },
      slot: 'triage',
      jobId: job._id,
      opportunityId: opp._id,
      budgetCapUsd: job.budget?.capUsd,
    });

    if (!result.parsed) throw new Error('triage agent returned non-JSON output');

    const { autoDraft } = applyBucketDecision(opp, result.parsed.bucket, result.parsed.because, false);
    await opp.save();

    notifyDirectAsk(opp, ctx.logger);

    if (autoDraft) {
      await ctx.worker.enqueue({
        type: 'redditEngagement.draftReply',
        opportunityId: opp._id,
      });
    }

    return {
      bucket: opp.triage.bucket,
      autoEnqueueDraft: autoDraft,
      costUsd: result.costUsd,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────
// BATCH TRIAGE — one Haiku call rates N opportunities. Voice card sent
// once per call instead of N times = ~50% token reduction. Used by scan
// after each successful crawl.
// ──────────────────────────────────────────────────────────────────────

const BATCH_DEFAULT_BODY = `Classify each Reddit thread below into one of four buckets for a builder of an ADHD-friendly tracking app for GLP-1 patients.

PERSONA / VOICE:
{{voiceCard}}

BUCKETS:${BUCKETS_DESCRIPTION}

THREADS:
{{threads}}

Return ONLY a JSON array, one element per thread, in the same order, nothing else:
[{"i":1,"bucket":"DIRECT_ASK|INDIRECT_PROBLEM|TOPIC_ADJACENT|SKIP","because":"≤15 words"}, {"i":2, ...}, ...]
`;

export function registerTriageBatchPrompt(promptRegistry) {
  promptRegistry.register({
    key: TRIAGE_BATCH_PROMPT_KEY,
    module: 'redditEngagement',
    title: 'Reddit Triage (Batch) System Prompt',
    description: 'Classifies N Reddit threads in one Haiku call. ~50% cheaper than per-post triage.',
    defaultBody: BATCH_DEFAULT_BODY,
    variables: [
      { name: 'voiceCard', description: 'Slim persona triage card' },
      { name: 'threads', description: 'Numbered list of threads with title + excerpt + meta' },
    ],
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['i', 'bucket'],
        properties: {
          i: { type: 'number' },
          bucket: { type: 'string', enum: ['DIRECT_ASK', 'INDIRECT_PROBLEM', 'TOPIC_ADJACENT', 'SKIP'] },
          because: { type: 'string' },
        },
      },
    },
    modelSlot: 'triage',
  });
}

const MAX_BATCH = 25;

export function registerTriageBatchJob(registry) {
  registry.register('redditEngagement.triageBatch', async ({ job, ctx }) => {
    const ids = (job.payload?.opportunityIds || []).slice(0, MAX_BATCH);
    if (ids.length === 0) return { fits: {}, costUsd: 0 };

    const opps = await ctx.models.EngagementOpportunity.find({ _id: { $in: ids } });
    if (opps.length === 0) return { fits: {}, costUsd: 0 };

    const sub = await ctx.models.MonitoredSubreddit.findById(opps[0].subredditId);
    const voice = sub ? await ctx.models.Contact.findById(sub.voiceContactId).lean() : null;
    const voiceCard = voice?.voiceProfile?.triageCard
      || (voice
        ? `${voice.name} — ${voice.niche || ''}\nTop tags: ${(voice.voiceProfile?.expertiseTags || []).slice(0, 8).join(', ')}`
        : '(no voice profile configured)');

    const threadsBlock = opps.map((o, idx) => {
      const i = idx + 1;
      const excerpt = (o.postExcerpt || '').slice(0, 600).replace(/\s+/g, ' ');
      return `[${i}] r/${o.subreddit} · score ${o.postScore ?? '?'} · ${o.postCommentCount ?? 0} comments · matched: ${(o.matchedKeywords || []).join(', ')}\n    Title: ${o.title}\n    Body: ${excerpt}`;
    }).join('\n\n');

    const result = await ctx.agent.run({
      promptKey: TRIAGE_BATCH_PROMPT_KEY,
      context: { voiceCard, threads: threadsBlock },
      slot: 'triage',
      jobId: job._id,
      budgetCapUsd: job.budget?.capUsd,
      maxTokens: 50 + opps.length * 60,
    });

    if (!Array.isArray(result.parsed)) {
      throw new Error('triage batch agent returned non-array output');
    }

    const byIndex = new Map();
    for (const r of result.parsed) {
      if (typeof r.i === 'number' && r.bucket) byIndex.set(r.i, r);
    }

    const buckets = {};
    const draftEnqueues = [];
    for (let idx = 0; idx < opps.length; idx++) {
      const opp = opps[idx];
      const r = byIndex.get(idx + 1);
      if (!r) {
        buckets[opp._id.toString()] = 'unrated';
        continue;
      }
      const { autoDraft } = applyBucketDecision(opp, r.bucket, r.because, true);
      await opp.save();
      notifyDirectAsk(opp, ctx.logger);
      buckets[opp._id.toString()] = r.bucket;
      if (autoDraft) draftEnqueues.push(opp._id);
    }

    for (const id of draftEnqueues) {
      await ctx.worker.enqueue({
        type: 'redditEngagement.draftReply',
        opportunityId: id,
      });
    }

    return {
      batched: opps.length,
      buckets,
      draftEnqueues: draftEnqueues.length,
      costUsd: result.costUsd,
    };
  });
}
