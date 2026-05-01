<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { isNativePlatform } from '../api/auth-token.js';
import { getAppVersion, compareVersions } from '../api/app-version.js';

// Force-update gate. When the server returns `minAppVersion` from /me and
// the native binary is below it, this modal blocks the UI until the user
// installs an update. Designed for breaking API changes that shipped after
// an older binary went into the wild.
//
// Web sees no minAppVersion in /me's response; the modal is no-op'd via
// shouldShow returning false off-native.

const auth = useAuthStore();

const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL || 'https://apps.apple.com/app/protokol-lab/id000000000';
const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.protokollab.app';

const shouldShow = computed(() => {
  if (!isNativePlatform()) return false;
  const min = auth.minAppVersion;
  if (!min) return false;
  const current = getAppVersion();
  if (!current) return false; // hydrated yet? skip until known.
  return compareVersions(current, min) < 0;
});

async function openStore() {
  // Open the relevant store listing in the system browser. Capacitor's
  // App plugin can't do this directly; the standard pattern is window.open
  // which Capacitor routes through the system handler.
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const url = isIOS ? APP_STORE_URL : PLAY_STORE_URL;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch (_e) {
    if (typeof window !== 'undefined') window.open(url, '_blank');
  }
}
</script>

<template>
  <div v-if="shouldShow" class="force-update-overlay" role="dialog" aria-modal="true">
    <div class="force-update-card">
      <h2 class="force-update-title">Update required</h2>
      <p class="force-update-body">
        This version of Protokol Lab is no longer supported. Install the
        latest update to keep tracking your protocol.
      </p>
      <button type="button" class="force-update-cta" @click="openStore">
        Open the store
      </button>
    </div>
  </div>
</template>

<style scoped>
.force-update-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 9999;
}
.force-update-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-large, 16px);
  padding: var(--space-6);
  max-width: 400px;
  width: 100%;
  text-align: center;
}
.force-update-title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-l);
  color: var(--text);
}
.force-update-body {
  margin: 0 0 var(--space-5);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  line-height: 1.5;
}
.force-update-cta {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-medium);
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  width: 100%;
}
.force-update-cta:hover { opacity: 0.9; }
</style>
