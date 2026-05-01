import express from 'express';
import { runStreaming } from '../../../shared/claude/agent.js';
import { buildDraftMcpServer, ALL_TOOL_NAMES } from '../mcpTools.js';

// In-flight chat lock per opportunity. Concurrent messages on the same
// opp would corrupt the message order + race set_draft writes; we just
// 409 the second caller. One operator drafting one reply at a time.
const chatLocks = new Set();
function chatChannel(id) { return `reddit-chat-${id}`; }

function buildDraftSystemPrompt(opp) {
  const bucket = opp.triage?.bucket;
  const bucketGuidance = bucket === 'DIRECT_ASK'
    ? 'Bucket=DIRECT_ASK — the user is explicitly asking for an app/tool. Recommend Protokol directly.'
    : bucket === 'INDIRECT_PROBLEM'
    ? 'Bucket=INDIRECT_PROBLEM — user has a problem the app solves. Substance-first answer; mention the app as a brief footnote at most.'
    : bucket === 'TOPIC_ADJACENT'
    ? 'Bucket=TOPIC_ADJACENT — useful niche comment, no app mention.'
    : 'Bucket unknown — substance-first, no app mention unless clearly warranted.';

  return [
    'You help the operator iterate on a Reddit reply for a specific opportunity.',
    'You are in a multi-turn chat. Operator may ask for tone changes, length tweaks, edits — adjust accordingly.',
    '',
    'Workflow on the FIRST turn of a session:',
    '1. Call fetch_post_thread() to load the post.',
    '2. Call fetch_my_recent_comments() — these comments ARE the voice. Match phrasing, length, hedging, technical depth, capitalization, formatting. Do not invent a style; mirror what is there.',
    '3. Propose a draft. Call set_draft(body) to save it as the canonical reply.',
    '',
    'On subsequent turns:',
    '- The operator will ask for revisions. Apply them, then call set_draft(body) again with the updated full body.',
    '- Do not re-fetch comments unless the operator asks (they are cached for the day anyway).',
    '',
    bucketGuidance,
    '',
    'Style rules (hard):',
    '- Plain markdown only. Reddit-flavored. No fenced code unless quoting code.',
    '- No "As an AI" / "Hope this helps" / "Let me know if". Sound like the operator — terse, real, occasionally dry.',
    '- If recent comments are short, your draft is short. If they avoid bullet lists, you avoid bullet lists.',
    '- The product is Protokol (protokollab.com): an ADHD-friendly tracking app for GLP-1 patients. Macro/protein/calorie focus, not a pharmacology tool.',
  ].join('\n');
}

