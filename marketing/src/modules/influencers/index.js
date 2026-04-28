// Influencers module: outreach-focused workflows on top of the shared
// Contact collection. Phase 4: research agent.
// Phase 5 adds platform-specific tools; Phase 6 adds the draft agent.

import { scrapeContactPageTool } from '../../shared/tools/builtins/scrapeContactPage.js';
import { rssFeedTool } from '../../shared/tools/builtins/rssFeed.js';
import { saveFindingTool } from '../../shared/tools/builtins/saveFinding.js';
import { buildRedditClient } from '../../shared/tools/builtins/reddit/client.js';
import { buildRedditTools } from '../../shared/tools/builtins/reddit/tools.js';
import { buildYoutubeTools } from '../../shared/tools/builtins/youtube.js';
import { registerEnrichPrompt, registerResearchJob, ENRICH_PROMPT_KEY } from './jobs/research.js';
import { registerDraftPrompt, registerDraftJob, DRAFT_PROMPT_KEY } from './jobs/draft.js';
import { buildResearchRoutes } from './routes/research.js';
import { buildDraftsRoutes } from './routes/drafts.js';
import { buildOutreachDraftModel } from './models/OutreachDraft.js';

export function setupInfluencers(ctx) {
  // === Models ===
  ctx.models.OutreachDraft = buildOutreachDraftModel(ctx.db, ctx.config.collectionPrefix);
  ctx.indexInits = ctx.indexInits || [];
  ctx.indexInits.push(ctx.models.OutreachDraft.init());

  // === Tools ===
  // The Claude Agent SDK ships built-in `WebSearch` and `WebFetch` tools
  // we expose to research/draft loops. Custom tools below are wrapped as
  // an in-process MCP server (see shared/agent/claudeAgent.js).
  ctx.tools.register(scrapeContactPageTool);
  ctx.tools.register(rssFeedTool);
  ctx.tools.register(saveFindingTool);

  // Reddit tools (also used by the redditEngagement module)
  if (ctx.config.reddit?.clientId) {
    const redditClient = buildRedditClient({ ...ctx.config.reddit, logger: ctx.logger });
    if (redditClient) {
      ctx.redditClient = redditClient;
      for (const t of buildRedditTools({ client: redditClient, logger: ctx.logger })) {
        ctx.tools.register(t);
      }
    }
  } else {
    ctx.logger.warn?.('[marketing-admin] reddit.clientId not set — reddit tools disabled');
  }

  // YouTube tools (transcript tool works without API key)
  for (const t of buildYoutubeTools({ apiKey: ctx.config.youtubeApiKey, logger: ctx.logger })) {
    ctx.tools.register(t);
  }
  if (!ctx.config.youtubeApiKey) {
    ctx.logger.warn?.('[marketing-admin] youtubeApiKey not set — only youtube_transcript available');
  }

  // === Prompts ===
  registerEnrichPrompt(ctx.prompts);
  registerDraftPrompt(ctx.prompts);

  // === Job handlers ===
  registerResearchJob(ctx.worker.registry);
  registerDraftJob(ctx.worker.registry);

  return {
    name: 'influencers',
    routes: {
      '/api/influencers/research': buildResearchRoutes(ctx),
      '/api/influencers/drafts': buildDraftsRoutes(ctx),
    },
  };
}
