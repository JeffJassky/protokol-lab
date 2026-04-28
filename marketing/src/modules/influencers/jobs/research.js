// influencers.research — multi-turn agent loop that enriches a Contact.
// The agent has access to Claude Code's built-in WebSearch + WebFetch,
// plus our custom MCP tools: scrape_contact_page, rss_fetch,
// save_finding, and platform-specific tools (reddit_*, youtube_*) when
// the contact has matching presences. It works through the contact's
// known presences, gathers recent content + distinctive points +
// contact-info candidates, and saves them via save_finding. After the
// loop, we reduce findings into the Contact's recentContent[],
// enrichmentSummary, personalizedHooks, and (when high-confidence)
// contactChannels.

export const ENRICH_PROMPT_KEY = 'influencers.enrich';

const DEFAULT_BODY = `You are a marketing researcher enriching a profile for outbound outreach. Your goal is to learn enough about this person that we can write a hand-feeling, specific email/DM that proves we've actually consumed their work.

You have tools:
- WebSearch: search the web. Use for current events, recent content, finding specific quotes/positions.
- WebFetch: fetch any webpage and read its content. Use for blog posts, podcast show pages, About pages, Substack posts.
- rss_fetch: fetch RSS/Atom feeds (podcasts, Substacks, blogs) and return parsed items.
- scrape_contact_page: scrape /contact /about /footer for emails + social handles. Use sparingly — only when the contact has a personal site and we don't already have an email.
- save_finding: REQUIRED — save every notable thing you learn as a structured finding.

YOUR STRATEGY:

1. Look at the contact's existing presences[] and pick the 1–3 most informative platforms.
2. Use rss_fetch / WebFetch / WebSearch to find their MOST RECENT 3–5 pieces of content (last 60 days ideally).
3. For each piece of content, identify the SINGLE MOST DISTINCTIVE POINT they made. Not "they talk about peptides" — something specific like "argued MOTS-c is wasted on people without mitochondrial damage". This is the GOLD — what makes outreach feel hand-written.
4. Save findings as you go via save_finding. Use kinds: recent_content, distinctive_point, niche_update, sponsorship_flag, contact_email, social_handle.
5. If the contact has a personal site/Substack and we don't have a contact email yet, run scrape_contact_page on their domain.
6. STOP when you have ~3-5 strong distinctive points + contact-info candidates. Don't over-research. Aim for one short loop, not exhaustive.

CONTACT TO RESEARCH:

Name: {{contact.name}}
Niche: {{contact.niche}}
Existing roles: {{contact.roles}}
Existing tags: {{contact.tags}}
Presences: {{contact.presences}}
Existing contact channels: {{contact.contactChannels}}
{{listContext}}

When done, emit a final text message summarizing what you found in 2-3 sentences. Do NOT include findings inline — they should be saved via save_finding.`;

export function registerEnrichPrompt(promptRegistry) {
  promptRegistry.register({
    key: ENRICH_PROMPT_KEY,
    module: 'influencers',
    title: 'Influencer Research System Prompt',
    description:
      'System prompt for the research agent loop. Drives a multi-turn session where the model uses WebSearch, WebFetch, rss_fetch, scrape_contact_page, save_finding, and platform-specific tools to enrich a Contact.',
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'contact.name', description: 'Display name' },
      { name: 'contact.niche', description: 'Long-form differentiator' },
      { name: 'contact.roles', description: 'Existing roles[]' },
      { name: 'contact.tags', description: 'Existing tags[]' },
      { name: 'contact.presences', description: 'presences[] (JSON-encoded)' },
      { name: 'contact.contactChannels', description: 'contactChannels[] (JSON-encoded)' },
      { name: 'listContext', description: 'List context block — what we are pitching, why this list cares (pre-formatted plain text)' },
    ],
    modelSlot: 'research',
  });
}

// Custom MCP tools the research agent gets access to. Scoped at run
// time based on what the contact's platforms actually need.
// Built-in WebSearch + WebFetch (provided by Claude Code) are added
// separately via the runner's `allowedBuiltins` arg.
function pickToolsForContact(toolRegistry, contact) {
  const allowed = new Set(['rss_fetch', 'scrape_contact_page', 'save_finding']);
  const platforms = new Set((contact.presences || []).map((p) => p.platform));
  if (platforms.has('reddit')) {
    allowed.add('reddit_user_history');
    allowed.add('reddit_search');
  }
  if (platforms.has('youtube')) {
    if (toolRegistry.get('youtube_channel_info')) allowed.add('youtube_channel_info');
    if (toolRegistry.get('youtube_recent_videos')) allowed.add('youtube_recent_videos');
    allowed.add('youtube_transcript');
  }
  return toolRegistry.listForAgent(Array.from(allowed));
}

