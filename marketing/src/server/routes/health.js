import express from 'express';

export function buildHealthRoutes(ctx) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const dbState = ctx.db.readyState; // 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
    res.json({
      status: 'ok',
      db: dbState === 1 ? 'connected' : 'not-connected',
      modules: Object.entries(ctx.config.modules)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k),
      tools: ctx.tools.list(),
      prompts: ctx.prompts.listDeclarations().map((d) => d.key),
      worker: { handlers: ctx.worker.registry.list() },
      basePath: ctx.config.basePath,
      version: '0.0.1',
    });
  });

  return router;
}
