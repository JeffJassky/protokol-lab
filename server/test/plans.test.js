// Contract tests for shared/plans.js. This file is dual-consumed by client
// + server, so drift between it and reality = paid-feature leak or false
// denial. Keep assertions about the *shape* and *invariants*, not specific
// numbers (those change with pricing).

import { describe, it, expect } from 'vitest';
import {
  PLAN_IDS,
  PLANS,
  DEFAULT_PLAN_ID,
  getPlan,
  getPlanForUser,
  getPublicPlans,
  hasFeature,
  resolveStripeMode,
  getStripeIds,
  getStripePriceId,
  getPlanIdByStripePriceId,
} from '../../shared/plans.js';

const REQUIRED_FEATURE_KEYS = [
  'foodImageRecognition',
  'aiToolsEnabled',
  'rolling7DayTargets',
  'advancedSymptomAnalytics',
  'prioritySupport',
];

const REQUIRED_CHAT_KEYS = [
  'messagesPerMinute', 'messagesPerDay',
  'inputTokensPerDay', 'outputTokensPerDay',
  'costUsdPerDay', 'costUsdPerMonth',
  'maxIterationsPerMessage', 'maxSearchCallsPerMessage',
  'maxContextMessages', 'maxInputTokensPerMessage',
  'maxThreadCount', 'imagesPerDay', 'imagesLifetime',
];

const REQUIRED_STORAGE_KEYS = [
  'customFoodItems', 'savedMeals', 'customCompounds',
  'photosPerMonth', 'maxCorrelationMetrics',
];

describe('PLAN_IDS / DEFAULT_PLAN_ID', () => {
  it('has expected public ids', () => {
    expect(PLAN_IDS).toMatchObject({
      FREE: 'free',
      PREMIUM: 'premium',
      UNLIMITED: 'unlimited',
    });
  });

  it('DEFAULT_PLAN_ID points to a real plan flagged isDefault', () => {
    expect(PLANS[DEFAULT_PLAN_ID]).toBeDefined();
    expect(PLANS[DEFAULT_PLAN_ID].isDefault).toBe(true);
  });

  it('exactly one plan is flagged isDefault', () => {
    const defaults = Object.values(PLANS).filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
  });
});

describe('PLANS shape', () => {
  for (const [id, plan] of Object.entries(PLANS)) {
    describe(`plan "${id}"`, () => {
      it('id matches key', () => {
        expect(plan.id).toBe(id);
      });

      it('has marketing with title, ctaLabel, featureList[]', () => {
        expect(plan.marketing.title).toBeTypeOf('string');
        expect(plan.marketing.ctaLabel).toBeTypeOf('string');
        expect(Array.isArray(plan.marketing.featureList)).toBe(true);
      });

      it('has complete features flagset (no missing keys)', () => {
        for (const key of REQUIRED_FEATURE_KEYS) {
          expect(plan.features, `missing feature "${key}" on plan "${id}"`)
            .toHaveProperty(key);
          expect(typeof plan.features[key]).toBe('boolean');
        }
      });

      it('has complete chat limits', () => {
        for (const key of REQUIRED_CHAT_KEYS) {
          expect(plan.chat, `missing chat limit "${key}" on plan "${id}"`)
            .toHaveProperty(key);
          expect(typeof plan.chat[key]).toBe('number');
        }
      });

      it('has complete storage limits', () => {
        for (const key of REQUIRED_STORAGE_KEYS) {
          expect(plan.storage, `missing storage limit "${key}" on plan "${id}"`)
            .toHaveProperty(key);
          expect(typeof plan.storage[key]).toBe('number');
        }
      });

      it('has pricing with test + live Stripe mode blocks', () => {
        expect(plan.pricing.stripe).toHaveProperty('test');
        expect(plan.pricing.stripe).toHaveProperty('live');
      });

      it('requiresCheckout matches monthlyUsd > 0', () => {
        const paid = plan.pricing.monthlyUsd > 0;
        expect(plan.pricing.requiresCheckout).toBe(paid);
      });
    });
  }
});

