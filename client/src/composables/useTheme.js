import { useColorMode } from '@vueuse/core';

// Single source of truth for theme selection.
// Writes `data-theme="light|dark"` on <html> (always resolved — auto follows
// OS preference). Preference itself ('auto' | 'light' | 'dark') is persisted
// to localStorage under `vt-theme`.
export function useTheme() {
  return useColorMode({
    storageKey: 'vt-theme',
    attribute: 'data-theme',
    selector: 'html',
    emitAuto: false,
    initialValue: 'auto',
  });
}
