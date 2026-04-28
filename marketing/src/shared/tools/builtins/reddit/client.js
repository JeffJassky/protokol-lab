// Lightweight Reddit OAuth client. App-only auth (client_credentials)
// is enough for reading public posts/comments — we don't need a user
// password unless we ever post (Phase 8 keeps posting manual). When
// username/password are configured, we use the script-app flow which
// has slightly higher rate limits and personalized listings.
//
// Token cache + refresh on 401.

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';

export function buildRedditClient({ clientId, clientSecret, userAgent, username, password, logger }) {
  if (!clientId || !clientSecret) return null;
  const ua = userAgent || 'marketing-admin/0.1';

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
      : `${API_BASE}${pathOrUrl}${pathOrUrl.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': ua,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) {
      tokenCache = null;
      // single retry
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

  return { api, getToken };
}
