import { getAuthToken, isNativePlatform } from './auth-token.js';
import { getAppVersion } from './app-version.js';

// Plan-gate denial side-effect. Set by stores/upgradeModal.js after Pinia is
// installed. We avoid importing the store directly so api/index.js stays
// usable in tests and outside Vue context.
let onPlanLimitExceeded = null;
export function registerPlanLimitHandler(fn) {
  onPlanLimitExceeded = typeof fn === 'function' ? fn : null;
}

// On native, all requests are cross-origin to protokollab.com. Web is
// same-origin so the host stays empty and `fetch('/api/...')` works as
// before. VITE_API_HOST overrides for staging native builds.
const API_HOST = isNativePlatform()
  ? (import.meta.env.VITE_API_HOST || 'https://protokollab.com')
  : '';

// Thrown for any non-2xx response. Carries the parsed body so callers can
// branch on `error`/`reason`/`limitKey` instead of regex'ing the message.
export class ApiError extends Error {
  constructor(status, body) {
    const message = (body && body.message) || (body && body.error) || `Request failed: ${status}`;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body || {};
    this.reason = body?.reason || null;
    this.code = body?.error || null;
  }
}

// Raw-fetch helper for callers that can't go through `request()` — streaming
// SSE bodies, multipart uploads, response-body inspection. Same host + Bearer
// behavior so a native build doesn't need to repeat the logic at every site.
//
// `path` is a server-relative path like `/api/chat`. On web that stays
// relative; on native we prepend API_HOST and inject auth headers.
export function nativeFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (isNativePlatform()) {
    headers.set('X-Auth-Mode', 'bearer');
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const version = getAppVersion();
    if (version) headers.set('X-App-Version', version);
  }
  return fetch(`${API_HOST}${path}`, { ...init, headers });
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: {},
    credentials: 'include',
  };

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  // Native: opt into Bearer auth. The server includes the JWT in JSON
  // responses for /login, /register, /google when this header is present;
  // web requests omit the header so the JWT never lands in JS-readable space.
  // X-App-Version drives the server-side minAppVersion gate (M15).
  if (isNativePlatform()) {
    opts.headers['X-Auth-Mode'] = 'bearer';
    const token = getAuthToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const version = getAppVersion();
    if (version) opts.headers['X-App-Version'] = version;
  }

  const res = await fetch(`${API_HOST}${path}`, opts);

  if (res.status === 401) {
    throw new ApiError(401, { error: 'not_authenticated', message: 'Not authenticated' });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));

    // Plan-gate denials surface a global upgrade modal in addition to throwing,
    // so callers don't all need to wire the same handler.
    if (data?.error === 'plan_limit_exceeded' && onPlanLimitExceeded) {
      try { onPlanLimitExceeded(data); } catch (_) { /* never block the throw */ }
    }

    throw new ApiError(res.status, data);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body),
};
