import express from 'express';

export function buildUsageRoutes(ctx) {
  const router = express.Router();

  router.get('/summary', async (req, res) => {
    const [monthlyUsd, breakdown] = await Promise.all([
      ctx.usage.monthlyTotalUsd(),
      ctx.usage.breakdown(),
    ]);
    res.json({
      monthlyUsd,
      monthlyCapUsd: ctx.config.budget.monthlyCapUsd,
      breakdown,
    });
  });

  return router;
}
