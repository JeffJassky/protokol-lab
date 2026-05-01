// Pinia persisted-state storage adapter. Web uses localStorage; native uses
// @capacitor/preferences (NSUserDefaults on iOS, SharedPreferences on
// Android). Both survive app restarts; native is also durable across OS
// upgrades. Same shape ({getItem, setItem, removeItem}) so stores opt in
// uniformly via `{ persist: { pick: [...] } }` regardless of platform.
//
// pinia-plugin-persistedstate v4 supports async storage adapters, so we
// don't need to pre-hydrate from Preferences before Pinia mounts — the
// plugin awaits storage reads on the first access of each persisted store.

import { Capacitor } from '@capacitor/core';

let preferencesPlugin = null;
async function getPreferences() {
  if (preferencesPlugin) return preferencesPlugin;
  const m = await import('@capacitor/preferences');
  preferencesPlugin = m.Preferences;
  return preferencesPlugin;
}

export function makePersistedStateStorage() {
  if (!Capacitor.isNativePlatform()) {
    // Web: synchronous Storage interface. localStorage is the canonical
    // choice; pinia-plugin-persistedstate accepts it as-is.
    return localStorage;
  }
  // Native: async wrapper around Capacitor Preferences. Each call goes
  // through the lazy-imported plugin so the web build never bundles it.
  return {
    getItem: async (key) => {
      const prefs = await getPreferences();
      const { value } = await prefs.get({ key });
      return value;
    },
    setItem: async (key, value) => {
      const prefs = await getPreferences();
      await prefs.set({ key, value });
    },
    removeItem: async (key) => {
      const prefs = await getPreferences();
      await prefs.remove({ key });
    },
  };
}
