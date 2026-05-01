import { defineConfig, devices } from '@playwright/test';

// Root-level Playwright config.
//
// Two modes:
//   1. Local / CI e2e (default) — spins up the full stack against an
//      ephemeral mem-mongo. Specs run against http://localhost:5174.
//   2. Production synthetic — set PROD_SYNTHETIC=1 + SYNTHETIC_BASE_URL.
//      Skips the webServer block, points at the live URL, and drops the
//      internal-test-token header (the prod server never accepts it).
//      Used by deploy.yml (post-deploy smoke) and synthetic.yml (cron).
//
// To develop specs interactively: `npm run test:e2e -- --ui`.

const SYNTHETIC_MODE = process.env.PROD_SYNTHETIC === '1';
const BASE_URL = SYNTHETIC_MODE
  ? (process.env.SYNTHETIC_BASE_URL || 'https://protokollab.com')
  : 'http://localhost:5174';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  retries: 0,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Test-only helpers (/api/__test/*) require this header in addition to
    // NODE_ENV=e2e on the server. Keeps a stray NODE_ENV=e2e in CI/staging
    // from exposing the reset-everything endpoint. Prod synthetic must not
    // send it (prod server rejects on missing NODE_ENV match anyway, but
    // omitting the header makes the intent loud).
    //
    // x-synthetic-probe tells the prod server to suppress FunnelEvent
    // inserts for this request (track beacon + emitDemoEvent both honor
    // it). Pino log lines still emit so the synthetic run remains
    // observable. Synthetic-only — e2e against mem-mongo doesn't need it.
    extraHTTPHeaders: SYNTHETIC_MODE
      ? { 'x-synthetic-probe': '1' }
      : { 'x-internal-test-token': 'e2e-internal-token-not-for-prod' },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer when probing prod — the app is already running there.
  webServer: SYNTHETIC_MODE ? undefined : [
    {
      name: 'server',
      command: 'npm run start --prefix server',
      url: 'http://localhost:3002/api/health',
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'e2e',
        USE_MEM_MONGO: '1',
        PORT: '3002',
        JWT_SECRET: 'e2e-secret-not-for-prod',
        INTERNAL_TEST_TOKEN: 'e2e-internal-token-not-for-prod',
        APP_URL: 'http://localhost:5174',
        LOG_LEVEL: 'warn',
        COOKIE_SAMESITE: 'lax',
        BACKUP_DIR: '/tmp/protokol-e2e-backups',
        // Stripe: dummy key so isStripeConfigured() is true and the webhook
        // route accepts requests; empty secret routes through the dev JSON
        // path (no signature verification). These override any values the
        // server's .env may carry into the e2e shell.
        STRIPE_SECRET_KEY: 'sk_test_e2e_dummy',
        STRIPE_WEBHOOK_SECRET: '',
        // Force the mock agent so e2e never hits Gemini. Production code
        // path is untouched — only AGENT_PROVIDER=mock activates the mock
        // (see services/agent.mock.js).
        AGENT_PROVIDER: 'mock',
        // Don't fan out emails during E2E.
        SENDGRID_API_KEY: '',
        // VAPID keys are required at boot (initPush throws if missing). We
        // don't trigger any push fanouts in E2E specs, so user's .env values
        // are inherited as-is — no override here.
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'client',
      command: 'npm run dev --prefix client -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        VITE_PROXY_TARGET: 'http://localhost:3002',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
