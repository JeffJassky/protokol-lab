// Plan limits — verifies usePlanLimits resolves the right plan across the
// session-state matrix from docs/blog/customer-journey.md §1.
//
// Specifically locks in the regression that hit production twice: when
// auth.user is null (anon demo), the composable must fall through to the
// demo store's activePlanId — not default to Free, which made every paid
// feature fire an upsell inside the demo.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth.js';
import { useDemoStore } from '../src/stores/demo.js';
import { usePlanLimits } from '../src/composables/usePlanLimits.js';

function setAnonDemo({ planId = 'unlimited' } = {}) {
  const demo = useDemoStore();
  demo.mode = 'anon';
  demo.sandboxId = 'sb-1';
  demo.activePlanId = planId;
}

function setAuthedRealUser({ planId = 'free' } = {}) {
  const auth = useAuthStore();
  auth.user = { id: 'u-1', email: 'real@example.com', plan: planId };
}

function setAuthedInDemo({ realPlanId = 'free', demoPlanId = 'unlimited' } = {}) {
  const auth = useAuthStore();
  auth.user = { id: 'u-1', email: 'real@example.com', plan: realPlanId };
  const demo = useDemoStore();
  demo.mode = 'authed';
  demo.sandboxId = 'sb-1';
  demo.activePlanId = demoPlanId;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('usePlanLimits — visitor state matrix', () => {
  it('anon visitor (no auth, no demo) → resolves to free plan', () => {
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('free');
  });

  it('anon DEMO → resolves to sandbox plan (unlimited)', () => {
    setAnonDemo({ planId: 'unlimited' });
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('unlimited');
    // The class-of-bug we're locking in: rolling7DayTargets must NOT be
    // gated for demo visitors. Sandbox is on unlimited, so the feature
    // flag should be on and no upsell should render.
    expect(limits.hasFeature('rolling7DayTargets')).toBe(true);
  });

  it('authed user (no toggle) on free plan → resolves to free', () => {
    setAuthedRealUser({ planId: 'free' });
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('free');
    expect(limits.hasFeature('rolling7DayTargets')).toBe(false);
  });

  it('authed user (no toggle) on premium → resolves to premium', () => {
    setAuthedRealUser({ planId: 'premium' });
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('premium');
  });

  it('authed user IN DEMO → demo plan wins, even if real plan is free', () => {
    setAuthedInDemo({ realPlanId: 'free', demoPlanId: 'unlimited' });
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('unlimited');
  });

  it('falls back to auth.user plan if demo.activePlanId is unset', () => {
    setAuthedRealUser({ planId: 'premium' });
    const demo = useDemoStore();
    demo.mode = 'authed';
    demo.sandboxId = 'sb-1';
    demo.activePlanId = null; // server didn't surface a plan
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('premium');
  });

  it('reactive: flipping demo.activePlanId updates the resolved plan', async () => {
    setAnonDemo({ planId: 'free' });
    const limits = usePlanLimits();
    expect(limits.plan.value.id).toBe('free');

    const demo = useDemoStore();
    demo.activePlanId = 'unlimited';
    expect(limits.plan.value.id).toBe('unlimited');
  });
});
