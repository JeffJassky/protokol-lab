import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

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
  const state = ref({
    checklistDismissed: false,
    notificationPromptShown: false,
    dismissedAt: null,
  });
  const bannerDismissed = ref(false);

  function hydrate(uid) {
    userId.value = uid;
    state.value = {
      checklistDismissed: false,
      notificationPromptShown: false,
      dismissedAt: null,
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
    state.value = { checklistDismissed: false, notificationPromptShown: false, dismissedAt: null };
    bannerDismissed.value = false;
  }

  function dismissChecklist() {
    state.value.checklistDismissed = true;
    state.value.dismissedAt = Date.now();
  }

  function restoreChecklist() {
    state.value.checklistDismissed = false;
    state.value.dismissedAt = null;
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

  // Re-show dismissed checklist after 3 days so users who deferred don't
  // lose the prompt forever — but only if steps remain incomplete.
  const shouldRestoreAfterCooldown = computed(() => {
    if (!state.value.checklistDismissed || !state.value.dismissedAt) return false;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    return Date.now() - state.value.dismissedAt > threeDaysMs;
  });

  watch(state, (v) => save(userId.value, v), { deep: true });

  return {
    userId,
    state,
    bannerDismissed,
    shouldRestoreAfterCooldown,
    hydrate,
    clear,
    dismissChecklist,
    restoreChecklist,
    markNotificationPromptShown,
    dismissBanner,
  };
});
