// Loads enabled modules and wires them into the suite. Each module
// returns a setup function that registers prompts/tools/jobs/routes
// against the shared ctx and returns a manifest the suite uses to wire
// HTTP routes and UI nav contributions.

import { setupInfluencers } from './influencers/index.js';
import { setupRedditEngagement } from './redditEngagement/index.js';

export function loadModules({ ctx }) {
  const enabled = [];

  if (ctx.config.modules.influencers?.enabled) {
    const inst = setupInfluencers(ctx);
    enabled.push(inst);
    mergeRoutes(ctx, inst.routes);
  }
  if (ctx.config.modules.redditEngagement?.enabled) {
    const inst = setupRedditEngagement(ctx);
    enabled.push(inst);
    mergeRoutes(ctx, inst.routes);
  }

  return enabled;
}

function mergeRoutes(ctx, routes) {
  if (!routes) return;
  ctx.sharedRoutes = ctx.sharedRoutes || {};
  Object.assign(ctx.sharedRoutes, routes);
}
