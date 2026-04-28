// Wires the @jeffjassky/marketing-admin package into the host app.
// Singleton — createApp may be called multiple times (e.g. tests), but
// the suite has its own Mongo connection + worker so we only build once.
//
// Auth chain matches /api/admin/*: requireAuth → requireAuthUser → requireAdmin.

import { createMarketingAdmin } from '@jeffjassky/marketing-admin';
import { requireAuth, requireAuthUser } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('marketing-admin');

let instance = null;
let started = false;

export function getMarketingAdmin() {
  if (!process.env.MONGODB_URI) {
    // No mongo configured (early test boot); return null so app.js skips mounting.
    return null;
  }
  if (instance) return instance;

  // Auth for the LLM is read by @anthropic-ai/claude-agent-sdk directly
  // from process.env.ANTHROPIC_API_KEY (or local Claude Code login on
  // dev machines). No explicit pass-through needed — but the env var
  // must be present in the host's environment when the worker runs.
  instance = createMarketingAdmin({
    mongoUri: process.env.MONGODB_URI,
    collectionPrefix: 'marketing_',
    basePath: '/admin/marketing',
    requireAuth: [requireAuth, requireAuthUser, requireAdmin],
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
    // Reddit access defaults to public-JSON mode (no auth, no API approval
    // needed). Pass a User-Agent regardless so requests identify properly.
    // Set REDDIT_CLIENT_ID/SECRET (+ optional REDDIT_USERNAME/PASSWORD) to
    // upgrade to OAuth — useful only if Reddit ever clamps down on
    // logged-out JSON access. See marketing/src/shared/tools/builtins/reddit/client.js.
    reddit: {
      userAgent: process.env.REDDIT_USER_AGENT || 'protokol-marketing-admin/0.1 by /u/jeffjassky',
      clientId: process.env.REDDIT_CLIENT_ID || null,
      clientSecret: process.env.REDDIT_CLIENT_SECRET || null,
      username: process.env.REDDIT_USERNAME || null,
      password: process.env.REDDIT_PASSWORD || null,
    },
    logger: log,
  });

  return instance;
}

export async function startMarketingAdmin() {
  const m = getMarketingAdmin();
  if (!m || started) return;
  await m.start();
  started = true;
}

export async function stopMarketingAdmin() {
  if (!instance || !started) return;
  await instance.stop();
  started = false;
}
