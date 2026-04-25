// Plan-gate denial side-effect. Set by stores/upgradeModal.js after Pinia is
// installed. We avoid importing the store directly so api/index.js stays
// usable in tests and outside Vue context.
let onPlanLimitExceeded = null;
export function registerPlanLimitHandler(fn) {
  onPlanLimitExceeded = typeof fn === 'function' ? fn : null;
}

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

  const res = await fetch(path, opts);

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
  del: (path) => request('DELETE', path),
};
