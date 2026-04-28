// redditEngagement.draftReply — Sonnet-class agent loop. Optionally
// uses WebFetch + reddit_comment_tree to ground the reply (avoid
// duplicating something already said in the thread; pull a citation if
// claiming a fact). Writes draft.body on the opportunity.

export const DRAFT_REPLY_PROMPT_KEY = 'redditEngagement.draftReply';

const DEFAULT_BODY = `You are drafting a Reddit reply for the persona below. The goal is a GENUINE, VALUABLE comment that reads like a knowledgeable peer responding — not marketing.

HARD RULES:
- 60–180 words. Reddit-formatted markdown (line breaks, occasional bold). No headings.
- Open with the substantive answer. No "Great question!", no "Hope this helps!".
- If you make any factual claim, ground it (cite a paper, a guideline, your own experience). Otherwise it reads as confident slop.
- Honor selfPromoPolicy. If "never": no mentions of products, sites, or affiliations. If "soft-link-when-relevant": ONE link, only if directly answers OP's need.
- Honor do-not-mention list.
- If the thread already contains a thoughtful answer making the same point you'd make, DO NOT POST. End your reply with: NO_REPLY: <reason>
- Use reddit_comment_tree at most once if you want to check existing replies. Use WebFetch if you need to verify a citation. Otherwise: just write.

PERSONA:
{{voiceContext}}

TRIAGE NOTES (what the triage agent thought we'd add):
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
    description: 'System prompt for composing a Reddit reply draft. Voice-aware, multi-turn (can use WebFetch + reddit_comment_tree). Outputs the reply body verbatim or NO_REPLY:...',
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'voiceContext', description: 'Persona voice block' },
      { name: 'triageContext', description: 'fit + valueAngle + risks from triage' },
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

    const voiceContext = voice
      ? `Name: ${voice.name}\nVoice: ${voice.voiceProfile?.voiceDescription || '(none)'}\nExpertise: ${(voice.voiceProfile?.expertiseTags || []).join(', ')}\nDo NOT mention: ${(voice.voiceProfile?.doNotMention || []).join(', ')}\nSelf-promo policy: ${voice.voiceProfile?.selfPromoPolicy || 'never'}\nSignature: ${voice.voiceProfile?.signatureSnippet || '(none)'}`
      : '(no voice profile configured)';
    const triageContext = opp.triage
      ? `fit=${opp.triage.fit}; valueAngle=${opp.triage.valueAngle}; risks=${(opp.triage.risks || []).join('; ')}`
      : '(no triage yet)';

    const allowed = new Set();
    if (ctx.tools.get('reddit_comment_tree')) allowed.add('reddit_comment_tree');
    const tools = ctx.tools.listForAgent(Array.from(allowed));

    const result = await ctx.agent.runWithTools({
      promptKey: DRAFT_REPLY_PROMPT_KEY,
      context: {
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
      opp.status = 'low-fit-archived';
      opp.reviewerNotes = body;
      await opp.save();
      return { posted: false, reason: 'agent_declined', costUsd: result.costUsd };
    }

    opp.draft = {
      body,
      voiceContactIdAtDraft: sub.voiceContactId,
      model: ctx.config.models.draft,
      costUsd: result.costUsd,
      generatedAt: new Date(),
    };
    opp.status = 'drafted';
    await opp.save();

    return { drafted: true, costUsd: result.costUsd, iterations: result.iterations };
  });
}
