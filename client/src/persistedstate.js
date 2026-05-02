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

// Lazy-import the Preferences module. We DON'T cache the plugin proxy
// because returning it from an async function makes JS treat it as
// thenable (Capacitor plugin proxies have auto-generated `.then`), which
// surfaces as `"Preferences.then() is not implemented on ios"` on every
// `await`. Returning the import module (a plain object) keeps the awaited
// resolution non-thenable; we destructure `Preferences` at the call site.
async function getPreferencesModule() {
  return await import('@capacitor/preferences');
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
      const { Preferences } = await getPreferencesModule();
      const { value } = await Preferences.get({ key });
      return value;
    },
    setItem: async (key, value) => {
      const { Preferences } = await getPreferencesModule();
      await Preferences.set({ key, value });
    },
    removeItem: async (key) => {
      const { Preferences } = await getPreferencesModule();
      await Preferences.remove({ key });
    },
  };
}
