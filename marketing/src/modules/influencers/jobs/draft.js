// influencers.draft — single-shot agent. No tools; works from already-
// gathered contact findings + list.contextPrompt + (optional) voice
// Contact's voiceProfile. Output: { subject, body, hookSentenceUsed }.

export const DRAFT_PROMPT_KEY = 'influencers.draft';

const DEFAULT_BODY = `You are writing personalized outreach for a marketing campaign. Your goal is a SHORT, hand-feeling message that proves we've actually consumed this person's work — not generic intro spam.

OUTPUT REQUIREMENTS:
- subject: under 60 chars, specific to the recipient, no clickbait, no all caps. Often a fragment is better than a sentence.
- body: 60–120 words. Open with the personalization sentence (referencing one specific thing they said/wrote/produced — see "Personalized hooks" below). Then ONE clear ask. End plainly. No "I hope this finds you well", no "I'm reaching out because", no signoff like "Best regards" — keep it casual.
- hookSentenceUsed: the exact opening sentence you chose, returned separately so we can audit. Must reference one of the personalizedHooks or recentContent items if any exist.

HARD RULES:
- Do NOT fabricate quotes or claims. If the personalizedHooks are weak, fall back to a presence the contact actually has and reference it accurately.
- Match the channel format. For "reddit_dm" or "x_dm", be SHORTER (40–80 words), more casual.
- For "email", a subject is required. For DMs, subject can be empty string.
- Honor any do-not-mention items from voice. Honor selfPromoPolicy.
- Never claim affiliation we don't have.

Return STRICTLY valid JSON, no markdown fences:

{
  "subject": "...",
  "body": "...",
  "hookSentenceUsed": "..."
}

CHANNEL: {{channel}}

CONTACT:
Name: {{contact.name}}
Display handle: {{contact.displayHandle}}
Niche: {{contact.niche}}
Roles: {{contact.roles}}
Tags: {{contact.tags}}
Recent content: {{contact.recentContent}}
Personalized hooks (USE ONE OF THESE for the opener if any exist):
{{contact.personalizedHooks}}
Conflicts/flags to be aware of: {{contact.conflicts}}

LIST CONTEXT (what we're pitching):
{{listContext}}

VOICE (we are writing AS this person):
{{voiceContext}}
`;

export function registerDraftPrompt(promptRegistry) {
  promptRegistry.register({
    key: DRAFT_PROMPT_KEY,
    module: 'influencers',
    title: 'Outreach Draft System Prompt',
    description:
      "Single-shot prompt that composes one personalized outreach draft. Reads the contact's already-gathered findings + the list's pitch context + (optional) voice profile. Channel-aware.",
    defaultBody: DEFAULT_BODY,
    variables: [
      { name: 'channel', description: 'email | reddit_dm | x_dm | instagram_dm | substack_message | contact_form | linkedin_inmail' },
      { name: 'contact.name', description: '' },
      { name: 'contact.displayHandle', description: '' },
      { name: 'contact.niche', description: '' },
      { name: 'contact.roles', description: '' },
      { name: 'contact.tags', description: '' },
      { name: 'contact.recentContent', description: 'JSON of recent content items' },
      { name: 'contact.personalizedHooks', description: 'JSON of candidate opening sentences' },
      { name: 'contact.conflicts', description: 'JSON of conflict flags' },
      { name: 'listContext', description: 'Pre-formatted list pitch + context block' },
      { name: 'voiceContext', description: 'Pre-formatted voice description block (or "")' },
    ],
    outputSchema: {
      type: 'object',
      required: ['subject', 'body', 'hookSentenceUsed'],
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
        hookSentenceUsed: { type: 'string' },
      },
    },
    modelSlot: 'draft',
  });
}

export function registerDraftJob(registry) {
  registry.register('influencers.draft', async ({ job, ctx }) => {
    const { contactId, listId, channel, voiceContactId } = job.payload || {};
    const contact = await ctx.models.Contact.findById(contactId).lean();
    if (!contact) throw new Error(`contact ${contactId} not found`);

    let listContext = '(none)';
    if (listId) {
      const list = await ctx.models.ContactList.findById(listId).lean();
      if (list) {
        listContext =
          `Name: ${list.name}\n` +
          `Pitch: ${list.pitchSummary || '(none)'}\n` +
          `Notes: ${list.contextPrompt || '(none)'}`;
      }
    }

    let voiceContext = '(no specific voice — write in a neutral, direct first-person)';
    if (voiceContactId) {
      const voice = await ctx.models.Contact.findById(voiceContactId).lean();
      if (voice?.voiceProfile) {
        voiceContext =
          `Name: ${voice.name}\n` +
          `Voice description: ${voice.voiceProfile.voiceDescription || '(none)'}\n` +
          `Expertise: ${(voice.voiceProfile.expertiseTags || []).join(', ')}\n` +
          `Do NOT mention: ${(voice.voiceProfile.doNotMention || []).join(', ')}\n` +
          `Self-promo policy: ${voice.voiceProfile.selfPromoPolicy || 'never'}\n` +
          `Signature: ${voice.voiceProfile.signatureSnippet || '(none)'}`;
      }
    }

    const result = await ctx.agent.run({
      promptKey: DRAFT_PROMPT_KEY,
      context: { channel, contact, listContext, voiceContext },
      slot: 'draft',
      jobId: job._id,
      contactId: contact._id,
      budgetCapUsd: job.budget?.capUsd,
    });

    if (!result.parsed) {
      throw new Error('draft agent returned non-JSON output');
    }

    const draft = await ctx.models.OutreachDraft.create({
      contactId: contact._id,
      listId: listId || undefined,
      channel,
      subject: result.parsed.subject || '',
      body: result.parsed.body || '',
      hookSentenceUsed: result.parsed.hookSentenceUsed || '',
      voiceContactId: voiceContactId || undefined,
      modelUsed: result.model,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      sourceJobId: job._id,
      status: 'draft',
    });

    // Bump contact status if we composed a draft and the contact wasn't enriched yet
    if (contact.status === 'new' || contact.status === 'enriched') {
      await ctx.models.Contact.updateOne({ _id: contact._id }, { status: 'drafted' });
    }

    return {
      draftId: String(draft._id),
      costUsd: result.costUsd,
      model: result.model,
    };
  });
}
