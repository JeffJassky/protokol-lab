// Reddit client. Two modes:
//
//   - **public-json (default)** — unauthenticated requests against
//     www.reddit.com with `.json` appended to every path. No API approval
//     needed, no client_id/secret required. Rate limits are lower than
//     OAuth (~10 req/min ceiling) but our scan cadence (5 subs × hourly,
//     ~80 req/hr peak) sits far below that.
//
//   - **oauth** — used only when `clientId` and `clientSecret` are
//     configured. Hits oauth.reddit.com with a Bearer token. Slightly
//     higher rate limits + access to authenticated endpoints (we don't
//     currently need those — write actions are manual per PLAN).
//
// Both modes expose the same `api(pathOrUrl, params)` shape so the tool
// layer doesn't care which is in use.
//
// Token cache + refresh on 401 (oauth mode only).

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_BASE = 'https://oauth.reddit.com';
const PUBLIC_BASE = 'https://www.reddit.com';

export function buildRedditClient({ clientId, clientSecret, userAgent, username, password, logger } = {}) {
  const ua = userAgent || 'protokol-marketing-admin/0.1 (public-json)';
  const useOAuth = Boolean(clientId && clientSecret);

  if (!useOAuth) {
    return buildPublicJsonClient({ ua, logger });
  }
  return buildOAuthClient({ clientId, clientSecret, username, password, ua, logger });
}

// ──────────────────────────────────────────────────────────────────────
// Public-JSON client. Every Reddit URL has a `.json` twin that returns
// the same data shape as the OAuth API without authentication.
// ──────────────────────────────────────────────────────────────────────

function buildPublicJsonClient({ ua, logger }) {
  async function api(pathOrUrl, params = {}) {
    const url = buildPublicUrl(pathOrUrl, params);
    const res = await fetch(url, {
      headers: { 'User-Agent': ua },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const body = await res.text();
      throw new Error(`reddit 429 (rate limited): ${body.slice(0, 120)}`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`reddit ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  return { api, mode: 'public-json' };
}

function buildPublicUrl(pathOrUrl, params) {
  let base;
  let path;
  if (pathOrUrl.startsWith('http')) {
    const u = new URL(pathOrUrl);
    // If someone passed an oauth.reddit.com URL, rewrite to www.reddit.com
    base = `${u.protocol}//www.reddit.com`;
    path = u.pathname + u.search;
  } else {
    base = PUBLIC_BASE;
    path = pathOrUrl;
  }
  // Insert `.json` before the query string (if any).
  const qIdx = path.indexOf('?');
  const pathOnly = qIdx === -1 ? path : path.slice(0, qIdx);
  const existingQuery = qIdx === -1 ? '' : path.slice(qIdx + 1);
  const jsonPath = pathOnly.endsWith('.json') ? pathOnly : `${pathOnly}.json`;
  // Merge passed params with any query already on the URL.
  const merged = new URLSearchParams(existingQuery);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) merged.set(k, String(v));
  }
  // raw_json=1 disables Reddit's HTML-entity escaping — gives us clean strings.
  if (!merged.has('raw_json')) merged.set('raw_json', '1');
  const qs = merged.toString();
  return `${base}${jsonPath}${qs ? `?${qs}` : ''}`;
}

// ──────────────────────────────────────────────────────────────────────
// OAuth client (kept for users who set REDDIT_CLIENT_ID).
// ──────────────────────────────────────────────────────────────────────

function buildOAuthClient({ clientId, clientSecret, username, password, ua, logger }) {
  let tokenCache = null;

  async function getToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
      return tokenCache.accessToken;
    }
    const params = new URLSearchParams();
    if (username && password) {
      params.set('grant_type', 'password');
      params.set('username', username);
      params.set('password', password);
    } else {
      params.set('grant_type', 'client_credentials');
    }
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ua,
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`reddit token ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    tokenCache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    };
    return tokenCache.accessToken;
  }

  async function api(pathOrUrl, params = {}) {
    const token = await getToken();
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${OAUTH_BASE}${pathOrUrl}${pathOrUrl.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': ua,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) {
      tokenCache = null;
      const token2 = await getToken();
      const res2 = await fetch(url, {
        headers: { Authorization: `Bearer ${token2}`, 'User-Agent': ua },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res2.ok) throw new Error(`reddit ${res2.status} on retry`);
      return res2.json();
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`reddit ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  return { api, getToken, mode: 'oauth' };
}
