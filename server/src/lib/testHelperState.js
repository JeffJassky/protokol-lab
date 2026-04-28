// In-memory side channel for E2E tests. Records the raw reset token issued
// by /api/auth/forgot-password so a Playwright spec can complete the reset
// without going through SendGrid.
//
// Belt-and-suspenders: every read AND write checks NODE_ENV at call time.
// If this module ever gets imported in a non-e2e environment, the store
// stays empty and getters return null. The only consumer of the getters is
// routes/testHelpers.js, which is itself gated by NODE_ENV + token header.
//
// Process-local Map. Single Playwright worker = single process. If we ever
// shard e2e workers we'll need to plumb this through Redis or the DB; until
// then the simplest possible store is the right answer.

const lastResetTokenByEmail = new Map();

function isE2e() {
  return process.env.NODE_ENV === 'e2e';
}

export function recordResetToken(email, rawToken) {
  if (!isE2e()) return;
  if (!email || !rawToken) return;
  lastResetTokenByEmail.set(String(email).toLowerCase(), {
    token: rawToken,
    recordedAt: Date.now(),
  });
}

// One-shot read. Consumes the entry so concurrent tests can't observe a
// token belonging to a previous spec — the recorder always overwrites on
// the latest /forgot-password call, but a stale read between two tests
// would otherwise be possible.
export function getResetToken(email) {
  if (!isE2e()) return null;
  if (!email) return null;
  const key = String(email).toLowerCase();
  const entry = lastResetTokenByEmail.get(key);
  if (!entry) return null;
  lastResetTokenByEmail.delete(key);
  return entry.token;
}

export function clearResetTokens() {
  lastResetTokenByEmail.clear();
}
