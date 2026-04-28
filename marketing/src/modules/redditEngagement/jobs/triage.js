// redditEngagement.triageOpportunity — cheap (Haiku) classifier that
// decides whether an opportunity is worth replying to, what angle adds
// value, and what risks to flag. Auto-enqueues a draft job for fit ≥
// medium; archives low/no-fit opportunities.

export const TRIAGE_PROMPT_KEY = 'redditEngagement.triage';

const DEFAULT_BODY = `You are deciding whether a Reddit thread is worth us engaging on. We are running a marketing strategy where we add genuine, valuable replies to build positive reputation in target subreddits — NOT to promote a product.

Output a fit assessment. Consider:
- Does the post invite expert input (a question, a misconception, a debate)?
- Do we (the persona below) have unusually relevant experience?
- Are there already thoughtful answers? If yes, skip — adding noise hurts us.
- Is engagement risky (medical claim territory, brigade-prone topic, off-topic for the sub)?
- If we replied, would the reply feel valuable to a stranger reading it later?

Return STRICTLY valid JSON, no markdown:

{
  "fit": "high" | "medium" | "low" | "no",
  "reasoning": "...",
  "valueAngle": "What we'd specifically add — concrete, one sentence.",
  "risks": ["..."]
}

OUR PERSONA (we'd be replying as this voice):
{{voiceContext}}

THE THREAD:

Subreddit: r/{{subreddit}}
Title: {{title}}
Author: u/{{authorUsername}}
Score: {{postScore}} · Comments so far: {{postCommentCount}}
Posted: {{postedAt}}
Matched keywords: {{matchedKeywords}}

Body:
{{postExcerpt}}
`;

export function registerTriagePrompt(promptRegistry) {
  promptRegistry.register({
    key: TRIAGE_PROMPT_KEY,
    module: 'redditEngagement',
    title: 'Reddit Triage System Prompt',
    description: 'Decides fit (high/medium/low/no) for replying to a Reddit thread, given our persona and the thread context.',
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'voiceContext', description: 'Pre-formatted voice profile block' },
      { name: 'subreddit', description: 'Subreddit name (no r/)' },
      { name: 'title', description: 'Post title' },
      { name: 'authorUsername', description: 'OP username' },
      { name: 'postScore', description: '' },
      { name: 'postCommentCount', description: '' },
      { name: 'postedAt', description: 'ISO timestamp' },
      { name: 'matchedKeywords', description: 'Keywords that triggered the match' },
      { name: 'postExcerpt', description: 'First ~800 chars of selftext' },
    ],
    outputSchema: {
      type: 'object',
      required: ['fit', 'reasoning', 'valueAngle'],
      properties: {
        fit: { type: 'string', enum: ['high', 'medium', 'low', 'no'] },
        reasoning: { type: 'string' },
        valueAngle: { type: 'string' },
        risks: { type: 'array', items: { type: 'string' } },
      },
    },
    modelSlot: 'triage',
  });
}

export function registerTriageJob(registry) {
  registry.register('redditEngagement.triageOpportunity', async ({ job, ctx }) => {
    const opp = await ctx.models.EngagementOpportunity.findById(job.opportunityId);
    if (!opp) throw new Error(`opportunity ${job.opportunityId} not found`);
    const sub = await ctx.models.MonitoredSubreddit.findById(opp.subredditId);
    if (!sub) throw new Error(`subreddit ${opp.subredditId} not found`);
    const voice = await ctx.models.Contact.findById(sub.voiceContactId).lean();

    const voiceContext = voice
      ? `Name: ${voice.name}\nVoice: ${voice.voiceProfile?.voiceDescription || '(none)'}\nExpertise: ${(voice.voiceProfile?.expertiseTags || []).join(', ')}\nDo NOT mention: ${(voice.voiceProfile?.doNotMention || []).join(', ')}\nSelf-promo policy: ${voice.voiceProfile?.selfPromoPolicy || 'never'}`
      : '(no voice profile configured)';

    const result = await ctx.agent.run({
      promptKey: TRIAGE_PROMPT_KEY,
      context: {
        voiceContext,
        subreddit: opp.subreddit,
        title: opp.title,
        authorUsername: opp.authorUsername,
        postScore: opp.postScore,
        postCommentCount: opp.postCommentCount,
        postedAt: opp.postedAt?.toISOString(),
        matchedKeywords: (opp.matchedKeywords || []).join(', '),
        postExcerpt: opp.postExcerpt,
      },
      slot: 'triage',
      jobId: job._id,
      opportunityId: opp._id,
      budgetCapUsd: job.budget?.capUsd,
    });

    if (!result.parsed) throw new Error('triage agent returned non-JSON output');

    opp.triage = {
      fit: result.parsed.fit,
      reasoning: result.parsed.reasoning,
      valueAngle: result.parsed.valueAngle,
      risks: result.parsed.risks || [],
      model: result.model,
      costUsd: result.costUsd,
      completedAt: new Date(),
    };
    if (['high', 'medium'].includes(result.parsed.fit)) {
      opp.status = 'triaged';
      await opp.save();
      // Auto-enqueue draft job
      await ctx.worker.enqueue({
        type: 'redditEngagement.draftReply',
        opportunityId: opp._id,
      });
    } else {
      opp.status = 'low-fit-archived';
      await opp.save();
    }

    return {
      fit: opp.triage.fit,
      autoEnqueueDraft: ['high', 'medium'].includes(opp.triage.fit),
      costUsd: result.costUsd,
    };
  });
}
