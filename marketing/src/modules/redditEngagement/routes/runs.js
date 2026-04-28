import express from 'express';

export function buildRunsRoutes(ctx) {
  const router = express.Router();
  const { EngagementRun } = ctx.models;

  router.get('/', async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.subredditId) filter.subredditId = req.query.subredditId;
      const runs = await EngagementRun.find(filter).sort({ startedAt: -1 }).limit(100).lean();
      res.json({ runs });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const run = await EngagementRun.findById(req.params.id).lean();
      if (!run) return res.status(404).json({ error: 'not_found' });
      res.json(run);
    } catch (err) { next(err); }
  });

  return router;
}
