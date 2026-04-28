// Public API: createMarketingAdmin returns { router, start, stop }.
// Mount router under any basePath in any Express host. Call start() once
// to connect mongo, seed prompts, boot worker + scheduler.

import { buildConfig } from './config.js';
import { createDbConnection, waitForConnection } from './shared/db/connection.js';
import { buildUsageModels } from './shared/usage/models.js';
import { buildUsageService } from './shared/usage/service.js';
import { buildPromptModels } from './shared/prompts/models.js';
import { buildPromptRegistry } from './shared/prompts/registry.js';
import { seedPrompts } from './shared/prompts/seeder.js';
import { buildJobRegistry } from './shared/worker/registry.js';
import { buildJobModel } from './shared/worker/models.js';
import { buildWorker } from './shared/worker/index.js';
import { buildAgentRunner } from './shared/agent/runner.js';
import { buildScheduler } from './shared/scheduler/index.js';
import { buildToolRegistry } from './shared/tools/registry.js';
import { buildSseHub } from './shared/sse.js';
import { buildRouter } from './server/router.js';
import { setupContacts } from './contacts/index.js';
import { loadModules } from './modules/index.js';

export function createMarketingAdmin(rawConfig) {
  const config = buildConfig(rawConfig);
  const logger = config.logger;

  const db = createDbConnection({ mongoUri: config.mongoUri, logger });

  // Build models bound to our connection
  const models = {
    ...buildUsageModels(db, config.collectionPrefix),
    ...buildPromptModels(db, config.collectionPrefix),
    Job: buildJobModel(db, config.collectionPrefix),
  };

  const usage = buildUsageService({ models, logger });
  const prompts = buildPromptRegistry({ models, logger });
  const tools = buildToolRegistry({ logger });
  const sse = buildSseHub();
  const jobRegistry = buildJobRegistry();
  const worker = buildWorker({ registry: jobRegistry, models, config, logger });
  const scheduler = buildScheduler({ logger, worker });
  const agent = buildAgentRunner({ config, models, prompts, usage, logger, llm: rawConfig.llm, sse });

  const ctx = {
    config,
    logger,
    db,
    models,
    usage,
    prompts,
    tools,
    sse,
    worker,
    scheduler,
    agent,
  };
  // Worker needs access to ctx for handlers; circular wired post-build.
  worker.setCtx(ctx);

  // Shared Contacts is foundational — set up before modules so they can
  // reference Contact + ContactList models in their own routes/jobs.
  const contactsSetup = setupContacts(ctx);
  ctx.sharedRoutes = { ...(ctx.sharedRoutes || {}), ...contactsSetup.routes };

  // Load enabled modules — they contribute models, routes, prompts, tools,
  // job handlers, scheduled tasks. For Phase 1 this is still a no-op.
  const moduleInstances = loadModules({ ctx });
  ctx.modules = moduleInstances;

  const router = buildRouter(ctx);

  let started = false;

  async function start() {
    if (started) return;
    await waitForConnection(db);
    if (Array.isArray(ctx.indexInits) && ctx.indexInits.length > 0) {
      await Promise.all(ctx.indexInits);
    }
    await seedPrompts({ registry: prompts, models, logger });
    await worker.start();
    await scheduler.start();
    for (const m of moduleInstances) {
      await m.startup?.(ctx);
    }
    started = true;
    logger.info?.(
      {
        basePath: config.basePath,
        modules: moduleInstances.map((m) => m.name),
        prefix: config.collectionPrefix,
      },
      '[marketing-admin] started'
    );
  }

  async function stop() {
    if (!started) return;
    started = false;
    await worker.stop();
    await scheduler.stop();
    await db.close();
    logger.info?.('[marketing-admin] stopped');
  }

  return { router, start, stop, ctx };
}
