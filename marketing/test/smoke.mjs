// Smoke test: boots an in-memory mongo, mounts the suite into a bare
// express app with a no-op auth middleware, exercises the API end to end.
//
// Run from /marketing:
//   npm run test:smoke

import express from 'express';
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMarketingAdmin } from '../src/index.js';

function fetchJson(server, method, path, body) {
  const port = server.address().port;
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch {}
          resolve({ status: res.statusCode, body: buf, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) {
    failed++;
    if (detail !== undefined) console.log('   ', typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200));
  }
}

async function main() {
  const mem = await MongoMemoryServer.create();
  const mongoUri = mem.getUri();

  // Stubbed LLM adapter matching the Claude Agent SDK contract:
  // adapter.run({...}) is an async generator that yields normalized
  // events ({ type: 'text' | 'tool_call' | 'done' | ... }).
  //
  // We discriminate on the rendered systemPrompt to pick canned
  // responses for each prompt key. The research-enrich path also
  // exercises the MCP tool path by invoking save_finding directly so
  // the runner sees a tool_call event.
  const stubLlm = {
    name: 'stub',
    async *run({ systemPrompt, userPrompt, allowedBuiltins, mcpTools = [], toolCtx, model }) {
      if (/deciding whether a Reddit thread/i.test(systemPrompt)) {
        yield {
          type: 'text',
          text: JSON.stringify({
            fit: 'high',
            reasoning: 'Direct technical question, low comment count, our persona has BPC-157 stack experience.',
            valueAngle: 'Share the sequencing protocol we actually used and the specific marker that told us when to add TB-500.',
            risks: ['avoid medical advice framing'],
          }),
        };
        yield { type: 'done', costUsd: 0.0001, tokensIn: 200, tokensOut: 80, stoppedReason: 'end_turn', lastText: undefined };
        return;
      }
      if (/marketing data classifier/i.test(systemPrompt)) {
        yield {
          type: 'text',
          text: JSON.stringify({
            primaryRole: 'podcaster',
            roles: ['podcaster', 'newsletter-author'],
            suggestedTags: ['glp1', 'biohacking'],
            confidence: 0.95,
            reasoning: 'Strong signal from podcast + substack presences with audience >= 10k.',
          }),
        };
        yield { type: 'done', costUsd: 0.0005, tokensIn: 200, tokensOut: 80, stoppedReason: 'end_turn' };
        return;
      }
      if (/personalized outreach/i.test(systemPrompt)) {
        yield {
          type: 'text',
          text: JSON.stringify({
            subject: 'your MOTS-c take',
            body:
              "Your point about MOTS-c being wasted on people without mitochondrial damage really stuck with me — most coverage skips the precondition entirely. We just shipped a tracker for peptide protocols and would love your read on the biomarker selection.",
            hookSentenceUsed:
              'Your point about MOTS-c being wasted on people without mitochondrial damage really stuck with me — most coverage skips the precondition entirely.',
          }),
        };
        yield { type: 'done', costUsd: 0.001, tokensIn: 200, tokensOut: 80, stoppedReason: 'end_turn' };
        return;
      }
      if (/marketing researcher enriching/i.test(systemPrompt)) {
        // Multi-turn loop simulation: emit some text, then call
        // save_finding through the MCP tool list, then emit a final summary.
        yield { type: 'text', text: 'Looking up recent content.' };
        const saveFinding = mcpTools.find((t) => t.name === 'save_finding');
        if (saveFinding) {
          const input = {
            kind: 'distinctive_point',
            summary: 'Argued MOTS-c is wasted on people without mitochondrial damage.',
            sourceUrl: 'https://example.com/post',
          };
          let output;
          try {
            output = await saveFinding.execute(input, toolCtx);
          } catch (err) {
            output = { error: err.message };
          }
          yield { type: 'tool_call', name: 'save_finding', input, output };
        }
        yield { type: 'text', text: 'Found one strong distinctive point about MOTS-c indications.' };
        yield {
          type: 'done',
          costUsd: 0.003,
          tokensIn: 400,
          tokensOut: 150,
          stoppedReason: 'end_turn',
          lastText: 'Found one strong distinctive point about MOTS-c indications.',
        };
        return;
      }
      // Reddit triage — batch form (used by scan).
      if (/Classify each Reddit thread/i.test(systemPrompt)) {
        yield {
          type: 'text',
          text: JSON.stringify({
            classifications: [
              { i: 1, bucket: 'DIRECT_ASK', because: 'asking how to stack two peptides' },
            ],
          }),
        };
        yield { type: 'done', costUsd: 0.0001, tokensIn: 100, tokensOut: 50, stoppedReason: 'end_turn' };
        return;
      }
      // Reddit triage — single-thread form (used by manual /triage).
      if (/Classify a Reddit thread/i.test(systemPrompt)) {
        yield {
          type: 'text',
          text: JSON.stringify({
            bucket: 'DIRECT_ASK',
            because: 'asking how to stack two peptides',
          }),
        };
        yield { type: 'done', costUsd: 0.0001, tokensIn: 100, tokensOut: 50, stoppedReason: 'end_turn' };
        return;
      }
      // (Reddit reply drafting is no longer driven by the prompt registry —
      // it runs through the local claude subprocess, outside this stub LLM.)
      // Fallback
      yield { type: 'text', text: '(stub default)' };
      yield { type: 'done', costUsd: 0, tokensIn: 0, tokensOut: 0, stoppedReason: 'end_turn' };
    },
  };

  const passthroughAuth = (_req, _res, next) => next();
  const marketing = createMarketingAdmin({
    mongoUri,
    basePath: '/admin/marketing',
    requireAuth: passthroughAuth,
    logger: { info() {}, warn() {}, error() {} }, // quiet
    llm: stubLlm,
    worker: { concurrency: 2, pollIntervalMs: 100, enabled: true },
  });

  const app = express();
  app.use('/admin/marketing', marketing.router);
  await marketing.start();

  const server = app.listen(0);
  const base = '/admin/marketing';

  // === Phase 0 mount checks ===
  let r = await fetchJson(server, 'GET', `${base}/api/health`);
  check('health 200', r.status === 200 && r.json?.status === 'ok', r.body);

  r = await fetchJson(server, 'GET', `${base}/api/prompts`);
  check('prompts list', r.status === 200 && Array.isArray(r.json?.prompts), r.body);

  r = await fetchJson(server, 'GET', `${base}/api/usage/summary`);
  check('usage summary', r.status === 200 && typeof r.json?.monthlyCapUsd === 'number', r.body);

  r = await fetchJson(server, 'GET', `${base}/`);
  check('spa shell', r.status === 200 && r.body.includes('<div id="app">'), r.body.slice(0, 100));

  r = await fetchJson(server, 'GET', `${base}/contacts`);
  check('spa fallback for sub-route', r.status === 200 && r.body.includes('<div id="app">'), r.body.slice(0, 100));

  r = await fetchJson(server, 'GET', `${base}/api/nope`);
  check('unknown api 404', r.status === 404, r.body);

  // === Phase 1 contacts CRUD ===
  r = await fetchJson(server, 'GET', `${base}/api/contacts`);
  check('contacts list empty', r.status === 200 && r.json?.total === 0, r.body);

  r = await fetchJson(server, 'POST', `${base}/api/contacts`, {
    name: 'Dave Knapp',
    relationship: 'target',
    classification: 'creator',
    primaryRole: 'podcaster',
    roles: ['podcaster', 'newsletter-author'],
    tags: ['glp1'],
    presences: [
      { platform: 'podcast', handle: 'OnThePen', url: 'https://onthepen.com', audienceSize: 100000, audienceSizeRaw: '~100k' },
      { platform: 'substack', handle: 'onthepen', url: 'https://onthepen.substack.com', audienceSize: 20000, audienceSizeRaw: '10k-30k' },
    ],
    contactChannels: [
      { type: 'email', value: 'dave@example.com', confidence: 'guessed' },
    ],
    conflicts: [],
    status: 'new',
  });
  check('create contact', r.status === 201 && r.json?._id, r.body);
  const contactId = r.json?._id;

  // Handle normalization (presences[].handle should be lowercased on save)
  check(
    'presence handle normalized',
    r.json?.presences?.[0]?.handle === 'onthepen',
    r.json?.presences?.[0]?.handle
  );

  r = await fetchJson(server, 'GET', `${base}/api/contacts/${contactId}`);
  check('get contact', r.status === 200 && r.json?.name === 'Dave Knapp', r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts?q=Knapp`);
  check('text search', r.status === 200 && r.json?.contacts?.length === 1, r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts?platform=substack`);
  check('platform filter', r.status === 200 && r.json?.contacts?.length === 1, r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts?platform=tiktok`);
  check('platform filter no-match', r.status === 200 && r.json?.contacts?.length === 0, r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts?relationship=self`);
  check('relationship filter empty', r.status === 200 && r.json?.contacts?.length === 0, r.body);

  // Update — flip relationship to self and add a voiceProfile (simulates building "us" record)
  r = await fetchJson(server, 'PATCH', `${base}/api/contacts/${contactId}`, {
    name: 'Jeff (test voice)',
    relationship: 'self',
    voiceProfile: {
      active: true,
      voiceDescription: 'Founder, builds Body Optimizer.',
      expertiseTags: ['glp1', 'quantified-self'],
      doNotMention: ['competitor'],
      selfPromoPolicy: 'soft-link-when-relevant',
    },
  });
  check('update contact + voice', r.status === 200 && r.json?.relationship === 'self' && r.json?.voiceProfile?.active === true, r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts/voices`);
  check('voices shortcut returns voice', r.status === 200 && r.json?.voices?.length === 1, r.body);

  // find-or-create-by-presence — should hit existing contact
  r = await fetchJson(server, 'POST', `${base}/api/contacts/find-or-create-by-presence`, {
    platform: 'substack',
    handle: 'OnThePen', // case mismatch
  });
  check(
    'find-by-presence existing',
    r.status === 200 && r.json?.contact?._id === contactId && r.json?.created === false,
    r.body
  );

  // find-or-create-by-presence — new
  r = await fetchJson(server, 'POST', `${base}/api/contacts/find-or-create-by-presence`, {
    platform: 'reddit',
    handle: 'u/SomeRandomRedditor',
    defaults: { name: 'SomeRandomRedditor' },
  });
  check(
    'find-by-presence creates stub',
    r.status === 200 && r.json?.created === true && r.json?.contact?.relationship === 'unknown',
    r.body
  );

  // Classify — Phase 1 returns 202 placeholder
  r = await fetchJson(server, 'POST', `${base}/api/contacts/${contactId}/classify`);
  check('classify enqueues placeholder', r.status === 202 && r.json?.enqueued === true, r.body);

  // === Phase 1 lists CRUD ===
  r = await fetchJson(server, 'POST', `${base}/api/contact-lists`, {
    name: 'GLP-1 mid-tier podcast hosts',
    pitchSummary: 'Body Optimizer for GLP-1 trackers',
    contextPrompt: 'Audience: podcast hosts with 10k-100k listeners on GLP-1 / peptide topics.',
  });
  check('create list', r.status === 201 && r.json?._id, r.body);
  const listId = r.json?._id;

  r = await fetchJson(server, 'GET', `${base}/api/contact-lists`);
  check('list lists', r.status === 200 && r.json?.lists?.length === 1, r.body);

  r = await fetchJson(server, 'POST', `${base}/api/contact-lists/${listId}/contacts`, {
    contactIds: [contactId],
  });
  check('add list members', r.status === 200 && r.json?.added === 1, r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts?listId=${listId}`);
  check('list filter scopes contacts', r.status === 200 && r.json?.total === 1, r.body);

  r = await fetchJson(server, 'DELETE', `${base}/api/contact-lists/${listId}/contacts/${contactId}`);
  check('remove member', r.status === 200 && r.json?.removed === true, r.body);

  r = await fetchJson(server, 'DELETE', `${base}/api/contact-lists/${listId}`);
  check('delete list', r.status === 200 && r.json?.deleted === true, r.body);

  // === Phase 2 prompt CRUD ===
  r = await fetchJson(server, 'GET', `${base}/api/prompts`);
  check('prompts list (post-seed)', r.status === 200 && r.json?.prompts?.length >= 1, r.body);
  const promptKey = r.json?.prompts?.[0]?.key;

  r = await fetchJson(server, 'GET', `${base}/api/prompts/${promptKey}`);
  check('prompt get active', r.status === 200 && r.json?.version === 1, r.body);
  const v1Body = r.json?.body;

  r = await fetchJson(server, 'PATCH', `${base}/api/prompts/${promptKey}`, {
    body: v1Body + '\n\n[edited]',
    editedBy: 'smoke-test',
  });
  check('prompt PATCH creates v2', r.status === 200 && r.json?.version === 2 && r.json?.isActive, r.body);

  r = await fetchJson(server, 'GET', `${base}/api/prompts/${promptKey}/history`);
  check('prompt history shows both versions', r.status === 200 && r.json?.versions?.length === 2, r.body);

  r = await fetchJson(server, 'POST', `${base}/api/prompts/${promptKey}/restore-default`);
  check('prompt restore-default creates v3', r.status === 200 && r.json?.version === 3, r.body);
  check('restored body matches default', r.json?.body === r.json?.defaultBody);

  r = await fetchJson(server, 'POST', `${base}/api/prompts/${promptKey}/activate-version`, { version: 1 });
  check('activate v1 → creates v4 with v1 body', r.status === 200 && r.json?.version === 4 && r.json?.body === v1Body, r.body);

  r = await fetchJson(server, 'POST', `${base}/api/prompts/${promptKey}/test`, {
    context: { contact: { name: 'TestPerson', niche: 'GLP-1 podcast host' } },
    useLlm: false,
  });
  check('prompt /test renders', r.status === 200 && r.json?.rendered?.includes('TestPerson'), r.body);

  r = await fetchJson(server, 'POST', `${base}/api/prompts/${promptKey}/test`, {
    context: { contact: { name: 'X' } },
    useLlm: true,
  });
  check('prompt /test runs via LLM', r.status === 200 && r.json?.output?.includes('podcaster'), r.body);

  // === Phase 3 classify job runs ===
  // Recreate a contact for classify (we deleted Dave earlier in the flow — wait we haven't yet)
  r = await fetchJson(server, 'POST', `${base}/api/contacts/${contactId}/classify`);
  check('classify enqueues real job', r.status === 202 && r.json?.jobId, r.body);
  const jobId = r.json?.jobId;

  // Poll for completion
  const jobDone = await pollJobDone(server, contactId, jobId);
  if (jobDone?.status !== 'done') {
    console.log('FAILED JOB ERROR:', jobDone?.error);
    console.log('FAILED JOB FULL:', JSON.stringify(jobDone, null, 2));
  }
  check('classify job completed', jobDone?.status === 'done', jobDone?.error);
  check('classify suggestion auto-applied', jobDone?.result?.autoApplied === true, jobDone?.result);
  check(
    'classify cost tracked',
    typeof jobDone?.result?.costUsd === 'number' && jobDone?.result?.costUsd > 0,
    jobDone?.result?.costUsd
  );

  r = await fetchJson(server, 'GET', `${base}/api/contacts/${contactId}`);
  check(
    'classify mutated contact roles',
    r.status === 200 && r.json?.roles?.includes('podcaster'),
    r.json?.roles
  );
  check(
    'classify mutated contact tags',
    r.json?.tags?.includes('biohacking'),
    r.json?.tags
  );

  r = await fetchJson(server, 'GET', `${base}/api/usage/summary`);
  check('usage summary reflects classify spend', r.status === 200 && r.json?.monthlyUsd > 0, r.body);

  // === Phase 4 research agent (tool-calling loop) ===
  r = await fetchJson(server, 'GET', `${base}/api/health`);
  check(
    'research tools registered (custom MCP set; WebSearch/WebFetch are SDK builtins)',
    r.status === 200 &&
      r.json?.tools?.includes('rss_fetch') &&
      r.json?.tools?.includes('save_finding') &&
      r.json?.tools?.includes('scrape_contact_page'),
    r.json?.tools
  );
  check(
    'enrich prompt registered',
    r.json?.prompts?.includes('influencers.enrich'),
    r.json?.prompts
  );
  check(
    'research handler registered',
    r.json?.worker?.handlers?.includes('influencers.research'),
    r.json?.worker?.handlers
  );

  r = await fetchJson(server, 'POST', `${base}/api/influencers/research/jobs`, { contactId, budgetCapUsd: 0.5 });
  check('research enqueued', r.status === 202 && r.json?.jobId, r.body);
  const researchJobId = r.json?.jobId;

  const researchDone = await pollJobDone(server, contactId, researchJobId, 8000);
  if (researchDone?.status !== 'done') {
    console.log('RESEARCH JOB ERROR:', researchDone?.error);
    console.log('RESEARCH JOB FULL:', JSON.stringify(researchDone, null, 2));
  }
  check('research job completed', researchDone?.status === 'done', researchDone?.error);
  check(
    'research saved at least one finding',
    Array.isArray(researchDone?.result?.findings) === false /* findings live on job, not result */ ||
      researchDone?.result?.findingsCount >= 1,
    researchDone?.result
  );
  check(
    'research finished after expected iterations',
    researchDone?.result?.iterations === 2,
    researchDone?.result?.iterations
  );
  check(
    'research summary captured',
    typeof researchDone?.result?.text === 'string' && researchDone.result.text.includes('MOTS-c'),
    researchDone?.result?.text
  );

  // Findings should have been persisted into job.result.findings (via save_finding)
  r = await fetchJson(server, 'GET', `${base}/api/influencers/research/jobs/${researchJobId}`);
  check(
    'job.result.findings populated by save_finding tool',
    r.status === 200 && Array.isArray(r.json?.result?.findings) && r.json.result.findings.length === 1,
    r.json?.result
  );

  // Inspect contact post-research before later phases mutate status further
  r = await fetchJson(server, 'GET', `${base}/api/contacts/${contactId}`);
  check('contact enrichmentSummary set', r.status === 200 && r.json?.enrichmentSummary?.includes('MOTS-c'), r.json?.enrichmentSummary);
  check('contact personalizedHooks populated', Array.isArray(r.json?.personalizedHooks) && r.json.personalizedHooks.length === 1, r.json?.personalizedHooks);
  check('contact status moved to enriched', r.json?.status === 'enriched', r.json?.status);
  check('contact lastResearchedAt set', !!r.json?.lastResearchedAt, r.json?.lastResearchedAt);

  // === Phase 6 draft agent ===
  r = await fetchJson(server, 'GET', `${base}/api/health`);
  check(
    'draft prompt + handler registered',
    r.json?.prompts?.includes('influencers.draft') &&
      r.json?.worker?.handlers?.includes('influencers.draft'),
    { prompts: r.json?.prompts, handlers: r.json?.worker?.handlers }
  );

  r = await fetchJson(server, 'POST', `${base}/api/influencers/drafts`, {
    contactId,
    channel: 'email',
    async: true,
  });
  check('draft enqueued', r.status === 202 && r.json?.jobId, r.body);
  const draftJobId = r.json?.jobId;

  // Poll job for completion + look up the draft it produced
  let draftRecord = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const job = await fetchJson(server, 'GET', `${base}/api/contacts/${contactId}/jobs`);
    const j = (job.json?.jobs || []).find((x) => String(x._id) === String(draftJobId));
    if (j?.status === 'done' && j.result?.draftId) {
      const dr = await fetchJson(server, 'GET', `${base}/api/influencers/drafts/${j.result.draftId}`);
      draftRecord = dr.json;
      break;
    }
    if (j?.status === 'failed') {
      console.log('DRAFT JOB FAIL:', j.error);
      break;
    }
  }
  check('draft job completed and produced a draft', draftRecord && draftRecord._id, draftRecord);
  check('draft has subject + body + hook', draftRecord?.subject && draftRecord?.body && draftRecord?.hookSentenceUsed, draftRecord);
  check('draft references the personalized hook', draftRecord?.body?.includes('MOTS-c'), draftRecord?.body);

  // Edit + lifecycle
  r = await fetchJson(server, 'PATCH', `${base}/api/influencers/drafts/${draftRecord._id}`, {
    body: draftRecord.body + '\n\n— edited by smoke',
  });
  check('draft edit', r.status === 200 && r.json?.body?.includes('edited by smoke'), r.body);

  r = await fetchJson(server, 'POST', `${base}/api/influencers/drafts/${draftRecord._id}/approve`);
  check('draft approve', r.status === 200 && r.json?.status === 'approved', r.body);

  r = await fetchJson(server, 'POST', `${base}/api/influencers/drafts/${draftRecord._id}/mark-sent`);
  check('draft mark-sent', r.status === 200 && r.json?.status === 'sent', r.body);

  r = await fetchJson(server, 'GET', `${base}/api/contacts/${contactId}`);
  check('contact status moved to sent', r.json?.status === 'sent', r.json?.status);

  // Cleanup contact
  r = await fetchJson(server, 'DELETE', `${base}/api/contacts/${contactId}`);
  check('delete contact', r.status === 200 && r.json?.deleted === true, r.body);

  // === Phase 7 + 8 — Reddit Engagement: scan, triage, draft ===
  // Register a stub reddit_subreddit_feed tool on the live ctx so the
  // scan job can run without a real Reddit connection.
  const stubFeed = {
    name: 'reddit_subreddit_feed',
    description: 'stub',
    input_schema: { type: 'object', properties: { subreddit: { type: 'string' } }, required: ['subreddit'] },
    async execute({ subreddit }) {
      return {
        subreddit,
        count: 1,
        posts: [
          {
            id: 'stubpost1',
            title: 'How do you stack BPC-157 with TB-500? questions about timing',
            author: 'curiousLifter42',
            score: 25,
            numComments: 4,
            permalink: 'https://reddit.com/r/' + subreddit + '/comments/stubpost1/',
            url: 'https://reddit.com/r/' + subreddit + '/comments/stubpost1/',
            createdAt: new Date().toISOString(),
            selftextExcerpt: 'I have been running BPC-157 for two weeks and want to add TB-500 — should I overlap or sequence them?',
          },
        ],
      };
    },
  };
  marketing.ctx.tools.register(stubFeed);

  // Create a voice Contact (relationship='self' w/ active voiceProfile)
  r = await fetchJson(server, 'POST', `${base}/api/contacts`, {
    name: 'Founder voice',
    relationship: 'self',
    voiceProfile: {
      active: true,
      voiceDescription: 'BPC-157/peptide stack experience; technical, no-bullshit. Skeptical of unproven claims.',
      expertiseTags: ['peptides', 'recovery'],
      doNotMention: ['competitor'],
      selfPromoPolicy: 'never',
    },
    presences: [{ platform: 'reddit', handle: 'founder_voice', isPrimary: true }],
  });
  check('voice contact created', r.status === 201, r.body);
  const voiceContactId = r.json?._id;

  // Create a monitored subreddit. The default prefilter requires ≥2
  // matched keywords; the smoke fixture only provides 'bpc-157', so
  // override that floor or the lone match gets filtered out before the
  // opportunity is recorded.
  r = await fetchJson(server, 'POST', `${base}/api/reddit-engagement/subreddits`, {
    subreddit: 'peptides',
    voiceContactId,
    scanRules: {
      keywords: ['bpc-157'],
      maxPostAgeHours: 72,
      minPostScore: 1,
      prefilter: { minKeywordMatches: 1 },
    },
    scanIntervalMinutes: 30,
  });
  check('subreddit monitored', r.status === 201 && r.json?._id, r.body);
  const subId = r.json?._id;

  // Trigger an immediate scan
  r = await fetchJson(server, 'POST', `${base}/api/reddit-engagement/subreddits/${subId}/scan-now`);
  check('scan-now enqueued', r.status === 202 && r.json?.jobId, r.body);

  // Poll for opportunity
  let foundOpp = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const opps = await fetchJson(server, 'GET', `${base}/api/reddit-engagement/opportunities?subredditId=${subId}`);
    if ((opps.json?.opportunities || []).length > 0) {
      foundOpp = opps.json.opportunities[0];
      break;
    }
  }
  check('scan produced an opportunity', !!foundOpp, foundOpp);
  check(
    'opportunity matched keywords',
    Array.isArray(foundOpp?.matchedKeywords) && foundOpp.matchedKeywords.includes('bpc-157'),
    foundOpp?.matchedKeywords
  );
  // Author auto-link was removed from scan — it was polluting Contacts
  // with thousands of random reddit users. The link is now opt-in via
  // POST /opportunities/:id/link-author-to-contact.
  check(
    'scan does NOT auto-create author Contact',
    !foundOpp?.authorContactId,
    foundOpp?.authorContactId
  );

  // Triage the opportunity. Drafting is no longer auto-enqueued after
  // triage (2026-04-30) — drafting moved to an interactive chat-style
  // flow backed by a local claude subprocess, which the smoke test
  // doesn't exercise. Verify only that triage classifies the post.
  r = await fetchJson(server, 'POST', `${base}/api/reddit-engagement/opportunities/${foundOpp._id}/triage`);
  check('triage enqueued', r.status === 202 && r.json?.jobId, r.body);

  // Wait for triage to land — bucket assigned + status=triaged or SKIP-tombstoned.
  let postOp = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const u = await fetchJson(server, 'GET', `${base}/api/reddit-engagement/opportunities/${foundOpp._id}`);
    if (u.json?.triage?.bucket || ['low-fit-archived', 'dismissed'].includes(u.json?.status)) {
      postOp = u.json;
      break;
    }
  }
  check(
    'triage classified opportunity',
    postOp && (postOp.triage?.bucket || postOp.status === 'low-fit-archived'),
    { status: postOp?.status, bucket: postOp?.triage?.bucket }
  );
  // If non-SKIP, status should be 'triaged' (drafted only after the chat
  // agent calls set_draft, which this test doesn't drive).
  if (postOp?.triage?.bucket && postOp.triage.bucket !== 'SKIP') {
    check(
      'opportunity status triaged (drafts are now manual)',
      postOp.status === 'triaged',
      postOp.status
    );
    check(
      'no draft body present (drafting is interactive)',
      !postOp.draft?.body,
      postOp.draft?.body?.slice(0, 80)
    );
  }

  // Smoke-check the chat history endpoint — should exist and return
  // empty state for an opportunity that's never been chat-drafted.
  r = await fetchJson(server, 'GET', `${base}/api/reddit-engagement/opportunities/${foundOpp._id}/chat/messages`);
  check(
    'chat messages endpoint returns empty initial state',
    r.status === 200 && Array.isArray(r.json?.messages) && r.json.messages.length === 0,
    r.body
  );

  // Mark posted
  r = await fetchJson(
    server,
    'POST',
    `${base}/api/reddit-engagement/opportunities/${foundOpp._id}/mark-posted`,
    { commentUrl: 'https://reddit.com/r/peptides/comments/stubpost1/_/abc123' }
  );
  check('mark-posted', r.status === 200 && r.json?.status === 'posted', r.body);

  // Cleanup
  await fetchJson(server, 'DELETE', `${base}/api/reddit-engagement/subreddits/${subId}`);
  await fetchJson(server, 'DELETE', `${base}/api/contacts/${voiceContactId}`);

  // === Tear down ===
  await new Promise((res) => server.close(res));
  await marketing.stop();
  await mem.stop();

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

async function pollJobDone(server, contactId, jobId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetchJson(server, 'GET', `/admin/marketing/api/contacts/${contactId}/jobs`);
    const job = (r.json?.jobs || []).find((j) => String(j._id) === String(jobId));
    if (job && (job.status === 'done' || job.status === 'failed')) return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

main().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
