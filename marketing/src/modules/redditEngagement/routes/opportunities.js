import express from 'express';

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
