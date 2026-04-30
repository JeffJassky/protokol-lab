// redditEngagement.draftReply — Sonnet-class agent loop. Optionally
// uses WebFetch + reddit_comment_tree to ground the reply (avoid
// duplicating something already said in the thread; pull a citation if
// claiming a fact). Writes draft.body on the opportunity.
//
// Bucket-driven framing (per plans/reddit-classification.md):
//   DIRECT_ASK       — recommend the app naturally; that's literally the ask.
//   INDIRECT_PROBLEM — substance-first answer, app as a footnote/PS line.
//   TOPIC_ADJACENT   — useful comment, NO app mention; build credibility.
//   SKIP             — should never reach the drafter (triage tombstones).

export const DRAFT_REPLY_PROMPT_KEY = 'redditEngagement.draftReply';

const APP_NAME = 'Protokol Lab';
const APP_URL = 'https://protokollab.com';

// Per-bucket framing instructions injected into the system prompt.
// Centralized so triage→draft semantics stay aligned.
const BUCKET_INSTRUCTIONS = {
  DIRECT_ASK: `BUCKET = DIRECT_ASK
The user is explicitly asking for an app/tracker/MFP-alternative. Recommend ${APP_NAME} (${APP_URL}) naturally and concisely. One link, in-context. Lead with the substantive answer to what they actually asked, THEN make the recommendation. Don't pitch — describe what it does in one or two specific terms relevant to their ask. Other tools can be mentioned for honesty, but ${APP_NAME} should be present.`,

  INDIRECT_PROBLEM: `BUCKET = INDIRECT_PROBLEM
The user has a problem ${APP_NAME} solves but didn't ask for an app. Lead with substance — actually answer their problem with lived experience, math, or a concrete suggestion. Then, ONLY if natural and relevant, drop a one-line footnote like "I've been building a tool around this exact problem if you want to check it out: ${APP_URL}" or similar. The footnote is optional — if it doesn't fit, omit it. Substance first, app as PS.`,

  TOPIC_ADJACENT: `BUCKET = TOPIC_ADJACENT
On-topic for the niche but NOT about a problem the app solves. Be helpful, share lived experience, contribute to the discussion. **DO NOT mention ${APP_NAME}, the URL, or any app/tool the persona builds.** This is pure community-credibility. Add value, build profile recognition.`,
};

const DEFAULT_BODY = `You are drafting a Reddit reply for the persona below. The goal is a GENUINE, VALUABLE comment that reads like a knowledgeable peer responding — not marketing.

HARD RULES:
- 60–180 words. Reddit-formatted markdown (line breaks, occasional bold). No headings.
- Open with the substantive answer. No "Great question!", no "Hope this helps!".
- If you make any factual claim, ground it (cite a paper, a guideline, your own experience). Otherwise it reads as confident slop.
- Honor do-not-mention list (in persona).
- If the thread already contains a thoughtful answer making the same point you'd make, DO NOT POST. End your reply with: NO_REPLY: <reason>
- Use reddit_comment_tree at most once if you want to check existing replies. Use WebFetch if you need to verify a citation. Otherwise: just write.

BUCKET-SPECIFIC INSTRUCTIONS:
{{bucketInstructions}}

PERSONA:
{{voiceContext}}

TRIAGE RATIONALE (why this bucket):
{{triageContext}}

THE THREAD:
Subreddit: r/{{subreddit}}
Post URL: {{postUrl}}
Title: {{title}}
Body:
{{postExcerpt}}

OPTIONAL STEERING NOTE FROM REVIEWER:
{{steeringNote}}

When done, emit ONLY the reply body as plain markdown. Do not add commentary outside the reply itself. If you decide not to reply, emit just "NO_REPLY: <reason>".`;

