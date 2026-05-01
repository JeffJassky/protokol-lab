import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

// Persisted in localStorage (per-browser), keyed by userId so different
// accounts on the same device each get a fresh checklist. Server-side
// persistence would let progress follow the user across devices, but the
// checklist is really about *this* device being installed + notification-ready,
// so local is the right scope.
const STORAGE_KEY_PREFIX = 'bo-onboarding:';
const BANNER_DISMISS_KEY_PREFIX = 'bo-onboarding-banner-dismissed:';

function load(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(userId, state) {
  if (!userId) return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(state));
  } catch { /* quota — ignore */ }
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const userId = ref(null);
  // Checklist no longer supports dismiss/restore — it stays visible until
  // every step is genuinely complete. Only `notificationPromptShown` is
  // persisted, used to suppress the in-app prompt nag once the user has
  // already seen it.
  const state = ref({
    notificationPromptShown: false,
  });
  const bannerDismissed = ref(false);

  function hydrate(uid) {
    userId.value = uid;
    state.value = {
      notificationPromptShown: false,
      ...load(uid),
    };
    try {
      const raw = sessionStorage.getItem(BANNER_DISMISS_KEY_PREFIX + uid);
      bannerDismissed.value = raw === '1';
    } catch {
      bannerDismissed.value = false;
    }
  }

  function clear() {
    userId.value = null;
    state.value = { notificationPromptShown: false };
    bannerDismissed.value = false;
  }

  function markNotificationPromptShown() {
    state.value.notificationPromptShown = true;
  }

  function dismissBanner() {
    bannerDismissed.value = true;
    if (userId.value) {
      try { sessionStorage.setItem(BANNER_DISMISS_KEY_PREFIX + userId.value, '1'); } catch { /* ignore */ }
    }
  }

  watch(state, (v) => save(userId.value, v), { deep: true });

  return {
    userId,
    state,
    bannerDismissed,
    hydrate,
    clear,
    markNotificationPromptShown,
    dismissBanner,
  };
});
