// Sentry browser SDK init. Imported from main.js after createApp() so
// the Vue instance can be passed to the SDK for component-aware error
// boundaries + router breadcrumbs.
//
// Skipped when VITE_SENTRY_DSN is empty so dev builds without Sentry
// credentials work normally. Replay is enabled (10% of normal sessions,
// 100% of error sessions) — keeps free-tier usage predictable while
// still capturing context around every crash.

import * as Sentry from '@sentry/vue';

export function initSentry(app, router) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT ||
      (import.meta.env.PROD ? 'production' : 'local'),
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
      Sentry.replayIntegration({
        // Mask PII by default — typed input is not recorded, network
        // bodies are stripped. Errors still get DOM + console + clicks.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // Replay only on errors. Recording 10% of all sessions captured authed
    // app DOM (food log entries, symptom notes) — even with maskAllInputs the
    // free-form text content lands in replays. On-error replay still gives
    // crash context without persistent surveillance.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
    // Only propagate trace headers to our own backend so other origins
    // (Stripe, Google) don't see Sentry trace IDs. Anchor `localhost` to a
    // protocol+host prefix so a substring match doesn't leak headers to a
    // pathological URL like `https://localhost.evil.com`.
    tracePropagationTargets: [/^https?:\/\/localhost(:\d+)?\//, /^\//],
    sendDefaultPii: false,
  });
}
