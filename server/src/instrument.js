// Sentry instrumentation. MUST be imported before anything else in
// src/index.js — `@sentry/node` patches Node internals (http, fs, mongoose
// driver, etc.) at import time, and any module loaded earlier won't be
// covered by tracing/error capture.
//
// Skipped entirely when SENTRY_DSN is unset so dev / test envs don't
// require credentials. Production sets SENTRY_DSN, SENTRY_ENVIRONMENT,
// and SENTRY_RELEASE in the host config.
//
// Environment convention (matches client/composables/useTracker.js
// release strategy): local | dev | staging | production.

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'local',
    release: process.env.SENTRY_RELEASE || undefined,
    // Default integrations cover http, express, mongoose, etc.
    // We don't pass `integrations:` so we inherit the up-to-date set.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip auth artifacts before they leave the host. The Pino logs
      // already redact server-side, but Sentry events also serialize
      // request cookies/headers/body via the http integration.
      try {
        // Drop the entire cookies dict + Cookie/Authorization headers. Sentry
        // doesn't need them for crash diagnostics, and an allowlist would go
        // stale silently every time we add a new auth/identity cookie. Same
        // reasoning for headers — only redact the ones that carry secrets,
        // since other headers (user-agent, accept) are useful for triage.
        if (event.request?.cookies) {
          event.request.cookies = '[redacted]';
        }
        if (event.request?.headers) {
          for (const k of ['authorization', 'cookie']) {
            if (event.request.headers[k]) event.request.headers[k] = '[redacted]';
          }
        }
        // Routes that accept credentials in the body — passwords, reset
        // tokens, support attachments, Stripe signatures. If one of these
        // 5xx's, we don't want the body in Sentry. Drop it entirely.
        const url = event.request?.url || '';
        if (
          /\/api\/auth\//.test(url) ||
          /\/api\/support\b/.test(url) ||
          /\/api\/stripe\/webhook\b/.test(url)
        ) {
          if (event.request) {
            event.request.data = '[redacted]';
          }
        }
      } catch { /* never let the redactor crash the event */ }
      return event;
    },
  });
}

export { Sentry };
