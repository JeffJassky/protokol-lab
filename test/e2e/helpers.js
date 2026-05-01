// Shared E2E helpers.
//
// Two register flavors:
//   - registerViaApi: fast path. Hits /api/auth/register + marks onboarding
//     complete. Use this for any spec that doesn't explicitly test UI signup.
//   - registerViaUi: walks the actual /register form. Used by auth.spec.js
//     to prove the UI form is wired up; followed by a UI walk-through of
//     the welcome wizard since onboardingComplete=false blocks /log.
//
// SERVER_BASE is exported for specs that need to hit the server directly
// (e.g., posting unsigned Stripe webhook events). API helpers below use
// relative paths so cookies stay scoped to the Vite origin and survive
// across page.goto() navigations.

export const SERVER_BASE = 'http://localhost:3002';
export const PASSWORD = 'passw0rd-ok';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

// API-only path: register, then mark onboardingComplete=true so the router
// stops hijacking subsequent /log navigations to /welcome. Uses relative
// URLs so the browser context's cookie jar binds to the same origin as
// page.goto() — otherwise UI follow-up steps would be unauthenticated.
export async function registerViaApi(page, email) {
  const reg = await page.request.post('/api/auth/register', {
    data: { email, password: PASSWORD },
  });
  if (reg.status() !== 201) {
    throw new Error(`register failed: ${reg.status()} ${await reg.text()}`);
  }
  const done = await page.request.post('/api/auth/onboarding/complete', {});
  if (done.status() !== 200) {
    throw new Error(`onboarding complete failed: ${done.status()} ${await done.text()}`);
  }
  return (await reg.json()).user;
}

export async function registerViaUi(page, email) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  // The router pushes new users to /welcome (onboarding wizard). Wait for
  // it so the next assertion has a stable starting point.
  await page.waitForURL(/\/welcome|\/log|\/$/);
}

export async function loginViaUi(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  // Scope to the form's submit button — matching by name regex would also
  // hit the "Sign in with Google" button on the same page (strict-mode
  // violation) once the Google Sign-In iframe finishes loading.
  await page.locator('form button[type="submit"]').click();
}

export async function logoutViaApi(page) {
  await page.request.post('/api/auth/logout', {});
}
