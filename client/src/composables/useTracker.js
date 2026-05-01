// Funnel tracker. Hits POST /api/track on the server, which validates the
// event name against an allowlist and persists into the FunnelEvent
// collection. Visible to admins via /admin/funnel + /admin/users/:id.
//
// Usage:
//   - Auto page-view: installTrackerAutoPageView(router) once at app boot.
//   - Manual:         const { track } = useTracker(); track('cta_click', { surface: 'hero', cta: 'try_demo' });
//
// Transport prefers navigator.sendBeacon so navigations don't cancel the
// request. Falls back to fetch with keepalive when sendBeacon isn't
// available (e.g. SSR / older browsers).

const SESSION_REFERRER_KEY = 'bo_initial_referrer';
const SESSION_UTM_KEY = 'bo_initial_utm';
const UTM_FIELD_MAX = 200;
const REFERRER_MAX = 500;

// Cap each UTM field so a malicious link can't overflow localStorage's 5MB
// quota with a giant utm_source. The server clamps too; this is defense in
// depth + protection against breaking client persistence.
function clampStr(v, max) {
  if (typeof v !== 'string') return null;
  return v.length > max ? v.slice(0, max) : v;
}

function readUtmFromUrl(url) {
  try {
    const u = typeof url === 'string' ? new URL(url, window.location.origin) : url;
    const utm = {
      source: clampStr(u.searchParams.get('utm_source'), UTM_FIELD_MAX),
      medium: clampStr(u.searchParams.get('utm_medium'), UTM_FIELD_MAX),
      campaign: clampStr(u.searchParams.get('utm_campaign'), UTM_FIELD_MAX),
    };
    return utm.source || utm.medium || utm.campaign ? utm : null;
  } catch {
    return null;
  }
}

// Drop query string + hash from a path before sending it as a funnel event.
// Reset tokens (`?token=...`), email magic links (`?email=...`), and other
// credentials show up in URLs and would otherwise be persisted to FunnelEvent
// rows AND captured into Sentry breadcrumbs via the same beacon. Strip them.
function scrubPath(path) {
  if (typeof path !== 'string') return null;
  const q = path.indexOf('?');
  const h = path.indexOf('#');
  let cut = path.length;
  if (q !== -1) cut = Math.min(cut, q);
  if (h !== -1) cut = Math.min(cut, h);
  return path.slice(0, cut);
}

// Strip query/hash from a referrer URL before persisting. Same reasoning as
// scrubPath — referrers from in-app nav can carry tokens.
function scrubReferrer(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  try {
    const u = new URL(ref);
    return clampStr(`${u.origin}${u.pathname}`, REFERRER_MAX);
  } catch {
    return clampStr(ref.split(/[?#]/)[0], REFERRER_MAX);
  }
}

// First-touch attribution. We snapshot the referrer + UTM on first page
// load and reuse it for the session — otherwise an internal nav loses
// the original source. localStorage so it persists across tabs in the
// same browser; cleared by clearing site data.
function getInitialReferrer() {
  if (typeof window === 'undefined') return null;
  let stored = null;
  try {
    stored = window.localStorage?.getItem(SESSION_REFERRER_KEY);
  } catch { /* localStorage blocked */ }
  if (stored !== null) return stored || null;
  const ref = scrubReferrer(document.referrer) || '';
  try { window.localStorage?.setItem(SESSION_REFERRER_KEY, ref); } catch { /* ignore */ }
  return ref || null;
}

function getInitialUtm() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(SESSION_UTM_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  const utm = readUtmFromUrl(window.location.href);
  if (utm) {
    try { window.localStorage?.setItem(SESSION_UTM_KEY, JSON.stringify(utm)); } catch { /* ignore */ }
    return utm;
  }
  // Mark as resolved so we don't re-read the URL on every nav.
  try { window.localStorage?.setItem(SESSION_UTM_KEY, JSON.stringify({})); } catch { /* ignore */ }
  return null;
}

function postBeacon(payload) {
  if (typeof window === 'undefined') return;
  const url = '/api/track';
  const body = JSON.stringify(payload);
  // sendBeacon is fire-and-forget and survives page unload. The server
  // ignores response codes for these (it returns 204).
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    } catch { /* fall through to fetch */ }
  }
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  } catch { /* swallow — telemetry is best-effort */ }
}

export function track(name, props = {}) {
  if (typeof window === 'undefined') return;
  // Suppress beacons from automated browsers on prod (Playwright synthetic
  // + post-deploy smoke). Scoped to prod hostname so e2e specs running
  // against localhost still emit real beacons into mem-mongo and exercise
  // the funnel pipeline. Server also drops on x-synthetic-probe header
  // for defense in depth.
  if (navigator.webdriver && window.location.hostname === 'protokollab.com') return;
  const utm = getInitialUtm();
  postBeacon({
    name,
    props,
    // Strip query string + hash. URLs commonly carry credentials in query
    // params (reset tokens, magic-link emails, OAuth state) and persisting
    // them into FunnelEvent rows or Sentry breadcrumbs is a credential leak.
    path: scrubPath(window.location.pathname),
    referrer: getInitialReferrer(),
    utm: utm || {},
  });
}

// Vue Router hook — fires page_view on every successful navigation.
//
// `afterEach` only runs on transitions, so it would miss the entry route
// (already resolved by the time the SPA mounts and we install the hook).
// We fire one manual page_view for the current route on install so the
// entry hit shows up in the funnel — without this the first page a
// visitor lands on never appears in analytics.
export function installTrackerAutoPageView(router) {
  if (typeof window === 'undefined') return;
  // Capture initial UTM/referrer before the first emit so the entry
  // page_view already carries them.
  getInitialReferrer();
  getInitialUtm();

  const current = router.currentRoute?.value;
  if (current) {
    track('page_view', {
      name: typeof current.name === 'string' ? current.name : null,
      from: null,
    });
  }

  router.afterEach((to, from) => {
    track('page_view', {
      name: typeof to.name === 'string' ? to.name : null,
      from: from?.fullPath || null,
    });
  });
}

export function useTracker() {
  return { track };
}
