// Global upgrade-modal state. Single instance mounted in App.vue listens here.
//
// Two entry points:
//   - openFromDenial(body)  — server returned 403 plan_limit_exceeded
//   - openForFeature(opts)  — client-side gate (clicked an Add button while
//                             at cap, or a Premium-only menu entry)
//
// Both populate the same shape so the modal renders one way.

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { PLANS, getPublicPlans } from '../../../shared/plans.js';
import { useAuthStore } from './auth.js';
import { useDemoStore } from './demo.js';

export const useUpgradeModalStore = defineStore('upgradeModal', () => {
  const isOpen = ref(false);
  const denial = ref(null);

  function close() {
    isOpen.value = false;
    denial.value = null;
  }

  /**
   * Open from a server denial body (shape from evaluateStorageCap on the
   * server). Falls back to a generic title if fields are missing.
   */
  function openFromDenial(body) {
    if (!body) return;
    const upgradePlan = body.upgradePlanId ? PLANS[body.upgradePlanId] : null;
    denial.value = {
      source: 'server',
      reason: body.reason || 'plan_limit',
      limitKey: body.limitKey || null,
      limit: body.limit ?? null,
      used: body.used ?? null,
      currentPlan: body.currentPlan || null,
      upgradePlan,
      message: body.message || null,
    };
    isOpen.value = true;
  }

  /**
   * Open as a pre-flight gate. Pass the limit key (e.g. 'customCompounds') or
   * a feature key (e.g. 'aiToolsEnabled'). Modal infers the upgrade target
   * from the user's current plan.
   *
   * @param {{limitKey?: string, featureKey?: string, used?: number, message?: string}} opts
   */
  function openForGate(opts) {
    const auth = useAuthStore();
    const demo = useDemoStore();
    // In demo, the active profile is the sandbox — read its plan, not the
    // null auth user (which would make every plan a candidate and pick
    // Free as the "upgrade target").
    const currentPlanId =
      (demo.inDemo && demo.activePlanId) || auth.user?.plan || null;
    const currentPlan = currentPlanId ? PLANS[currentPlanId] : null;
    const candidates = currentPlan
      ? getPublicPlans().filter((p) => p.sortOrder > currentPlan.sortOrder)
      : getPublicPlans();
    const upgradePlan = candidates[0] || null;

    const limit = opts.limitKey && currentPlan
      ? currentPlan.storage[opts.limitKey]
      : null;

    denial.value = {
      source: 'client',
      reason: opts.limitKey ? 'storage_cap' : 'feature_disabled',
      limitKey: opts.limitKey || null,
      featureKey: opts.featureKey || null,
      limit: Number.isFinite(limit) ? limit : null,
      used: opts.used ?? null,
      currentPlan: currentPlanId,
      upgradePlan,
      message: opts.message || null,
    };
    isOpen.value = true;
  }

  return { isOpen, denial, close, openFromDenial, openForGate };
});
