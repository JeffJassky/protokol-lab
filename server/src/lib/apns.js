import { ApnsClient, Notification, Errors, Host } from 'apns2';
import { childLogger } from './logger.js';

const log = childLogger('apns');

let client = null;
let configured = false;

// Reasons that indicate a permanently dead device token. Mirrors the 404/410
// handling we do for Web Push — the cron worker prunes these so we stop
// fanning out to retired iOS installs.
export const APNS_DEAD_TOKEN_REASONS = new Set([
  Errors.badDeviceToken,
  Errors.unregistered,
  Errors.deviceTokenNotForTopic,
]);

export function initApns() {
  const team = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const bundle = process.env.APNS_BUNDLE_ID;
  const keyP8 = process.env.APNS_KEY_P8;
  // APNS_PRODUCTION=true points at api.push.apple.com (App Store/TestFlight
  // builds). Anything else uses the sandbox host so dev/Xcode builds (which
  // get sandbox tokens) actually deliver.
  const useProd = String(process.env.APNS_PRODUCTION || '').toLowerCase() === 'true';

  if (!team || !keyId || !bundle || !keyP8) {
    log.info(
      { hasTeam: !!team, hasKeyId: !!keyId, hasBundle: !!bundle, hasKey: !!keyP8 },
      'apns: not fully configured, native push disabled',
    );
    return;
  }

  // DigitalOcean stores multi-line values fine, but Heroku/some env shells
  // mangle real newlines to `\n`. Normalize either form back to a real PEM.
  const signingKey = keyP8.includes('\\n') ? keyP8.replace(/\\n/g, '\n') : keyP8;

  client = new ApnsClient({
    team,
    keyId,
    signingKey,
    defaultTopic: bundle,
    host: useProd ? Host.production : Host.development,
  });
  configured = true;
  log.info({ team, keyId, bundle, host: useProd ? 'production' : 'sandbox' }, 'apns: configured');
}

export function isApnsConfigured() {
  return configured;
}

// Send a single notification. Throws ApnsError on failure.
export async function sendApns(token, payload) {
  if (!client) throw new Error('APNs not configured');

  const title = payload?.title || 'Protokol Lab';
  const body = payload?.body || '';
  // Strip our app-specific fields out of the data payload — Apple ignores
  // unknown keys but the smaller payload helps stay under the 4 KB cap.
  const data = {};
  if (payload?.url) data.url = payload.url;
  if (payload?.category) data.category = payload.category;
  if (payload?.tag) data.tag = payload.tag;

  const note = new Notification(token, {
    alert: { title, body },
    sound: 'default',
    data,
  });
  return client.send(note);
}
