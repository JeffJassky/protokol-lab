// Shared plan registry. Single source of truth for subscription tiers:
// marketing copy, pricing, Stripe IDs, feature flags, and per-plan limits.
// Importable from both server (Node ESM) and client (Vite) via relative path.
//
// Stripe IDs are split per-mode (`test` / `live`). The server auto-picks a
// mode from the Stripe secret key prefix so local dev with `sk_test_` keeps
// hitting test IDs even when live IDs are also checked in. Price IDs are not
// secret (they travel to the client for Checkout).

/**
 * @typedef {Object} PlanMarketing
 * @property {string} title             Display name, e.g. "Premium".
 * @property {string} tagline           One-line pitch shown under the title.
 * @property {string} description       Longer paragraph for marketing page.
 * @property {string[]} bestFor         Audience bullets ("Serious GLP-1 users", ...).
 * @property {string[]} featureList     Checkmark bullets for the pricing card.
 * @property {string|null} badge        "Most Popular", "Best Value", or null.
 * @property {string} ctaLabel          Button text ("Start Free", "Upgrade").
 * @property {string|null} highlightColor  CSS var or hex for accent.
 */

/**
 * @typedef {Object} StripeIds
 * @property {string|null} productId
 * @property {string|null} priceIdMonthly
 * @property {string|null} priceIdYearly
 */

/**
 * @typedef {Object} PlanPricing
 * @property {number} monthlyUsd                Display price per month.
 * @property {number|null} yearlyUsd            Display price per year (null = no annual).
 * @property {number|null} yearlyEffectiveMonthlyUsd  monthly equivalent of yearly.
 * @property {{test: StripeIds, live: StripeIds}} stripe  Per-mode Stripe IDs.
 *                                              Populate via `server/src/scripts/stripe-seed.js`.
 * @property {boolean} requiresCheckout         False for free/comp tiers.
 * @property {number} trialDays                 Free-trial length. 0 = no trial.
 *                                              Card is collected upfront; auto-
 *                                              charges at trial end.
 */

/**
 * @typedef {Object} PlanFeatures
 * Feature flags. Checked on both client (hide UI) and server (enforce).
 * @property {boolean} foodImageRecognition
 * @property {boolean} aiToolsEnabled        Agentic tools (meal edits, web search, lookups).
 * @property {boolean} rolling7DayTargets
 * @property {boolean} advancedSymptomAnalytics
 * @property {boolean} prioritySupport
 */

/**
 * @typedef {Object} ChatLimits
 * Set a limit to 0 to hard-disable that axis. Set to Infinity for "no cap".
 * @property {number} messagesPerMinute         Req/min rate limit on /api/chat.
 * @property {number} messagesPerDay            Hard cap per UTC day.
 * @property {number} inputTokensPerDay
 * @property {number} outputTokensPerDay
 * @property {number} costUsdPerDay             Dollar budget per UTC day.
 * @property {number} costUsdPerMonth           Dollar budget per calendar month.
 * @property {number} maxIterationsPerMessage   Agentic loop ceiling.
 * @property {number} maxSearchCallsPerMessage  Google Search invocations per msg.
 * @property {number} maxContextMessages        History trim cap sent to model.
 * @property {number} maxInputTokensPerMessage  Per-message prompt size cap.
 * @property {number} maxThreadCount            Total saved threads per user.
 * @property {number} imagesPerDay              Food-image recognition per UTC day.
 * @property {number} imagesLifetime            Lifetime total (used for free-tier teaser). Infinity for paid tiers.
 */

/**
 * @typedef {Object} StorageLimits
 * @property {number} customFoodItems
 * @property {number} savedMeals
 * @property {number} customCompounds
 * @property {number} photosPerMonth         Progress photo uploads per calendar month.
 *                                            1 = monthly. 4 = ~weekly. Infinity = no limit.
 * @property {number} maxCorrelationMetrics  Concurrent metrics on a correlation chart.
 */