export function registerResearchJob(registry) {
  registry.register('influencers.research', async ({ job, ctx }) => {
    const contact = await ctx.models.Contact.findById(job.contactId);
    if (!contact) throw new Error(`contact ${job.contactId} not found`);

    let listContext = '';
    if (job.listId) {
      const list = await ctx.models.ContactList.findById(job.listId).lean();
      if (list) {
        listContext =
          `LIST CONTEXT (we're pitching THIS audience):\n` +
          `Name: ${list.name}\n` +
          `Pitch: ${list.pitchSummary || '(none)'}\n` +
          `Notes: ${list.contextPrompt || '(none)'}\n`;
      }
    }

    const tools = pickToolsForContact(ctx.tools, contact);

    const result = await ctx.agent.runWithTools({
      promptKey: ENRICH_PROMPT_KEY,
      context: { contact: contact.toObject(), listContext },
      initialUser:
        `Begin enriching this profile. Use WebSearch + WebFetch to find 3-5 distinctive recent points and (if missing) a contact email candidate. Call save_finding for each. End with a 2-3 sentence summary.`,
      tools,
      toolCtx: { job, contact, ctx },
      allowedBuiltins: ['WebSearch', 'WebFetch'],
      slot: 'research',
      jobId: job._id,
      contactId: contact._id,
      budgetCapUsd: job.budget?.capUsd,
      sseChannel: `research-job-${job._id}`,
    });

    // Reduce findings into Contact fields. job.result.findings is the
    // structured trail; we project it into the Contact record so the UI
    // doesn't have to dig through job results.
    await applyFindingsToContact(contact, job.result?.findings || [], result.text);

    // Preserve findings written by the save_finding tool — runJob will
    // assign our return value to job.result, so we must include the
    // existing findings array or it gets overwritten.
    return {
      ...(job.result || {}),
      text: result.text,
      iterations: result.iterations,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      stoppedReason: result.stoppedReason,
      findingsCount: (job.result?.findings || []).length,
    };
  });
}

async function applyFindingsToContact(contact, findings, summaryText) {
  const recentContent = [];
  const personalizedHooks = [];
  const conflicts = new Set(contact.conflicts || []);
  const newChannels = [];

  for (const f of findings) {
    if (f.kind === 'recent_content') {
      recentContent.push({
        title: f.data?.title,
        url: f.data?.url || f.sourceUrl,
        publishedAt: f.data?.publishedAt ? new Date(f.data.publishedAt) : undefined,
        platform: f.data?.platform,
        summary: f.summary,
        distinctivePoint: f.data?.distinctivePoint,
      });
      if (f.data?.distinctivePoint) {
        personalizedHooks.push({
          text: f.data.distinctivePoint,
          sourceContentUrl: f.data?.url || f.sourceUrl,
          generatedAt: new Date(),
        });
      }
    } else if (f.kind === 'distinctive_point') {
      personalizedHooks.push({
        text: f.summary,
        sourceContentUrl: f.sourceUrl,
        generatedAt: new Date(),
      });
    } else if (f.kind === 'sponsorship_flag') {
      conflicts.add(f.summary);
    } else if (f.kind === 'contact_email' && f.data?.email) {
      newChannels.push({
        type: 'email',
        value: f.data.email,
        sourceUrl: f.sourceUrl,
        confidence: f.data.confidence || 'scraped',
      });
    } else if (f.kind === 'contact_form' && f.sourceUrl) {
      newChannels.push({
        type: 'contact_form',
        value: f.sourceUrl,
        sourceUrl: f.sourceUrl,
        confidence: 'scraped',
      });
    }
  }

  // Merge in newChannels — skip ones we already have at higher confidence.
  const existingValues = new Set((contact.contactChannels || []).map((c) => `${c.type}:${c.value}`));
  for (const c of newChannels) {
    const key = `${c.type}:${c.value}`;
    if (!existingValues.has(key)) {
      contact.contactChannels = contact.contactChannels || [];
      contact.contactChannels.push(c);
      existingValues.add(key);
    }
  }

  if (recentContent.length > 0) {
    // Prepend new content; cap at 20
    const existing = contact.recentContent || [];
    const seenUrls = new Set(recentContent.map((r) => r.url));
    contact.recentContent = [...recentContent, ...existing.filter((e) => !seenUrls.has(e.url))].slice(0, 20);
  }
  if (personalizedHooks.length > 0) {
    const existing = contact.personalizedHooks || [];
    contact.personalizedHooks = [...personalizedHooks, ...existing].slice(0, 20);
  }
  if (conflicts.size > (contact.conflicts || []).length) {
    contact.conflicts = Array.from(conflicts);
  }
  if (summaryText) contact.enrichmentSummary = summaryText;
  contact.lastResearchedAt = new Date();
  if (contact.status === 'new' || contact.status === 'researching') {
    contact.status = 'enriched';
  }
  await contact.save();
}
