<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  startCheckout,
  openBillingPortal,
  fetchSubscription,
} from '../../api/stripe.js';
import { getPublicPlans, PLAN_IDS } from '../../../../shared/plans.js';

const route = useRoute();
const router = useRouter();

const subscription = ref(null);
const subLoading = ref(true);
const billingInterval = ref('yearly');
const checkoutBusy = ref(null); // holds planId while redirecting
const portalBusy = ref(false);
const subBanner = ref(null); // { kind: 'success'|'cancel', msg }

const publicPlans = getPublicPlans();
const paidPlans = publicPlans.filter((p) => p.pricing.requiresCheckout);
const currentPlanId = computed(() => subscription.value?.plan?.id || PLAN_IDS.FREE);
const currentPlan = computed(
  () => publicPlans.find((p) => p.id === currentPlanId.value) || null,
);
const isPaidNow = computed(() => currentPlanId.value !== PLAN_IDS.FREE);
const trialEndsAt = computed(() => {
  // planExpiresAt is a trial end only when the sub hasn't been permanently
  // activated yet. Otherwise it's a cancel-at-period-end marker.
  if (!subscription.value?.planExpiresAt) return null;
  if (!subscription.value?.planActivatedAt) return null;
  return new Date(subscription.value.planExpiresAt);
});

function priceFor(plan) {
  return billingInterval.value === 'yearly'
    ? plan.pricing.yearlyUsd
    : plan.pricing.monthlyUsd;
}
function priceLabelFor(plan) {
  if (billingInterval.value === 'yearly') {
    return `$${plan.pricing.yearlyEffectiveMonthlyUsd.toFixed(2)}/mo, billed annually`;
  }
  return `$${plan.pricing.monthlyUsd.toFixed(2)}/mo`;
}

const annualSavePct = computed(() => {
  let best = 0;
  for (const p of paidPlans) {
    const { monthlyUsd, yearlyUsd } = p.pricing;
    if (!monthlyUsd || !yearlyUsd) continue;
    const pct = Math.round((1 - yearlyUsd / (monthlyUsd * 12)) * 100);
    if (pct > best) best = pct;
  }
  return best;
});

async function loadSubscription() {
  subLoading.value = true;
  try {
    subscription.value = await fetchSubscription();
  } catch {
    subscription.value = null;
  } finally {
    subLoading.value = false;
  }
}

async function handleUpgrade(planId) {
  checkoutBusy.value = planId;
  try {
    await startCheckout(planId, billingInterval.value);
  } catch (err) {
    checkoutBusy.value = null;
    subBanner.value = { kind: 'cancel', msg: err.message || 'Could not start checkout' };
  }
}

async function handleManageBilling() {
  portalBusy.value = true;
  try {
    await openBillingPortal();
  } catch (err) {
    portalBusy.value = false;
    subBanner.value = { kind: 'cancel', msg: err.message || 'Could not open billing portal' };
  }
}

