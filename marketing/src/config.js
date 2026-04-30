// Validates the config passed to createMarketingAdmin and freezes a
// canonical shape used everywhere else. Keep this loose for Phase 0 —
// most modules aren't wired yet, so we only require what the scaffold
// actually consumes.
//
// Required fields ramp up as modules light up.

export function buildConfig(input = {}) {
  if (!input.mongoUri) {
    throw new Error('[marketing-admin] config.mongoUri is required');
  }
  const authIsFn = typeof input.requireAuth === 'function';
  const authIsFnArray =
    Array.isArray(input.requireAuth) &&
    input.requireAuth.length > 0 &&
    input.requireAuth.every((m) => typeof m === 'function');
  if (!authIsFn && !authIsFnArray) {
    throw new Error('[marketing-admin] config.requireAuth must be an Express middleware function or array of functions');
  }

  const basePath = (input.basePath || '/admin/marketing').replace(/\/$/, '');

  const config = {
    mongoUri: input.mongoUri,
    collectionPrefix: input.collectionPrefix ?? 'marketing_',
    basePath,
    requireAuth: input.requireAuth,
    // Worker-env namespace. Workers only claim jobs tagged with this
    // env and tag enqueued jobs with this env. Lets local + prod share
    // a Mongo cluster without stealing each other's jobs.
    env: input.env || process.env.MARKETING_ENV || 'default',

    youtubeApiKey: input.youtubeApiKey || null,
    reddit: input.reddit || null,

    budget: {
      defaultPerJobUsd: input.budget?.defaultPerJobUsd ?? 0.5,
      monthlyCapUsd: input.budget?.monthlyCapUsd ?? 50,
    },
    worker: {
      concurrency: input.worker?.concurrency ?? 2,
      pollIntervalMs: input.worker?.pollIntervalMs ?? 2000,
      enabled: input.worker?.enabled ?? true,
    },
    models: {
      research: input.models?.research || 'claude-sonnet-4-6',
      draft: input.models?.draft || 'claude-sonnet-4-6',
      triage: input.models?.triage || 'claude-haiku-4-5-20251001',
      classify: input.models?.classify || 'claude-haiku-4-5-20251001',
    },
    modules: {
      influencers: { enabled: input.modules?.influencers?.enabled ?? true },
      redditEngagement: {
        enabled: input.modules?.redditEngagement?.enabled ?? true,
        scanIntervalMinutes: input.modules?.redditEngagement?.scanIntervalMinutes ?? 30,
      },
    },
    extraTools: input.extraTools || [],
    logger: input.logger || console,
  };

  return Object.freeze(config);
}
