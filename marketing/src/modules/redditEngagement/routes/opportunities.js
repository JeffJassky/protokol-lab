import express from 'express';

export function buildOpportunitiesRoutes(ctx) {
  const router = express.Router();
  const { EngagementOpportunity, Contact } = ctx.models;

  router.get('/', async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
      if (req.query.fit) filter['triage.fit'] = { $in: String(req.query.fit).split(',') };
      if (req.query.subreddit) filter.subreddit = req.query.subreddit;
      if (req.query.subredditId) filter.subredditId = req.query.subredditId;
      if (req.query.authorContactId) filter.authorContactId = req.query.authorContactId;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      const [opportunities, total] = await Promise.all([
        EngagementOpportunity.find(filter).sort({ postedAt: -1 }).skip(offset).limit(limit).lean(),
        EngagementOpportunity.countDocuments(filter),
      ]);
      res.json({ opportunities, total, limit, offset });
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
      const allowed = ['reviewerNotes', 'status'];
      const update = {};
      for (const k of allowed) if (req.body && k in req.body) update[k] = req.body[k];
      // Allow draft.body edits too — lets the user tweak the AI-composed reply
      if (req.body?.draftBody !== undefined) update['draft.body'] = req.body.draftBody;
      const opp = await EngagementOpportunity.findByIdAndUpdate(req.params.id, update, { new: true });
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

  router.post('/:id/draft', async (req, res, next) => {
    try {
      const exists = await EngagementOpportunity.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ error: 'not_found' });
      const job = await ctx.worker.enqueue({
        type: 'redditEngagement.draftReply',
        opportunityId: req.params.id,
        payload: { steeringNote: req.body?.steeringNote },
      });
      res.status(202).json({ jobId: String(job._id) });
    } catch (err) { next(err); }
  });

  router.post('/:id/dismiss', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findByIdAndUpdate(
        req.params.id,
        { status: 'dismissed' },
        { new: true }
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
          postedAtUs: new Date(),
          postedCommentUrl: commentUrl || null,
          postedCommentId: commentUrl ? extractCommentId(commentUrl) : null,
        },
        { new: true }
      );
      if (!opp) return res.status(404).json({ error: 'not_found' });
      res.json(opp);
    } catch (err) { next(err); }
  });

  router.post('/:id/refresh-performance', async (req, res, next) => {
    try {
      const opp = await EngagementOpportunity.findById(req.params.id);
      if (!opp) return res.status(404).json({ error: 'not_found' });
      if (!opp.postedCommentId) return res.json(opp);
      // Phase 9 wires this to the Reddit comment endpoint; for now just stamp
      opp.postPerformance = opp.postPerformance || {};
      opp.postPerformance.lastCheckedAt = new Date();
      await opp.save();
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

function extractCommentId(url) {
  const m = url.match(/\/comments\/[^/]+\/[^/]+\/([a-z0-9]+)/);
  return m ? m[1] : null;
}
