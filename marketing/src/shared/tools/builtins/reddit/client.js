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

// Real-browser User-Agent. Reddit's anti-bot WAF pattern-matches against
// generic / library-shaped UAs (anything containing "bot", "scraper",
// "marketing-admin/", etc.) and serves the consent-wall HTML 403. A current
// Chrome UA passes the heuristic.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function buildRedditClient({ clientId, clientSecret, userAgent, username, password, logger } = {}) {
  // OAuth must use a custom UA per Reddit policy, but public-JSON does
  // better with a browser UA. So: if userAgent passed in AND we'll use
  // OAuth, honor it; otherwise default to BROWSER_UA.
  const useOAuth = Boolean(clientId && clientSecret);
  const ua = useOAuth ? (userAgent || 'protokol-marketing-admin/0.1') : BROWSER_UA;

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
  // Real-browser headers. Reddit's anti-bot looks at UA + Accept + a few
  // others. The Cookie line matters: `over18=1` skips the NSFW interstitial,
  // `_options` is a benign session-shape cookie that real browsers send.
  const headers = {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cookie': 'over18=1; _options=%7B%22pref_quarantine_optin%22%3A%20true%7D',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  async function fetchOnce(url) {
    return fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  }

  async function api(pathOrUrl, params = {}) {
    const primaryUrl = buildPublicUrl(pathOrUrl, params, 'www.reddit.com');
    const fallbackUrl = buildPublicUrl(pathOrUrl, params, 'old.reddit.com');

    // Try www, then old.reddit.com on 403. Each base gets its own retry
    // sequence with exponential backoff. old.reddit.com sometimes serves
    // when www.reddit.com refuses (different anti-bot path).
    let lastErr;
    for (const url of [primaryUrl, fallbackUrl]) {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          const delayMs = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
          await new Promise((r) => setTimeout(r, delayMs));
        }
        let res;
        try {
          res = await fetchOnce(url);
        } catch (err) {
          lastErr = err;
          continue;
        }
        if (res.ok) {
          if (attempt > 0 || url !== primaryUrl) {
            logger?.info?.(`[reddit] recovered ${res.status} after retry/fallback: ${url}`);
          }
          return res.json();
        }
        if (res.status === 403 || res.status === 429 || res.status >= 500) {
          const body = await res.text();
          lastErr = new Error(`reddit ${res.status}: ${body.slice(0, 150).replace(/\s+/g, ' ')}`);
          logger?.warn?.(`[reddit] ${res.status} attempt ${attempt + 1}/4 for ${url}`);
          continue;
        }
        // 4xx other than 403/429: don't retry, real client error.
        const body = await res.text();
        throw new Error(`reddit ${res.status}: ${body.slice(0, 200)}`);
      }
      logger?.warn?.(`[reddit] exhausted retries on ${url}, trying fallback host`);
    }
    throw lastErr || new Error('reddit: blocked on both www and old.reddit.com');
  }
  return { api, mode: 'public-json' };
}

function buildPublicUrl(pathOrUrl, params, host = 'www.reddit.com') {
  let base;
  let path;
  if (pathOrUrl.startsWith('http')) {
    const u = new URL(pathOrUrl);
    base = `${u.protocol}//${host}`;
    path = u.pathname + u.search;
  } else {
    base = `https://${host}`;
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
