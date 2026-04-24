import { getPlanForUser, getPublicPlans, PLANS } from '../../../shared/plans.js';

// Resolve the chat limits that apply to a given user. Starts from the user's
// plan and overlays any per-user `limitsOverride.chat` values. Returns a new
// object; does not mutate the plan registry.
export function getEffectiveChatLimits(user) {
  const plan = getPlanForUser(user);
  const override = user?.limitsOverride?.chat || null;
  if (!override) return { ...plan.chat };
  return { ...plan.chat, ...override };
}

export function getEffectivePlanFeatures(user) {
  const plan = getPlanForUser(user);
  const override = user?.limitsOverride?.features || null;
  if (!override) return { ...plan.features };
  return { ...plan.features, ...override };
}

// Pick a plan to suggest when the current plan blocks an action. Returns the
// next public plan with higher sortOrder than the user's current plan, or
// null if already on the top public tier.
export function getRecommendedUpgradePlanId(user) {
  const plan = getPlanForUser(user);
  const candidates = getPublicPlans().filter(
    (p) => p.sortOrder > plan.sortOrder,
  );
  return candidates.length ? candidates[0].id : null;
}

// UTC window boundaries used for quota aggregation.
export function getQuotaWindows(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const startOfDay = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const startOfMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const startOfTomorrow = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  const startOfNextMonth = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  const minuteAgo = new Date(now.getTime() - 60_000);
  return {
    now,
    minuteAgo,
    startOfDay,
    startOfMonth,
    startOfTomorrow,
    startOfNextMonth,
  };
}

// Re-export for convenience so callers only need this module.
export { PLANS, getPlanForUser };