// Handle ?checkout=success|cancel from Stripe's redirect. Webhook may not have
// landed yet, so poll the subscription endpoint a few times before giving up.
async function reconcileFromQuery() {
  if (route.query.interval === 'yearly' || route.query.interval === 'monthly') {
    billingInterval.value = route.query.interval;
  }
  if (route.query.plan && route.query.plan === currentPlanId.value) {
    subBanner.value = {
      kind: 'success',
      msg: `You’re already on ${currentPlan.value?.marketing?.title || route.query.plan}.`,
    };
  }

  const flag = route.query.checkout;
  if (flag === 'cancel') {
    subBanner.value = { kind: 'cancel', msg: 'Checkout canceled — no charge was made.' };
  } else if (flag === 'success') {
    subBanner.value = { kind: 'success', msg: 'You’re in! Welcome to the upgrade.' };
    for (let i = 0; i < 6; i += 1) {
      await loadSubscription();
      if (isPaidNow.value) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (route.query.checkout || route.query.plan || route.query.interval || route.query.session_id) {
    router.replace({
      query: {
        ...route.query,
        checkout: undefined,
        session_id: undefined,
        plan: undefined,
        interval: undefined,
      },
    });
  }
}

onMounted(async () => {
  await loadSubscription();
  await reconcileFromQuery();
});
</script>

<template>
  <div class="subscription-page">
    <div class="head">
      <router-link to="/profile/settings/account" class="back-link" aria-label="Back">‹ Account</router-link>
      <h2 class="page-title">Subscription</h2>
    </div>

    <div v-if="subBanner" class="sub-banner" :class="subBanner.kind">
      {{ subBanner.msg }}
      <button type="button" class="sub-banner-dismiss" @click="subBanner = null" aria-label="Dismiss">×</button>
    </div>

    <div class="card">
      <div v-if="subLoading" class="sub-loading">Loading…</div>

      <template v-else>
        <div class="sub-current">
          <div class="sub-current-row">
            <span class="sub-current-label">Current plan</span>
            <span class="sub-current-value">{{ currentPlan?.marketing?.title || 'Free' }}</span>
          </div>
          <div v-if="trialEndsAt" class="sub-current-row">
            <span class="sub-current-label">Trial ends</span>
            <span class="sub-current-value">{{ trialEndsAt.toLocaleDateString() }}</span>
          </div>
          <div v-else-if="subscription?.planExpiresAt" class="sub-current-row">
            <span class="sub-current-label">Renews / ends</span>
            <span class="sub-current-value">
              {{ new Date(subscription.planExpiresAt).toLocaleDateString() }}
            </span>
          </div>
        </div>

        <div v-if="isPaidNow && subscription?.hasStripeCustomer" class="sub-actions">
          <button
            type="button"
            class="btn-secondary"
            :disabled="portalBusy"
            @click="handleManageBilling"
          >
            {{ portalBusy ? 'Opening…' : 'Manage billing' }}
          </button>
          <p class="sub-hint">
            Change plan, update card, or cancel anytime in the Stripe billing portal.
          </p>
        </div>

        <div v-else class="sub-upgrade">
          <div class="sub-interval-toggle" role="tablist" aria-label="Billing interval">
            <button
              type="button"
              class="sub-interval-btn"
              :class="{ active: billingInterval === 'monthly' }"
              @click="billingInterval = 'monthly'"
            >Monthly</button>
            <button
              type="button"
              class="sub-interval-btn"
              :class="{ active: billingInterval === 'yearly' }"
              @click="billingInterval = 'yearly'"
            >Yearly <span class="sub-save-tag">save {{ annualSavePct }}%</span></button>
          </div>

          <div class="sub-plans">
            <div
              v-for="plan in paidPlans"
              :key="plan.id"
              class="sub-plan"
              :class="{ featured: plan.marketing.badge === 'Most Popular' }"
            >
              <div v-if="plan.marketing.badge" class="sub-plan-badge">{{ plan.marketing.badge }}</div>
              <div class="sub-plan-title">{{ plan.marketing.title }}</div>
              <div class="sub-plan-tagline">{{ plan.marketing.tagline }}</div>
              <div class="sub-plan-price">
                ${{ priceFor(plan).toFixed(plan.pricing.monthlyUsd % 1 ? 2 : 0) }}
                <span class="sub-plan-per">
                  / {{ billingInterval === 'yearly' ? 'year' : 'month' }}
                </span>
              </div>
              <div class="sub-plan-effective">{{ priceLabelFor(plan) }}</div>
              <ul class="sub-plan-feats">
                <li v-for="feat in plan.marketing.featureList" :key="feat">{{ feat }}</li>
              </ul>
              <button
                type="button"
                class="btn-primary wide"
                :disabled="checkoutBusy !== null"
                @click="handleUpgrade(plan.id)"
              >
                <span v-if="checkoutBusy === plan.id">Opening checkout…</span>
                <span v-else-if="plan.pricing.trialDays > 0">
                  Start {{ plan.pricing.trialDays }}-day free trial
                </span>
                <span v-else>Upgrade to {{ plan.marketing.title }}</span>
              </button>
            </div>
          </div>

          <p class="sub-hint">
            Card collected upfront. Cancel anytime during the trial — you won’t be charged.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.subscription-page { max-width: 720px; }
.head {
  padding: var(--space-5) var(--space-5) 0;
  margin-bottom: var(--space-4);
}
.back-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-2);
  padding: var(--space-1) 0;
}
.back-link:hover { color: var(--text); }
.page-title { margin: 0; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
}

.sub-banner {
  position: relative;
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  border-radius: var(--radius-medium);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
}
.sub-banner.success {
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
  color: var(--text);
}
.sub-banner.cancel {
  background: color-mix(in srgb, var(--text-tertiary) 8%, var(--surface));
  color: var(--text-secondary);
}
.sub-banner-dismiss {
  position: absolute;
  top: 4px;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
}

.sub-loading {
  color: var(--text-tertiary);
  font-size: var(--font-size-s);
}

.sub-current {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-4);
}
.sub-current-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--font-size-s);
}
.sub-current-label {
  color: var(--text-tertiary);
  text-transform: uppercase;
  font-size: var(--font-size-xs);
  letter-spacing: var(--tracking-wider);
}
.sub-current-value {
  color: var(--text);
  font-weight: var(--font-weight-medium);
}

.sub-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sub-hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.sub-interval-toggle {
  display: inline-flex;
  align-self: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 2px;
  gap: 2px;
  margin-bottom: var(--space-4);
}
.sub-interval-btn {
  padding: 0.4rem 0.9rem;
  background: none;
  border: none;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.sub-interval-btn.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
.sub-save-tag {
  font-size: var(--font-size-xxs, 10px);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--success);
  font-weight: var(--font-weight-bold);
}

.sub-upgrade {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sub-plans {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  width: 100%;
}
@media (min-width: 520px) {
  .sub-plans { grid-template-columns: 1fr 1fr; }
}

.sub-plan {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
}
.sub-plan.featured {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}
.sub-plan-badge {
  position: absolute;
  top: -9px;
  left: var(--space-3);
  padding: 2px 8px;
  background: var(--primary);
  color: var(--surface);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  border-radius: var(--radius-small);
}
.sub-plan-title {
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
}
.sub-plan-tagline {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.sub-plan-price {
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  margin-top: var(--space-2);
}
.sub-plan-per {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}
.sub-plan-effective {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.sub-plan-feats {
  list-style: none;
  padding: 0;
  margin: var(--space-2) 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sub-plan-feats li {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  padding-left: 18px;
  position: relative;
}
.sub-plan-feats li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--success);
  font-weight: var(--font-weight-bold);
}
</style>
