import express from 'express';

export function buildResearchRoutes(ctx) {
  const router = express.Router();
  const { Job } = ctx.models;

  // POST /api/influencers/research/jobs  body: { contactId, listId?, budgetCapUsd? }
  router.post('/jobs', async (req, res, next) => {
    try {
      const { contactId, listId, budgetCapUsd } = req.body || {};
      if (!contactId) return res.status(400).json({ error: 'contactId_required' });
      const exists = await ctx.models.Contact.exists({ _id: contactId });
      if (!exists) return res.status(404).json({ error: 'contact_not_found' });
      const job = await ctx.worker.enqueue({
        type: 'influencers.research',
        contactId,
        listId,
        budget: { capUsd: budgetCapUsd ?? ctx.config.budget.defaultPerJobUsd, spentUsd: 0 },
      });
      res.status(202).json({ jobId: String(job._id), status: job.status });
    } catch (err) { next(err); }
  });

  // POST /api/influencers/research/jobs/bulk  body: { listId | contactIds[] }
  router.post('/jobs/bulk', async (req, res, next) => {
    try {
      const { listId, contactIds, budgetCapUsd } = req.body || {};
      let ids = Array.isArray(contactIds) ? contactIds : null;
      if (!ids && listId) {
        const contacts = await ctx.models.Contact.find({ listIds: listId }, { _id: 1 }).lean();
        ids = contacts.map((c) => String(c._id));
      }
      if (!ids || ids.length === 0) return res.status(400).json({ error: 'no_contacts' });
      const jobs = [];
      for (const id of ids) {
        const job = await ctx.worker.enqueue({
          type: 'influencers.research',
          contactId: id,
          listId,
          budget: { capUsd: budgetCapUsd ?? ctx.config.budget.defaultPerJobUsd, spentUsd: 0 },
        });
        jobs.push(String(job._id));
      }
      res.status(202).json({ enqueued: jobs.length, jobIds: jobs });
    } catch (err) { next(err); }
  });

  router.get('/jobs', async (req, res, next) => {
    try {
      const filter = { type: 'influencers.research' };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.contactId) filter.contactId = req.query.contactId;
      const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ jobs });
    } catch (err) { next(err); }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await Job.findById(req.params.id).lean();
      if (!job) return res.status(404).json({ error: 'not_found' });
      res.json(job);
    } catch (err) { next(err); }
  });

  // SSE stream of tool-call events for a research job. Client subscribes
  // after enqueue; replays nothing on reconnect — clients should refetch
  // job state to fill gaps.
  router.get('/jobs/:id/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const channel = `research-job-${req.params.id}`;
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const unsubscribe = ctx.sse.subscribe(channel, send);
    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });

  router.post('/jobs/:id/cancel', async (req, res, next) => {
    try {
      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ error: 'not_found' });
      if (job.status === 'queued') {
        job.status = 'cancelled';
        job.finishedAt = new Date();
        await job.save();
        return res.json({ cancelled: true });
      }
      // Running jobs can't be hard-cancelled in v1 (cooperative cancel
      // would require threading a token through the agent loop). Mark
      // with a flag the loop checks at next iteration in Phase 9.
      res.json({ cancelled: false, reason: 'job_already_running' });
    } catch (err) { next(err); }
  });

  return router;
}
