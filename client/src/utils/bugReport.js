// Shared helpers for the floating bug-report FAB and the /support new-ticket
// form. Both surfaces collect the same three plain-language answers, then
// append an auto-collected context block so non-technical users don't have
// to remember what page / browser / time they were on.

export function snapshotContext(route) {
  const now = new Date();
  return {
    page: route?.fullPath || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''),
    pageName: route?.name ? String(route.name) : '',
    timestampLocal: now.toString(),
    timestampISO: now.toISOString(),
    tzOffsetMinutes: now.getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    platform: typeof navigator !== 'undefined' ? (navigator.platform || '') : '',
    language: typeof navigator !== 'undefined' ? (navigator.language || '') : '',
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
    screen: typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height}` : '',
    devicePixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
    theme: detectTheme(),
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    referrer: typeof document !== 'undefined' ? (document.referrer || '') : '',
    appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
  };
}

function detectTheme() {
  if (typeof document === 'undefined') return '';
  const root = document.documentElement;
  return (
    root.dataset?.theme
    || root.getAttribute('data-theme')
    || (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light')
  );
}

export function buildSubject(happened) {
  const first = String(happened || '').trim().split(/\r?\n/)[0] || 'Bug report';
  const trimmed = first.length > 180 ? `${first.slice(0, 177)}…` : first;
  return trimmed.slice(0, 200);
}

export function buildDescription({ happened, expected, doing }, ctx) {
  const lines = [];
  lines.push('What happened:');
  lines.push(String(happened || '').trim());
  lines.push('');
  if (expected && String(expected).trim()) {
    lines.push('What I expected to happen instead:');
    lines.push(String(expected).trim());
    lines.push('');
  }
  if (doing && String(doing).trim()) {
    lines.push('What I was doing right before:');
    lines.push(String(doing).trim());
    lines.push('');
  }
  lines.push('---');
  lines.push('Auto-collected context (do not edit):');
  for (const [k, v] of Object.entries(ctx || {})) lines.push(`- ${k}: ${v}`);
  return lines.join('\n').slice(0, 10000);
}

// Single-field feedback (open-ended). Saved as a ticket so support sees it.
export function buildFeedbackDescription(body, ctx) {
  const lines = [];
  lines.push('Feedback:');
  lines.push(String(body || '').trim());
  lines.push('');
  lines.push('---');
  lines.push('Auto-collected context (do not edit):');
  for (const [k, v] of Object.entries(ctx || {})) lines.push(`- ${k}: ${v}`);
  return lines.join('\n').slice(0, 10000);
}
