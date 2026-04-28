import express from 'express';
import { renderTemplate } from '../../shared/agent/templating.js';

// Prompt CRUD. Edits are versioned: PATCH creates a new isActive=true
// record and demotes the prior. activate-version flips active back to a
// historical version. restore-default writes a new version using the
// shipped defaultBody. test renders a prompt against a sample context
// (no LLM call here — Phase 3 wires that via /test-with-llm).
//
// On any write, we invalidate the in-process cache so the next agent
// run picks up the change immediately.

export function buildPromptRoutes(ctx) {
  const router = express.Router();
  const { Prompt } = ctx.models;

  router.get('/', async (req, res, next) => {
    try {
      const records = await Prompt.find({ isActive: true })
        .sort({ module: 1, key: 1 })
        .lean();
      res.json({ prompts: records });
    } catch (err) { next(err); }
  });

  router.get('/:key', async (req, res, next) => {
    try {
      const record = await Prompt.findOne({ key: req.params.key, isActive: true }).lean();
      if (!record) return res.status(404).json({ error: 'not_found' });
      res.json(record);
    } catch (err) { next(err); }
  });

  router.get('/:key/history', async (req, res, next) => {
    try {
      const records = await Prompt.find({ key: req.params.key })
        .sort({ version: -1 })
        .lean();
      res.json({ versions: records });
    } catch (err) { next(err); }
  });

  router.patch('/:key', async (req, res, next) => {
    try {
      const { body, editedBy } = req.body || {};
      if (typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'body_required' });
      }
      const updated = await createNewVersion(ctx, req.params.key, { body, editedBy });
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.post('/:key/restore-default', async (req, res, next) => {
    try {
      const current = await Prompt.findOne({ key: req.params.key, isActive: true });
      if (!current) return res.status(404).json({ error: 'not_found' });
      const updated = await createNewVersion(ctx, req.params.key, {
        body: current.defaultBody,
        editedBy: req.body?.editedBy,
      });
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.post('/:key/activate-version', async (req, res, next) => {
    try {
      const { version } = req.body || {};
      if (!Number.isFinite(Number(version))) {
        return res.status(400).json({ error: 'version_required' });
      }
      const target = await Prompt.findOne({ key: req.params.key, version: Number(version) });
      if (!target) return res.status(404).json({ error: 'version_not_found' });

      const updated = await createNewVersion(ctx, req.params.key, {
        body: target.body,
        editedBy: req.body?.editedBy,
        note: `restored from v${target.version}`,
      });
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.post('/:key/test', async (req, res, next) => {
    try {
      const { context = {}, useLlm = false } = req.body || {};
      const record = await Prompt.findOne({ key: req.params.key, isActive: true }).lean();
      if (!record) return res.status(404).json({ error: 'not_found' });

      const rendered = renderTemplate(record.body, context);
      const result = { rendered, output: null, model: null, costUsd: 0 };

      if (useLlm) {
        // Real LLM dry-run uses the agent runner. If no LLM is configured,
        // we still return the rendered prompt so the editor's preview works.
        if (ctx.agent?.testPrompt) {
          const out = await ctx.agent.testPrompt({ key: record.key, context });
          Object.assign(result, out);
        } else {
          result.output = '(no LLM configured — rendering only)';
        }
      }

      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

async function createNewVersion(ctx, key, { body, editedBy, note }) {
  const { Prompt } = ctx.models;
  const current = await Prompt.findOne({ key, isActive: true });
  if (!current) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }
  const nextVersion = current.version + 1;
  // Demote current
  current.isActive = false;
  await current.save();
  // Insert new active version (carry over metadata from current)
  const created = await Prompt.create({
    key,
    module: current.module,
    title: current.title,
    description: note ? `${current.description || ''}\n\n[${note}]` : current.description,
    body,
    defaultBody: current.defaultBody,
    variables: current.variables,
    outputSchema: current.outputSchema,
    modelSlot: current.modelSlot,
    version: nextVersion,
    isActive: true,
    editedBy,
    editedAt: new Date(),
  });
  ctx.prompts.invalidate(key);
  return created.toObject();
}
