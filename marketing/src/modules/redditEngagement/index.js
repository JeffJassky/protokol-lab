// Reddit Engagement module: monitor configured subreddits, triage
// candidate threads, draft genuine reply candidates, mark-posted flow.
// All posting stays manual.

import { buildMonitoredSubredditModel } from './models/MonitoredSubreddit.js';
import { buildEngagementOpportunityModel } from './models/EngagementOpportunity.js';
import { buildEngagementRunModel } from './models/EngagementRun.js';
import { registerScanJob, registerScanScheduler } from './jobs/scan.js';
import { registerTriagePrompt, registerTriageJob, registerTriageBatchPrompt, registerTriageBatchJob } from './jobs/triage.js';
import { registerDraftReplyPrompt, registerDraftReplyJob } from './jobs/draftReply.js';
import { buildSubredditsRoutes } from './routes/subreddits.js';
import { buildOpportunitiesRoutes } from './routes/opportunities.js';
import { buildRunsRoutes } from './routes/runs.js';

export function setupRedditEngagement(ctx) {
  // Models
  ctx.models.MonitoredSubreddit = buildMonitoredSubredditModel(ctx.db, ctx.config.collectionPrefix);
  ctx.models.EngagementOpportunity = buildEngagementOpportunityModel(ctx.db, ctx.config.collectionPrefix);
  ctx.models.EngagementRun = buildEngagementRunModel(ctx.db, ctx.config.collectionPrefix);
  ctx.indexInits = ctx.indexInits || [];
  ctx.indexInits.push(
    ctx.models.MonitoredSubreddit.init(),
    ctx.models.EngagementOpportunity.init(),
    ctx.models.EngagementRun.init()
  );

  // Prompts
  registerTriagePrompt(ctx.prompts);
  registerTriageBatchPrompt(ctx.prompts);
  registerDraftReplyPrompt(ctx.prompts);

  // Job handlers
  registerScanJob(ctx.worker.registry);
  registerTriageJob(ctx.worker.registry);
  registerTriageBatchJob(ctx.worker.registry);
  registerDraftReplyJob(ctx.worker.registry);

  // Boot marker — proves the new code path executed at startup. If you
  // don't see this line in your dev server logs after a restart, the
  // process is running stale code (HMR partial-reload or didn't restart).
  console.log('[redditEngagement] booted — bucket-classification + telegram + env-tagged jobs active');

  // Recurring scan scheduler
  registerScanScheduler(ctx.scheduler, ctx.models);

  return {
    name: 'redditEngagement',
    routes: {
      '/api/reddit-engagement/subreddits': buildSubredditsRoutes(ctx),
      '/api/reddit-engagement/opportunities': buildOpportunitiesRoutes(ctx),
      '/api/reddit-engagement/runs': buildRunsRoutes(ctx),
    },
  };
}
