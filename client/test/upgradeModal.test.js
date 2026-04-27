// Upgrade modal — verifies openForGate picks the right upgrade target across
// the visitor-state matrix.
//
// Locks in the regression we shipped twice: when auth.user is null (anon
// demo), the modal used to fall through to "the first public plan" which
// is Free, producing the absurd "Upgrade to Free" CTA. Demo sessions must
// resolve their plan from the demo store and pick the next tier above it.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth.js';
import { useDemoStore } from '../src/stores/demo.js';
import { useUpgradeModalStore } from '../src/stores/upgradeModal.js';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('upgradeModal.openForGate — current plan resolution', () => {
  it('authed free user → upgradeTarget is premium (next tier)', () => {
    const auth = useAuthStore();
    auth.user = { id: 'u-1', email: 'free@x.com', plan: 'free' };
    const modal = useUpgradeModalStore();
    modal.openForGate({ featureKey: 'rolling7DayTargets' });
    expect(modal.denial.upgradePlan?.id).toBe('premium');
    expect(modal.denial.currentPlan).toBe('free');
  });

  it('authed premium user → upgradeTarget is unlimited', () => {
    const auth = useAuthStore();
    auth.user = { id: 'u-1', email: 'p@x.com', plan: 'premium' };
    const modal = useUpgradeModalStore();
    modal.openForGate({ featureKey: 'aiToolsEnabled' });
    expect(modal.denial.upgradePlan?.id).toBe('unlimited');
  });

  it('anon DEMO (sandbox unlimited) → no upgrade target, never resolves to Free', () => {
    const demo = useDemoStore();
    demo.mode = 'anon';
    demo.sandboxId = 'sb-1';
    demo.activePlanId = 'unlimited';

    const modal = useUpgradeModalStore();
    modal.openForGate({ featureKey: 'rolling7DayTargets' });

    // Sandbox is already on the top tier — there is no upgrade.
    expect(modal.denial.upgradePlan).toBeNull();
    expect(modal.denial.currentPlan).toBe('unlimited');
  });

  it('authed user in demo → uses demo plan (unlimited), not real plan (free)', () => {
    const auth = useAuthStore();
    auth.user = { id: 'u-1', email: 'real@x.com', plan: 'free' };
    const demo = useDemoStore();
    demo.mode = 'authed';
    demo.sandboxId = 'sb-1';
    demo.activePlanId = 'unlimited';

    const modal = useUpgradeModalStore();
    modal.openForGate({ featureKey: 'rolling7DayTargets' });
    expect(modal.denial.currentPlan).toBe('unlimited');
    expect(modal.denial.upgradePlan).toBeNull();
  });

  it('storage limit gate carries the cap value through', () => {
    const auth = useAuthStore();
    auth.user = { id: 'u-1', email: 'free@x.com', plan: 'free' };
    const modal = useUpgradeModalStore();
    modal.openForGate({ limitKey: 'customCompounds', used: 1 });
    expect(modal.denial.limitKey).toBe('customCompounds');
    expect(modal.denial.used).toBe(1);
    expect(typeof modal.denial.limit === 'number' || modal.denial.limit === null).toBe(true);
  });
});

describe('upgradeModal.openFromDenial — server-driven', () => {
  it('mirrors server denial body into the store', () => {
    const modal = useUpgradeModalStore();
    modal.openFromDenial({
      reason: 'plan_limit',
      limitKey: 'customCompounds',
      limit: 3,
      used: 3,
      currentPlan: 'premium',
      upgradePlanId: 'unlimited',
      message: 'You hit the cap.',
    });
    expect(modal.isOpen).toBe(true);
    expect(modal.denial.upgradePlan?.id).toBe('unlimited');
    expect(modal.denial.message).toBe('You hit the cap.');
  });

  it('handles missing upgradePlanId gracefully', () => {
    const modal = useUpgradeModalStore();
    modal.openFromDenial({ reason: 'plan_limit', currentPlan: 'unlimited' });
    expect(modal.denial.upgradePlan).toBeNull();
  });
});

describe('upgradeModal — close', () => {
  it('clears denial + isOpen', () => {
    const auth = useAuthStore();
    auth.user = { id: 'u-1', email: 'free@x.com', plan: 'free' };
    const modal = useUpgradeModalStore();
    modal.openForGate({ featureKey: 'rolling7DayTargets' });
    expect(modal.isOpen).toBe(true);
    modal.close();
    expect(modal.isOpen).toBe(false);
    expect(modal.denial).toBeNull();
  });
});