describe('paid plans — Stripe IDs', () => {
  const paidIds = Object.values(PLANS)
    .filter((p) => p.pricing.requiresCheckout)
    .map((p) => p.id);

  for (const id of paidIds) {
    it(`plan "${id}" has test + live monthly price ids`, () => {
      expect(getStripePriceId(id, 'monthly', 'test')).toBeTruthy();
      expect(getStripePriceId(id, 'monthly', 'live')).toBeTruthy();
    });

    it(`plan "${id}" has test + live yearly price ids`, () => {
      expect(getStripePriceId(id, 'yearly', 'test')).toBeTruthy();
      expect(getStripePriceId(id, 'yearly', 'live')).toBeTruthy();
    });
  }

  it('price ids are unique across plans per mode', () => {
    for (const mode of ['test', 'live']) {
      const ids = [];
      for (const p of Object.values(PLANS)) {
        const s = getStripeIds(p.id, mode);
        if (s.priceIdMonthly) ids.push(s.priceIdMonthly);
        if (s.priceIdYearly) ids.push(s.priceIdYearly);
      }
      expect(new Set(ids).size, `duplicate stripe ids in mode ${mode}`).toBe(ids.length);
    }
  });

  it('getPlanIdByStripePriceId round-trips for every paid plan/interval/mode', () => {
    for (const id of paidIds) {
      for (const mode of ['test', 'live']) {
        for (const interval of ['monthly', 'yearly']) {
          const priceId = getStripePriceId(id, interval, mode);
          expect(getPlanIdByStripePriceId(priceId, mode)).toBe(id);
        }
      }
    }
  });
});

describe('resolveStripeMode', () => {
  it('live only for sk_live_ prefix', () => {
    expect(resolveStripeMode('sk_live_abc')).toBe('live');
    expect(resolveStripeMode('sk_test_abc')).toBe('test');
    expect(resolveStripeMode('rk_live_abc')).toBe('test');
    expect(resolveStripeMode(null)).toBe('test');
    expect(resolveStripeMode(undefined)).toBe('test');
    expect(resolveStripeMode('')).toBe('test');
  });
});

describe('limits — monotonic across tiers', () => {
  // Premium should be at least as generous as Free on every numeric axis.
  // Unlimited should be at least as generous as Premium. We allow equality
  // (some limits are Infinity on both paid plans).
  const free = PLANS[PLAN_IDS.FREE];
  const premium = PLANS[PLAN_IDS.PREMIUM];
  const unlimited = PLANS[PLAN_IDS.UNLIMITED];

  for (const key of REQUIRED_CHAT_KEYS) {
    it(`chat.${key} is monotonic free ≤ premium ≤ unlimited`, () => {
      expect(premium.chat[key]).toBeGreaterThanOrEqual(free.chat[key]);
      expect(unlimited.chat[key]).toBeGreaterThanOrEqual(premium.chat[key]);
    });
  }

  for (const key of REQUIRED_STORAGE_KEYS) {
    it(`storage.${key} is monotonic free ≤ premium ≤ unlimited`, () => {
      expect(premium.storage[key]).toBeGreaterThanOrEqual(free.storage[key]);
      expect(unlimited.storage[key]).toBeGreaterThanOrEqual(premium.storage[key]);
    });
  }
});

describe('helpers', () => {
  it('getPlan returns default for unknown id', () => {
    const p = getPlan('totally-made-up-plan');
    expect(p.id).toBe(DEFAULT_PLAN_ID);
  });

  it('getPlan returns exact plan for known id', () => {
    expect(getPlan(PLAN_IDS.PREMIUM).id).toBe(PLAN_IDS.PREMIUM);
  });

  it('getPlanForUser honors user.plan', () => {
    expect(getPlanForUser({ plan: PLAN_IDS.UNLIMITED }).id).toBe(PLAN_IDS.UNLIMITED);
    expect(getPlanForUser({}).id).toBe(DEFAULT_PLAN_ID);
    expect(getPlanForUser(null).id).toBe(DEFAULT_PLAN_ID);
  });

  it('getPublicPlans returns only isPublic plans, sorted by sortOrder', () => {
    const pub = getPublicPlans();
    expect(pub.every((p) => p.isPublic)).toBe(true);
    for (let i = 1; i < pub.length; i++) {
      expect(pub[i].sortOrder).toBeGreaterThanOrEqual(pub[i - 1].sortOrder);
    }
  });

  it('hasFeature checks plan features against user', () => {
    const premiumUser = { plan: PLAN_IDS.PREMIUM };
    const freeUser = { plan: PLAN_IDS.FREE };
    expect(hasFeature(premiumUser, 'rolling7DayTargets')).toBe(
      PLANS[PLAN_IDS.PREMIUM].features.rolling7DayTargets,
    );
    expect(hasFeature(freeUser, 'rolling7DayTargets')).toBe(
      PLANS[PLAN_IDS.FREE].features.rolling7DayTargets,
    );
  });
});
