// contacts.classify — derives roles[], primaryRole, and suggested tags
// from a Contact's presences[] + bio + niche. Cheap (Haiku 4.5).
// Auto-applied at confidence ≥ 0.8; below that, suggestions go into
// classify history for review (Phase 9).

export const CLASSIFY_PROMPT_KEY = 'contacts.classify';

const DEFAULT_BODY = `You are a marketing data classifier. Given a contact record (someone who may be a content creator, influencer, journalist, clinician, etc.), determine:

1. Their **primaryRole** — the single role best describing what they do publicly. Choose from:
   podcaster, substack-writer, youtuber, blogger, redditor, instagrammer, tiktoker, x-poster, journalist, contributing-writer, newsletter-author, clinician, researcher, founder, other

2. A list of **roles** — every role that applies (multi). Same vocabulary as primaryRole.

3. Up to 5 **suggestedTags** — short topical descriptors (e.g. "glp1", "peptides", "rd", "female-focused", "biohacking"). Lowercase, hyphenated.

4. A **confidence** number from 0.0 to 1.0 indicating how confident you are in the role/tag assignments. If the contact has rich presence data and a clear niche, 0.9+. If sparse signals, lower.

5. A short one-sentence **reasoning** explaining your call.

Return STRICTLY valid JSON in this shape (no extra prose, no markdown fences):

{
  "primaryRole": "...",
  "roles": ["...", "..."],
  "suggestedTags": ["...", "..."],
  "confidence": 0.0,
  "reasoning": "..."
}

CONTACT DATA:

Name: {{contact.name}}
Bio: {{contact.bio}}
Niche: {{contact.niche}}
Existing roles: {{contact.roles}}
Existing tags: {{contact.tags}}
Presences: {{contact.presences}}
`;

export function registerClassifyPrompt(promptRegistry) {
  promptRegistry.register({
    key: CLASSIFY_PROMPT_KEY,
    module: 'contacts',
    title: 'Classify Contact',
    description:
      'Derives a contact\'s primaryRole, roles[], and suggested tags from their presences + niche + bio. Runs on save/import; auto-applies suggestions at confidence ≥ 0.8.',
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'contact.name', description: 'Display name' },
      { name: 'contact.bio', description: 'Short bio' },
      { name: 'contact.niche', description: 'Long-form differentiator' },
      { name: 'contact.roles', description: 'Existing roles[] (JSON-encoded if non-empty)' },
      { name: 'contact.tags', description: 'Existing tags[] (JSON-encoded if non-empty)' },
      { name: 'contact.presences', description: 'Full presences[] array (JSON-encoded)' },
    ],
    outputSchema: {
      type: 'object',
      required: ['primaryRole', 'roles', 'suggestedTags', 'confidence'],
      properties: {
        primaryRole: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
        suggestedTags: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
        reasoning: { type: 'string' },
      },
    },
    modelSlot: 'classify',
  });
}

const CONFIDENCE_THRESHOLD = 0.8;

export function registerClassifyJob(registry) {
  registry.register('contacts.classify', async ({ job, ctx }) => {
    const contact = await ctx.models.Contact.findById(job.contactId);
    if (!contact) {
      throw new Error(`contact ${job.contactId} not found`);
    }

    const result = await ctx.agent.run({
      promptKey: CLASSIFY_PROMPT_KEY,
      context: { contact: contact.toObject() },
      slot: 'classify',
      jobId: job._id,
      contactId: contact._id,
      budgetCapUsd: job.budget?.capUsd,
    });

    const suggestion = result.parsed;
    const applied = {};
    if (suggestion && suggestion.confidence >= CONFIDENCE_THRESHOLD) {
      const update = {};
      if (suggestion.primaryRole) {
        applied.primaryRole = suggestion.primaryRole;
        update.primaryRole = suggestion.primaryRole;
      }
      if (Array.isArray(suggestion.roles) && suggestion.roles.length > 0) {
        applied.roles = mergeUnique(contact.roles, suggestion.roles);
        update.roles = applied.roles;
      }
      if (Array.isArray(suggestion.suggestedTags) && suggestion.suggestedTags.length > 0) {
        applied.tags = mergeUnique(contact.tags, suggestion.suggestedTags);
        update.tags = applied.tags;
      }
      update['modules.classify'] = {
        lastRunAt: new Date(),
        lastConfidence: suggestion.confidence,
        lastReasoning: suggestion.reasoning,
      };
      // Atomic update — sidesteps mongoose VersionError when multiple
      // jobs touch the same Contact concurrently (e.g. classify and
      // research finishing close together) or when the Mixed `modules`
      // field's dirty tracking misbehaves.
      await ctx.models.Contact.updateOne({ _id: contact._id }, { $set: update });
    }

    return {
      suggestion,
      applied,
      autoApplied: !!Object.keys(applied).length,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      model: result.model,
    };
  });
}

function mergeUnique(a, b) {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}
