// Centralized online/offline state. Native uses @capacitor/network (more
// reliable than navigator.onLine inside WKWebView, which lies during cell-
// to-wifi handoffs); web uses the standard 'online' / 'offline' window
// events. Returns a shared ref so multiple consumers (AppLayout banner,
// retry buttons, anything that wants to gate a request) read the same
// truth without duplicating listeners.
//
// Pairs with the M6 persisted-state cache: when offline the diary, weight
// chart, and compounds list still render from Pinia + Preferences; the
// banner explains why fresh data isn't loading.

import { ref } from 'vue';
import { isNativePlatform } from '../api/auth-token.js';

const isOnline = ref(true);
let installed = false;

async function installListeners() {
  if (installed) return;
  installed = true;

  if (isNativePlatform()) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      isOnline.value = Boolean(status?.connected);
      await Network.addListener('networkStatusChange', (s) => {
        isOnline.value = Boolean(s?.connected);
      });
    } catch (_e) {
      // Plugin missing or failed — fall back to true so we don't show a
      // false offline banner on every cold start.
      isOnline.value = true;
    }
    return;
  }

  // Web path. navigator.onLine seeds the initial value; the events update it.
  if (typeof navigator !== 'undefined') {
    isOnline.value = navigator.onLine !== false;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { isOnline.value = true; });
    window.addEventListener('offline', () => { isOnline.value = false; });
  }
}

export function useNetworkStatus() {
  // Lazy install on first consumer. Safe to call multiple times.
  installListeners();
  return { isOnline };
}