export function buildOpportunitiesRoutes(ctx) {
  const router = express.Router();
  const { EngagementOpportunity, Contact } = ctx.models;

  router.get('/', async (req, res, next) => {
    try {
      const filter = {};
      // Default the feed to actionable items: decision='pending' unless
      // the caller asks otherwise. Prevents tombstoned/passed/replied items
      // from cluttering the list.
      if (req.query.decision != null) {
        // Empty string = "any decision" (escape hatch). Otherwise CSV.
        if (req.query.decision !== '') {
          filter.decision = { $in: String(req.query.decision).split(',') };
        }
      } else {
        filter.decision = 'pending';
      }
      if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
      if (req.query.bucket) filter['triage.bucket'] = { $in: String(req.query.bucket).split(',') };
      if (req.query.subreddit) filter.subreddit = req.query.subreddit;
      if (req.query.subredditId) filter.subredditId = req.query.subredditId;
      if (req.query.authorContactId) filter.authorContactId = req.query.authorContactId;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      const [opportunities, total, counts] = await Promise.all([
        EngagementOpportunity.find(filter).sort({ postedAt: -1 }).skip(offset).limit(limit).lean(),
        EngagementOpportunity.countDocuments(filter),
        // Counters for the feed header so the user can trust nothing is lost.
        EngagementOpportunity.aggregate([
          { $group: { _id: '$decision', n: { $sum: 1 } } },
        ]),
      ]);
      const decisionCounts = Object.fromEntries(counts.map((c) => [c._id || 'pending', c.n]));
      res.json({ opportunities, total, limit, offset, decisionCounts });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findById(req.params.id).lean();
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const allowed = ['status', 'decisionNote'];
      const update = {};
      for (const k of allowed) if (req.body && k in req.body) update[k] = req.body[k];
      // Allow draft.body edits too — lets the user tweak the AI-composed reply
      if (req.body?.draftBody !== undefined) update['draft.body'] = req.body.draftBody;
      const opp = await EngagementOpportunity.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/triage', async (req, res, next) => {
    try {
      const exists = await EngagementOpportunity.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ error: 'not_found' });
      const job = await ctx.worker.enqueue({
        type: 'redditEngagement.triageOpportunity',
        opportunityId: req.params.id,
      });
      res.status(202).json({ jobId: String(job._id) });
    } catch (err) { next(err); }
  });

  // ──────────────────────────────────────────────────────────────────
  // PHASE 3 — chat-style drafting via claude subprocess.
  //
  // GET  /:id/chat/messages         → load persisted history
  // POST /:id/chat/messages         → append user msg, kick off agent (async), 202
  // GET  /:id/chat/stream           → SSE stream of agent events
  // POST /:id/chat/clear            → wipe messages + sessionId (start over)
  // ──────────────────────────────────────────────────────────────────

  router.get('/:id/chat/messages', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findById(req.params.id, { 'draft.messages': 1, 'draft.sessionId': 1, 'draft.body': 1 }).lean();
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json({
        messages: opp.draft?.messages || [],
        sessionId: opp.draft?.sessionId || null,
        draftBody: opp.draft?.body || '',
        inFlight: chatLocks.has(String(req.params.id)),
      });
    } catch (err) { next(err); }
  });

  router.get('/:id/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const channel = chatChannel(req.params.id);
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    // Heartbeat so proxies / browsers don't kill idle connections.
    const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
    const unsubscribe = ctx.sse.subscribe(channel, send);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  router.post('/:id/chat/clear', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        { $unset: { 'draft.messages': '', 'draft.sessionId': '' } },
        { returnDocument: 'after' }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      ctx.sse.emit(chatChannel(req.params.id), { type: 'cleared' });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.post('/:id/chat/messages', async (req, res, next) => {
    try {
      const oppId = String(req.params.id);
      const content = (req.body?.content || '').trim();
      if (!content) return res.status(400).json({ error: 'content_required' });
      if (chatLocks.has(oppId)) return res.status(409).json({ error: 'chat_in_flight' });

      const opp = await EngagementOpportunity.findById(oppId);
      if (!opp) return res.status(404).json({ error: 'not_found' });

      // Persist user turn synchronously so a reload picks it up
      // even if the agent crashes mid-flight.
      const userMsg = { role: 'user', content, ts: new Date() };
      opp.draft = opp.draft || {};
      opp.draft.messages = (opp.draft.messages || []).concat([userMsg]);
      await opp.save();

      const channel = chatChannel(oppId);
      ctx.sse.emit(channel, { type: 'user-message', ...userMsg });

      // Respond immediately; agent runs in the background and broadcasts.
      res.status(202).json({ accepted: true });

      chatLocks.add(oppId);
      const systemPrompt = buildDraftSystemPrompt(opp);
      const mcp = buildDraftMcpServer({ ctx, opportunityId: oppId });

      // Track tool calls + final assistant text to persist on done.
      const persistedTurnEvents = [];
      let finalAssistantText = '';

      runStreaming({
        userMessage: content,
        systemPrompt,
        resumeSessionId: opp.draft.sessionId || undefined,
        logger: ctx.logger,
        mcpServers: { redditDraft: mcp },
        allowedTools: ALL_TOOL_NAMES,
        onEvent: (evt) => {
          ctx.sse.emit(channel, evt);
          if (evt.type === 'tool-use') {
            persistedTurnEvents.push({
              role: 'tool_use',
              toolName: evt.name,
              toolUseId: evt.toolUseId,
              content: JSON.stringify(evt.input ?? {}),
              ts: new Date(),
            });
          } else if (evt.type === 'tool-result') {
            persistedTurnEvents.push({
              role: 'tool_result',
              toolName: evt.name,
              toolUseId: evt.toolUseId,
              isError: evt.isError,
              content: typeof evt.content === 'string' ? evt.content : JSON.stringify(evt.content ?? ''),
              ts: new Date(),
            });
          } else if (evt.type === 'done') {
            finalAssistantText = evt.finalText || '';
          }
        },
      })
        .then(async (summary) => {
          // Persist the full turn: tool calls in order + final assistant text.
          const updates = persistedTurnEvents.slice();
          if (finalAssistantText) {
            updates.push({ role: 'assistant', content: finalAssistantText, ts: new Date() });
          }
          if (updates.length || summary.sessionId) {
            await EngagementOpportunity.findByIdAndUpdate(oppId, {
              $push: { 'draft.messages': { $each: updates } },
              $set: { 'draft.sessionId': summary.sessionId },
            });
          }
          ctx.logger?.info?.(
            { oppId, durationMs: summary.durationMs, costUsd: summary.costUsd, sessionId: summary.sessionId },
            '[chat] turn complete'
          );
        })
        .catch((err) => {
          ctx.logger?.error?.({ err: err.message, oppId }, '[chat] agent run failed');
          ctx.sse.emit(channel, { type: 'error', message: err.message });
        })
        .finally(() => {
          chatLocks.delete(oppId);
        });
    } catch (err) {
      // If we already responded 202 we can't error-respond; just log.
      if (!res.headersSent) next(err);
      else ctx.logger?.error?.({ err: err.message }, '[chat] post-response failure');
    }
  });

  // User-decision endpoints. All set `decision` so the row stops appearing
  // in the default feed query AND so future scans hit a tombstone.
  router.post('/:id/pass', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        { decision: 'passed', decidedAt: new Date(), decisionNote: req.body?.note || null },
        { returnDocument: 'after' }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/save', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        { decision: 'saved', decidedAt: new Date(), decisionNote: req.body?.note || null },
        { returnDocument: 'after' }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/unpass', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        { decision: 'pending', decidedAt: null, decisionNote: null },
        { returnDocument: 'after' }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/dismiss', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        { decision: 'dismissed', decidedAt: new Date(), status: 'low-fit-archived' },
        { returnDocument: 'after' }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/mark-posted', async (req, res, next) => {
    try {
      const { commentUrl } = req.body || {};
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        {
          status: 'posted',
          decision: 'replied',
          decidedAt: new Date(),
          postedAtUs: new Date(),
          postedCommentUrl: commentUrl || null,
        },
        { returnDocument: 'after' }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/link-author-to-contact', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findById(req.params.id);
      if (!opp) return res.status(404).json({ error: 'not_found' });
      let contactId = req.body?.contactId;
      if (!contactId && opp.authorUsername) {
        const handle = opp.authorUsername.toLowerCase();
        let c = await Contact.findOne({ presences: { $elemMatch: { platform: 'reddit', handle } } });
        if (!c) {
          c = await Contact.create({
            name: opp.authorUsername,
            relationship: 'unknown',
            presences: [{ platform: 'reddit', handle, url: `https://reddit.com/user/${opp.authorUsername}` }],
            source: {
              type: 'reddit_engagement_link',
              note: `linked from opportunity ${opp._id}`,
              linkedFromOpportunityId: opp._id,
              importedAt: new Date(),
            },
          });
        }
        contactId = c._id;
      }
      opp.authorContactId = contactId;
      await opp.save();
      res.json(opp);
    } catch (err) { next(err); }
  });

  return router;
}