/**
 * @typedef {Object} Plan
 * @property {string} id                Stable slug stored on User.plan.
 * @property {number} sortOrder         Display order on pricing page (low → high).
 * @property {boolean} isPublic         Shown on public pricing page.
 * @property {boolean} isDefault        Assigned to new users on signup.
 * @property {boolean} isAdminOnly      Only assignable by admins (comps, staff).
 * @property {PlanMarketing} marketing
 * @property {PlanPricing} pricing
 * @property {PlanFeatures} features
 * @property {ChatLimits} chat
 * @property {StorageLimits} storage
 */

export const PLAN_IDS = Object.freeze({
  FREE: 'free',
  PREMIUM: 'premium',
  UNLIMITED: 'unlimited',
});

const K = 1_000;

/** @type {Record<string, Plan>} */
export const PLANS = {
  [PLAN_IDS.FREE]: {
    id: PLAN_IDS.FREE,
    sortOrder: 10,
    isPublic: true,
    isDefault: true,
    isAdminOnly: false,
    marketing: {
      title: 'Free',
      tagline: 'Core tracking, forever.',
      description:
        'Log shots, weight, food, and symptoms with the basic toolkit. ' +
        'Great for getting started before committing.',
      bestFor: [
        'Trying the app before upgrading',
        'Light users logging 1–2x per day',
      ],
      featureList: [
        'Dose, weight, waist, and symptom logging',
        'Standard exponential decay chart',
        'Basic food search & manual entry',
        'One saved thread of notes',
      ],
      badge: null,
      ctaLabel: 'Start Free',
      highlightColor: null,
    },
    pricing: {
      monthlyUsd: 0,
      yearlyUsd: 0,
      yearlyEffectiveMonthlyUsd: 0,
      stripe: {
        test: { productId: null, priceIdMonthly: null, priceIdYearly: null },
        live: { productId: null, priceIdMonthly: null, priceIdYearly: null },
      },
      requiresCheckout: false,
      trialDays: 0,
    },
    features: {
      foodImageRecognition: false,
      aiToolsEnabled: false,
      rolling7DayTargets: false,
      advancedSymptomAnalytics: false,
      prioritySupport: false,
    },
    chat: {
      // Free tier: 5 text msgs/day + 3 lifetime food-photo recognitions.
      // Token/cost caps sized as a safety net around the 5-msg ceiling.
      messagesPerMinute: 2,
      messagesPerDay: 5,
      inputTokensPerDay: 50 * K,
      outputTokensPerDay: 10 * K,
      costUsdPerDay: 0.05,
      costUsdPerMonth: 0.5,
      maxIterationsPerMessage: 2,
      maxSearchCallsPerMessage: 0,
      maxContextMessages: 10,
      maxInputTokensPerMessage: 8 * K,
      maxThreadCount: 1,
      imagesPerDay: 0,
      imagesLifetime: 0,
    },
    storage: {
      customFoodItems: 25,
      savedMeals: 5,
      customCompounds: 0,
      photosPerMonth: 1,
      maxCorrelationMetrics: 2,
    },
  },

  [PLAN_IDS.PREMIUM]: {
    id: PLAN_IDS.PREMIUM,
    sortOrder: 20,
    isPublic: true,
    isDefault: false,
    isAdminOnly: false,
    marketing: {
      title: 'Premium',
      tagline: 'Full protocol intelligence.',
      description:
        'Unlock the AI coach, rolling 7-day macro targets, and advanced ' +
        'correlation analytics — the tools that turn logs into decisions.',
      bestFor: [
        'Serious GLP-1 / peptide users',
        'Anyone optimizing macros against dose timing',
        'Users sharing data with a physician',
      ],
      featureList: [
        'AI chat coach with your data in context',
        'Rolling 7-day macro targets',
        'Multi-metric correlation charts',
        '0–10 severity analytics',
        'Saved meals & unlimited threads',
        'Custom themes & data export (CSV/PDF)',
      ],
      badge: 'Most Popular',
      ctaLabel: 'Upgrade to Premium',
      highlightColor: 'var(--green)',
    },
    pricing: {
      monthlyUsd: 9.99,
      yearlyUsd: 79,
      yearlyEffectiveMonthlyUsd: 6.58,
      stripe: {
        test: {
          productId: 'prod_UOZychwDRAIymy',
          priceIdMonthly: 'price_1TPmoYEbNm7I4te2Cvi8vu2Q',
          priceIdYearly: 'price_1TPmoaEbNm7I4te2pmuwtJJZ',
        },
        live: {
          productId: 'prod_UOexviue15srEj',
          priceIdMonthly: 'price_1TPrdJEbNm7I4te2cwRSKfwX',
          priceIdYearly: 'price_1TPrdKEbNm7I4te2yhQqPncw',
        },
      },
      requiresCheckout: true,
      trialDays: 14,
    },
    features: {
      foodImageRecognition: true,
      aiToolsEnabled: true,
      rolling7DayTargets: true,
      advancedSymptomAnalytics: true,
      prioritySupport: false,
    },
    chat: {
      // Target: <40% of $9.99 MRR on AI cost. Gemini 3 Flash is cheap; these
      // caps give heavy users ~30-50 substantive msgs/day before throttle.
      messagesPerMinute: 10,
      messagesPerDay: 60,
      inputTokensPerDay: 800 * K,
      outputTokensPerDay: 150 * K,
      costUsdPerDay: 0.25,
      costUsdPerMonth: 2.0,
      maxIterationsPerMessage: 6,
      maxSearchCallsPerMessage: 2,
      maxContextMessages: 30,
      maxInputTokensPerMessage: 40 * K,
      maxThreadCount: 100,
      // Image cost per call is meaningful; cap daily to keep unit economics.
      imagesPerDay: 50,
      imagesLifetime: Infinity,
    },
    storage: {
      customFoodItems: 50,
      savedMeals: Infinity,
      customCompounds: 3,
      photosPerMonth: 4,
      maxCorrelationMetrics: Infinity,
    },
  },

  [PLAN_IDS.UNLIMITED]: {
    id: PLAN_IDS.UNLIMITED,
    sortOrder: 30,
    isPublic: true,
    isDefault: false,
    isAdminOnly: false,
    marketing: {
      title: 'Unlimited',
      tagline: 'Power-user AI, no caps.',
      description:
        'Everything in Premium plus uncapped AI chat, longer context ' +
        'windows, and priority support. For users who live in the coach.',
      bestFor: [
        'Heavy AI chat users',
        'Users running multiple concurrent protocols',
        'Anyone who hit Premium chat caps',
      ],
      featureList: [
        'Everything in Premium',
        'Unlimited AI messages per day',
        'Longer conversation context',
        'Food image recognition, uncapped',
        'Priority support',
      ],
      badge: 'Best Value',
      ctaLabel: 'Go Unlimited',
      highlightColor: 'var(--purple)',
    },
    pricing: {
      monthlyUsd: 19.99,
      yearlyUsd: 149,
      yearlyEffectiveMonthlyUsd: 12.42,
      stripe: {
        test: {
          productId: 'prod_UOZy7ERV0SymIH',
          priceIdMonthly: 'price_1TPmobEbNm7I4te2xz2qCrnh',
          priceIdYearly: 'price_1TPmodEbNm7I4te2WpXhy5HP',
        },
        live: {
          productId: 'prod_UOexIwebs45JdP',
          priceIdMonthly: 'price_1TPrdLEbNm7I4te2qK63j5TZ',
          priceIdYearly: 'price_1TPrdLEbNm7I4te2MK4Np2kX',
        },
      },
      requiresCheckout: true,
      trialDays: 14,
    },
    features: {
      foodImageRecognition: true,
      aiToolsEnabled: true,
      rolling7DayTargets: true,
      advancedSymptomAnalytics: true,
      prioritySupport: true,
    },
    chat: {
      messagesPerMinute: 60,
      messagesPerDay: Infinity,
      inputTokensPerDay: Infinity,
      outputTokensPerDay: Infinity,
      costUsdPerDay: Infinity,
      costUsdPerMonth: Infinity,
      maxIterationsPerMessage: 8,
      maxSearchCallsPerMessage: 4,
      maxContextMessages: 60,
      maxInputTokensPerMessage: 100 * K,
      maxThreadCount: Infinity,
      imagesPerDay: Infinity,
      imagesLifetime: Infinity,
    },
    storage: {
      customFoodItems: Infinity,
      savedMeals: Infinity,
      customCompounds: Infinity,
      photosPerMonth: Infinity,
      maxCorrelationMetrics: Infinity,
    },
  },
};

