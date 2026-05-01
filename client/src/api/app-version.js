// Native app version, read from @capacitor/app at boot. Sent on every API
// request as `X-App-Version` so the server can serve a `minAppVersion` gate
// (see GET /api/auth/me) and force binaries below the floor to update
// before they hit a breaking API change.
//
// Web has no version concept — fetches don't include the header and the
// server's gate is no-op'd on cookie-mode requests.

import { Capacitor } from '@capacitor/core';

let cachedVersion = null;
let hydrated = false;

async function loadVersion() {
  if (hydrated) return;
  hydrated = true;
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    // info.version is the semver-style marketing version (CFBundleShortVersionString
    // on iOS, versionName on Android).
    cachedVersion = info?.version || null;
  } catch (_e) {
    cachedVersion = null;
  }
}

export function hydrateAppVersion() {
  return loadVersion();
}

export function getAppVersion() {
  return cachedVersion;
}

// Compares two semver-ish strings ('1.2.3'). Returns -1 / 0 / 1.
// Trailing components default to 0 — '1.2' compares as '1.2.0'.
export function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}