export function registerDraftReplyPrompt(promptRegistry) {
  promptRegistry.register({
    key: DRAFT_REPLY_PROMPT_KEY,
    module: 'redditEngagement',
    title: 'Reddit Reply Draft System Prompt',
    description: 'Bucket-aware drafter. Branches on DIRECT_ASK / INDIRECT_PROBLEM / TOPIC_ADJACENT to decide whether and how to mention the product.',
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'bucketInstructions', description: 'Bucket-specific framing rules (built from triage.bucket).' },
      { name: 'voiceContext', description: 'Persona voice block' },
      { name: 'triageContext', description: 'bucket + because from triage' },
      { name: 'subreddit', description: '' },
      { name: 'postUrl', description: '' },
      { name: 'title', description: '' },
      { name: 'postExcerpt', description: '' },
      { name: 'steeringNote', description: 'Optional reviewer note when re-drafting' },
    ],
    modelSlot: 'draft',
  });
}

export function registerDraftReplyJob(registry) {
  registry.register('redditEngagement.draftReply', async ({ job, ctx }) => {
    const opp = await ctx.models.EngagementOpportunity.findById(job.opportunityId);
    if (!opp) throw new Error(`opportunity ${job.opportunityId} not found`);
    const sub = await ctx.models.MonitoredSubreddit.findById(opp.subredditId);
    if (!sub) throw new Error(`subreddit ${opp.subredditId} not found`);
    const voice = await ctx.models.Contact.findById(sub.voiceContactId).lean();

    // Voice context — full description for drafter (Sonnet). Excludes
    // selfPromoPolicy (removed). Mentions/recommendations are bucket-driven.
    const voiceContext = voice
      ? `Name: ${voice.name}\nVoice: ${voice.voiceProfile?.voiceDescription || '(none)'}\nExpertise: ${(voice.voiceProfile?.expertiseTags || []).join(', ')}\nDo NOT mention: ${(voice.voiceProfile?.doNotMention || []).join(', ')}\nSignature: ${voice.voiceProfile?.signatureSnippet || '(none)'}`
      : '(no voice profile configured)';

    const bucket = opp.triage?.bucket;
    const bucketInstructions = BUCKET_INSTRUCTIONS[bucket]
      || '(no bucket set — default to substance-first, no app mention)';
    const triageContext = opp.triage
      ? `bucket=${bucket}; because=${opp.triage.because || ''}`
      : '(no triage yet)';

    const allowed = new Set();
    if (ctx.tools.get('reddit_comment_tree')) allowed.add('reddit_comment_tree');
    const tools = ctx.tools.listForAgent(Array.from(allowed));

    const result = await ctx.agent.runWithTools({
      promptKey: DRAFT_REPLY_PROMPT_KEY,
      context: {
        bucketInstructions,
        voiceContext,
        triageContext,
        subreddit: opp.subreddit,
        postUrl: opp.postUrl,
        title: opp.title,
        postExcerpt: opp.postExcerpt,
        steeringNote: job.payload?.steeringNote || '(none)',
      },
      initialUser:
        'Draft the reply now. Use tools sparingly. End with the reply body verbatim, or NO_REPLY: <reason>.',
      tools,
      toolCtx: { job, opportunity: opp, ctx },
      allowedBuiltins: ['WebFetch'],
      slot: 'draft',
      jobId: job._id,
      opportunityId: opp._id,
      budgetCapUsd: job.budget?.capUsd,
      sseChannel: `engagement-draft-${opp._id}`,
    });

    const body = (result.text || '').trim();
    if (body.startsWith('NO_REPLY')) {
      // Drafter decided not to reply (e.g. someone already said the same
      // thing). Tombstone so the row doesn't resurface.
      opp.status = 'low-fit-archived';
      opp.decision = 'dismissed';
      opp.decidedAt = new Date();
      opp.decisionNote = body;
      await opp.save();
      return { posted: false, reason: 'agent_declined', costUsd: result.costUsd };
    }

    opp.draft = {
      body,
      generatedAt: new Date(),
    };
    opp.status = 'drafted';
    await opp.save();

    return { drafted: true, costUsd: result.costUsd, iterations: result.iterations };
  });
}
