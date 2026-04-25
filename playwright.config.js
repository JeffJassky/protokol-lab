import { defineConfig, devices } from '@playwright/test';

// Root-level Playwright config. Spins up:
//   - Server on :3001 with USE_MEM_MONGO=1 (zero-install ephemeral Mongo)
//   - Client (Vite dev) on :5173, proxying /api → :3001
//
// Each `npm run test:e2e` gets a fresh in-memory Mongo instance for the run
// (one per webServer boot, not per test). Test-level isolation is handled by
// unique emails per spec; destructive tests should not be run against data
// they didn't create.
//
// To develop specs interactively: `npm run test:e2e -- --ui`.

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  retries: 0,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
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
