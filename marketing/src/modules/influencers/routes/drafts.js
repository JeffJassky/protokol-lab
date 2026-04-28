import express from 'express';

export function buildDraftsRoutes(ctx) {
  const router = express.Router();
  const { OutreachDraft, Contact } = ctx.models;

  // POST /api/influencers/drafts  body: { contactId, listId?, channel, voiceContactId?, async? }
  // async=true (default): enqueue draft job, return jobId. Client polls.
  // async=false: run inline (useful for quick UX) and return draft synchronously.
  router.post('/', async (req, res, next) => {
    try {
      const { contactId, listId, channel, voiceContactId, async: useAsync = true, budgetCapUsd } = req.body || {};
      if (!contactId || !channel) return res.status(400).json({ error: 'contactId_and_channel_required' });
      const exists = await Contact.exists({ _id: contactId });
      if (!exists) return res.status(404).json({ error: 'contact_not_found' });
      const job = await ctx.worker.enqueue({
        type: 'influencers.draft',
        contactId,
        listId,
        budget: { capUsd: budgetCapUsd ?? ctx.config.budget.defaultPerJobUsd, spentUsd: 0 },
      });
      // payload separately because enqueue doesn't accept arbitrary fields yet
      job.payload = { contactId, listId, channel, voiceContactId };
      await job.save();

      if (useAsync) return res.status(202).json({ jobId: String(job._id) });

      // Inline: poll until done
      const draft = await waitForDraft(ctx, job._id, 30_000);
      if (!draft) return res.status(504).json({ error: 'draft_timeout', jobId: String(job._id) });
      res.json(draft);
    } catch (err) { next(err); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.contactId) filter.contactId = req.query.contactId;
      if (req.query.listId) filter.listId = req.query.listId;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.channel) filter.channel = req.query.channel;
      const drafts = await OutreachDraft.find(filter).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ drafts });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const draft = await OutreachDraft.findById(req.params.id).lean();
      if (!draft) return res.status(404).json({ error: 'not_found' });
      res.json(draft);
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { subject, body, hookSentenceUsed, replyNotes } = req.body || {};
      const update = {};
      if (subject !== undefined) update.subject = subject;
      if (body !== undefined) update.body = body;
      if (hookSentenceUsed !== undefined) update.hookSentenceUsed = hookSentenceUsed;
      if (replyNotes !== undefined) update.replyNotes = replyNotes;
      const draft = await OutreachDraft.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!draft) return res.status(404).json({ error: 'not_found' });
      res.json(draft);
    } catch (err) { next(err); }
  });

  router.post('/:id/approve', async (req, res, next) => {
    try {
      const draft = await OutreachDraft.findByIdAndUpdate(
        req.params.id,
        { status: 'approved', approvedAt: new Date() },
        { new: true }
      );
      if (!draft) return res.status(404).json({ error: 'not_found' });
      res.json(draft);
    } catch (err) { next(err); }
  });

  router.post('/:id/mark-sent', async (req, res, next) => {
    try {
      const draft = await OutreachDraft.findByIdAndUpdate(
        req.params.id,
        { status: 'sent', sentAt: new Date() },
        { new: true }
      );
      if (!draft) return res.status(404).json({ error: 'not_found' });
      // Also update Contact status
      await Contact.updateOne({ _id: draft.contactId }, { status: 'sent' });
      res.json(draft);
    } catch (err) { next(err); }
  });

  router.post('/:id/discard', async (req, res, next) => {
    try {
      const draft = await OutreachDraft.findByIdAndUpdate(
        req.params.id,
        { status: 'discarded' },
        { new: true }
      );
      if (!draft) return res.status(404).json({ error: 'not_found' });
      res.json(draft);
    } catch (err) { next(err); }
  });

  return router;
}

async function waitForDraft(ctx, jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await ctx.models.Job.findById(jobId).lean();
    if (job?.status === 'done' && job.result?.draftId) {
      return ctx.models.OutreachDraft.findById(job.result.draftId).lean();
    }
    if (job?.status === 'failed') throw new Error(job.error || 'draft_job_failed');
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
