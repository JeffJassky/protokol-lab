// Read-only access to the current user's plan + caps. UI components use this
// to render badges, disable buttons, and pre-flight check counts before
// firing requests. Server is still the source of truth — this is UX only.

import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';
import {
  PLANS,
  getPlanForUser,
  getPublicPlans,
} from '../../../shared/plans.js';

export function usePlanLimits() {
  const auth = useAuthStore();
  const demo = useDemoStore();

  // In demo mode, the active profile is the sandbox (not the auth user) so
  // plan-gated UI must read the sandbox's plan. Sandboxes are provisioned
  // on 'unlimited' so visitors see every paid feature without hitting an
  // upsell. Falls back to the auth user's plan otherwise.
  const plan = computed(() => {
    if (demo.inDemo && demo.activePlanId && PLANS[demo.activePlanId]) {
      return PLANS[demo.activePlanId];
    }
    return getPlanForUser(auth.user);
  });
  const features = computed(() => plan.value.features);
  const storage = computed(() => plan.value.storage);
  const chat = computed(() => plan.value.chat);

  // Next public tier above the current plan, or null if already on the top.
  // Used to label upgrade CTAs (e.g. "Upgrade to Premium").
  const upgradeTarget = computed(() => {
    const current = plan.value;
    return (
      getPublicPlans().find((p) => p.sortOrder > current.sortOrder) || null
    );
  });

  /**
   * For a storage cap key, return whether one more item could be added given
   * a known current count. Caller owns the count so we don't fetch here.
   * @param {string} key   e.g. 'customCompounds'
   * @param {number} used  current count of user-owned resources
   */
  function canAddStorage(key, used) {
    const limit = storage.value[key];
    if (!Number.isFinite(limit)) return true; // Infinity / missing
    return used < limit;
  }

  /** Storage cap (number, may be Infinity). */
  function storageCap(key) {
    return storage.value[key];
  }

  /** True if a feature flag is enabled for the current plan. */
  function hasFeature(key) {
    return features.value[key] === true;
  }

  /**
   * Find the lowest public plan that includes a given boolean feature flag,
   * or grants a strictly higher numeric storage cap than the user has now.
   * Returns the Plan object, or null if no such plan exists.
   */
  function planRequiredFor({ feature, storageKey }) {
    const current = plan.value;
    const candidates = getPublicPlans().filter(
      (p) => p.sortOrder > current.sortOrder,
    );
    if (feature) {
      return candidates.find((p) => p.features[feature] === true) || null;
    }
    if (storageKey) {
      const currentLimit = storage.value[storageKey];
      const currentFinite = Number.isFinite(currentLimit) ? currentLimit : Infinity;
      return (
        candidates.find((p) => {
          const c = p.storage[storageKey];
          return !Number.isFinite(c) || c > currentFinite;
        }) || null
      );
    }
    return null;
  }

  return {
    plan,
    features,
    storage,
    chat,
    upgradeTarget,
    canAddStorage,
    storageCap,
    hasFeature,
    planRequiredFor,
    PLANS,
  };
}
