import { Capacitor } from '@capacitor/core';

// Native (Capacitor) clients can't use cookies cross-origin reliably, so they
// authenticate with `Authorization: Bearer <jwt>`. The token is captured from
// the auth endpoint JSON body when the client opted in via `X-Auth-Mode:
// bearer`, kept in memory for the session, and persisted via
// @capacitor/preferences so it survives app restarts.
//
// On iOS, Preferences is backed by NSUserDefaults — durable across app
// launches and OS upgrades, cleared only on explicit "Reset" or app uninstall.
// On Android, Preferences uses SharedPreferences with the same durability
// guarantees. (Keychain-backed storage via @capacitor-community/secure-storage
// is the v1.5 stretch; UserDefaults is acceptable for an MVP-grade JWT.)
//
// Web never reaches this code's storage paths — `setAuthToken` short-circuits
// off-native, so the JWT never lands in JS-readable storage and remains in
// the HTTP-only cookie that the browser handles.

const TOKEN_KEY = 'bo_auth_token';
let cachedToken = null;
let hydrated = false;

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

// Lazy import — keeps the Preferences plugin out of the web bundle entirely.
async function preferences() {
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

// Async on native (Preferences is async); cheap on web (returns immediately).
// Callers that need the token synchronously should call `getAuthToken()` —
// after `hydrateAuthToken()` has resolved, the cached value is correct.
export async function hydrateAuthToken() {
  if (hydrated) return;
  hydrated = true;
  if (!isNativePlatform()) return;
  try {
    const prefs = await preferences();
    const { value } = await prefs.get({ key: TOKEN_KEY });
    cachedToken = value || null;
  } catch (_e) {
    cachedToken = null;
  }
}

export function getAuthToken() {
  return cachedToken;
}

export function setAuthToken(token) {
  cachedToken = token || null;
  if (!isNativePlatform()) return;
  // Fire-and-forget the persistence write. Caller has already accepted the
  // token in memory; the disk write doesn't need to block the auth flow.
  (async () => {
    try {
      const prefs = await preferences();
      if (token) await prefs.set({ key: TOKEN_KEY, value: token });
      else await prefs.remove({ key: TOKEN_KEY });
    } catch (_e) {
      // Best-effort; the in-memory copy still works for the session.
    }
  })();
}

export function clearAuthToken() {
  setAuthToken(null);
}
