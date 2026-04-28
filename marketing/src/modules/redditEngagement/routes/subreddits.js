import express from 'express';

export function buildSubredditsRoutes(ctx) {
  const router = express.Router();
  const { MonitoredSubreddit } = ctx.models;

  router.get('/', async (_req, res, next) => {
    try {
      const subs = await MonitoredSubreddit.find().sort({ updatedAt: -1 }).lean();
      res.json({ subreddits: subs });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const sub = await MonitoredSubreddit.create(sanitize(req.body));
      res.status(201).json(sub);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const sub = await MonitoredSubreddit.findById(req.params.id).lean();
      if (!sub) return res.status(404).json({ error: 'not_found' });
      res.json(sub);
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const sub = await MonitoredSubreddit.findByIdAndUpdate(req.params.id, sanitize(req.body), { new: true });
      if (!sub) return res.status(404).json({ error: 'not_found' });
      res.json(sub);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const sub = await MonitoredSubreddit.findByIdAndDelete(req.params.id);
      if (!sub) return res.status(404).json({ error: 'not_found' });
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

  router.post('/:id/scan-now', async (req, res, next) => {
    try {
      const exists = await MonitoredSubreddit.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ error: 'not_found' });
      const job = await ctx.worker.enqueue({
        type: 'redditEngagement.scanSubreddit',
        payload: { subredditId: req.params.id },
      });
      res.status(202).json({ jobId: String(job._id) });
    } catch (err) { next(err); }
  });

  return router;
}

function sanitize(body) {
  if (!body || typeof body !== 'object') return {};
  const { _id, createdAt, updatedAt, lastScanAt, lastScanFoundCount, totalPostsPosted, totalUpvotesEarned, ...rest } = body;
  return rest;
}