/** Plan id assigned to new users. */
export const DEFAULT_PLAN_ID =
  Object.values(PLANS).find((p) => p.isDefault)?.id ?? PLAN_IDS.FREE;

/**
 * Look up a plan by id. Unknown ids fall back to the default plan so a stale
 * User.plan value never crashes a feature check.
 * @param {string|null|undefined} planId
 * @returns {Plan}
 */
export function getPlan(planId) {
  if (planId && PLANS[planId]) return PLANS[planId];
  return PLANS[DEFAULT_PLAN_ID];
}

/**
 * @param {{plan?: string}|null|undefined} user
 * @returns {Plan}
 */
export function getPlanForUser(user) {
  return getPlan(user?.plan);
}

/**
 * Plans to render on the public pricing page, in sort order.
 * @returns {Plan[]}
 */
export function getPublicPlans() {
  return Object.values(PLANS)
    .filter((p) => p.isPublic)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * @param {{plan?: string}|null|undefined} user
 * @param {keyof PlanFeatures} featureKey
 * @returns {boolean}
 */
export function hasFeature(user, featureKey) {
  return getPlanForUser(user).features[featureKey] === true;
}

/**
 * Derive Stripe mode ('test' | 'live') from a secret key. `sk_live_` → live,
 * anything else (including missing key) → test. Keeps mode resolution in one
 * place so routes and the seed script agree.
 * @param {string|null|undefined} secretKey
 * @returns {'test'|'live'}
 */
export function resolveStripeMode(secretKey) {
  return typeof secretKey === 'string' && secretKey.startsWith('sk_live_')
    ? 'live'
    : 'test';
}

/**
 * Stripe IDs for a plan in the given mode. Always returns an object with
 * null fields if the plan is free or the mode block is missing.
 * @param {string} planId
 * @param {'test'|'live'} mode
 * @returns {StripeIds}
 */
export function getStripeIds(planId, mode) {
  const plan = PLANS[planId];
  const ids = plan?.pricing?.stripe?.[mode];
  return ids || { productId: null, priceIdMonthly: null, priceIdYearly: null };
}

/**
 * Resolve a Stripe price id from a plan id + interval + mode. Returns null
 * if the plan is free, the interval isn't offered, or the mode is unseeded.
 * @param {string} planId
 * @param {'monthly'|'yearly'} interval
 * @param {'test'|'live'} mode
 * @returns {string|null}
 */
export function getStripePriceId(planId, interval, mode) {
  const ids = getStripeIds(planId, mode);
  return interval === 'yearly' ? ids.priceIdYearly : ids.priceIdMonthly;
}

/**
 * Reverse lookup: find the plan id for a given Stripe price id in the given
 * mode. Used in Stripe webhook handlers to assign User.plan after checkout.
 * @param {string} stripePriceId
 * @param {'test'|'live'} mode
 * @returns {string|null}
 */
export function getPlanIdByStripePriceId(stripePriceId, mode) {
  for (const plan of Object.values(PLANS)) {
    const ids = plan.pricing?.stripe?.[mode];
    if (!ids) continue;
    if (ids.priceIdMonthly === stripePriceId || ids.priceIdYearly === stripePriceId) {
      return plan.id;
    }
  }
  return null;
}
