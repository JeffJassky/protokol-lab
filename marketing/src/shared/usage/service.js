// Phase 0 stub. Real implementation logs every model/api call and supports
// per-job budget caps + monthly rollups.

export function buildUsageService({ models, logger }) {
  async function log(entry) {
    try {
      await models.UsageLog.create(entry);
    } catch (err) {
      logger.warn?.({ err: err.message }, '[marketing-admin] usage log failed');
    }
  }

  async function monthlyTotalUsd({ from } = {}) {
    const since = from || startOfMonth();
    const [agg] = await models.UsageLog.aggregate([
      { $match: { ts: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$costUsd' } } },
    ]);
    return agg?.total ?? 0;
  }

  async function breakdown({ from } = {}) {
    const since = from || startOfMonth();
    const byModule = await models.UsageLog.aggregate([
      { $match: { ts: { $gte: since } } },
      {
        $group: {
          _id: { module: '$module', model: '$model' },
          costUsd: { $sum: '$costUsd' },
          tokensIn: { $sum: '$tokensIn' },
          tokensOut: { $sum: '$tokensOut' },
          calls: { $sum: 1 },
        },
      },
      { $sort: { costUsd: -1 } },
    ]);
    return byModule.map((row) => ({
      module: row._id.module,
      model: row._id.model,
      costUsd: row.costUsd,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      calls: row.calls,
    }));
  }

  return { log, monthlyTotalUsd, breakdown };
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
