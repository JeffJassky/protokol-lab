// Tracks every prompt key the suite uses. Modules call `register()` at
// startup to declare their defaults; the seeder ensures Mongo has a v1
// record per key on boot. Agent runners call `resolve()` to fetch the
// active version (cached) and substitute template variables before
// sending to the model.

import { renderTemplate } from '../agent/templating.js';

const CACHE_TTL_MS = 30_000;

export function buildPromptRegistry({ models, logger }) {
  const declarations = new Map(); // key -> declaration
  const cache = new Map(); // key -> { body, fetchedAt }

  function register(decl) {
    if (!decl?.key) throw new Error('[marketing-admin] prompt registration requires a `key`');
    declarations.set(decl.key, decl);
  }

  function listDeclarations() {
    return Array.from(declarations.values());
  }

  function invalidate(key) {
    cache.delete(key);
  }

  async function getActive(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.record;
    }
    const record = await models.Prompt.findOne({ key, isActive: true }).lean();
    if (record) cache.set(key, { record, fetchedAt: Date.now() });
    return record;
  }

  async function resolve(key, context = {}) {
    const decl = declarations.get(key);
    if (!decl) {
      logger.warn?.({ key }, '[marketing-admin] resolve: prompt not registered');
    }
    const record = await getActive(key);
    if (!record) {
      // Fallback to default body if Mongo record doesn't exist yet (pre-seed)
      if (decl?.defaultBody) {
        return renderTemplate(decl.defaultBody, context);
      }
      throw new Error(`[marketing-admin] prompt not found: ${key}`);
    }
    return renderTemplate(record.body, context);
  }

  return { register, listDeclarations, getActive, resolve, invalidate };
}
