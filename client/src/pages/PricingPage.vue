<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import MarketingLayout from '../components/MarketingLayout.vue';
import { useAuthStore } from '../stores/auth.js';
import { startCheckout } from '../api/stripe.js';
import { PLANS, PLAN_IDS } from '../../../shared/plans.js';
import { useRouteSeo } from '../composables/useSeo.js';
import '../styles/marketing.css';

const router = useRouter();
const auth = useAuthStore();
const checkoutErr = ref('');
const billingInterval = ref('yearly');

const premium = PLANS[PLAN_IDS.PREMIUM];
const unlimited = PLANS[PLAN_IDS.UNLIMITED];

function monthlyDisplay(plan) {
  const v = billingInterval.value === 'yearly'
    ? plan.pricing.yearlyEffectiveMonthlyUsd
    : plan.pricing.monthlyUsd;
  return v.toFixed(2);
}
function priceNote(plan) {
  const save = Math.round(plan.pricing.monthlyUsd * 12 - plan.pricing.yearlyUsd);
  const yr = plan.pricing.yearlyUsd;
  return billingInterval.value === 'yearly'
    ? `Billed as $${yr}/year — save $${save}`
    : `$${yr}/year — save $${save} on annual`;
}
const annualSavePct = computed(() => {
  const p = premium.pricing;
  if (!p.monthlyUsd || !p.yearlyUsd) return 0;
  return Math.round((1 - p.yearlyUsd / (p.monthlyUsd * 12)) * 100);
});

async function goRegister(planId, interval) {
  checkoutErr.value = '';
  if (!planId) { router.push('/register'); return; }
  if (auth.user) {
    try { await startCheckout(planId, interval || 'monthly'); }
    catch (err) { checkoutErr.value = err.message || 'Could not open checkout'; }
    return;
  }
  router.push({ path: '/register', query: { plan: planId, interval: interval || 'monthly' } });
}

useRouteSeo();
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">Pricing</div>
        <h1 class="mkt-h1">Simple.<br /><span class="accent">Honest. Cheap.</span></h1>
        <p class="mkt-lead">
          Free forever for the core tracker. Premium and Unlimited unlock the
          AI coach, correlation charts, unlimited custom compounds, cloud
          sync, and full data export. 14-day free trial on paid plans — cancel
          before it ends and you're not charged.
        </p>

        <div class="price-toggle" role="tablist" aria-label="Billing interval">
          <button type="button" class="price-toggle-btn" :class="{ active: billingInterval === 'monthly' }" role="tab" :aria-selected="billingInterval === 'monthly'" @click="billingInterval = 'monthly'">Monthly</button>
          <button type="button" class="price-toggle-btn" :class="{ active: billingInterval === 'yearly' }" role="tab" :aria-selected="billingInterval === 'yearly'" @click="billingInterval = 'yearly'">Yearly <span class="save-tag">save {{ annualSavePct }}%</span></button>
        </div>

        <div class="price-cards">
          <div class="price-card">
            <div class="price-kind">Free</div>
            <div class="price-amount">$0<span class="per"> / forever</span></div>
            <p class="price-desc">Enough to actually run your week. No credit card, no trial timer.</p>
            <ul class="price-feats">
              <li>Food log, meals, barcode scan</li>
              <li>Weight and waist tracking</li>
              <li>Symptoms and day notes</li>
              <li>Dose tracking with half-life curves</li>
              <li>Up to 3 compounds</li>
              <li>Progress photos with side-by-side compare</li>
            </ul>
            <button class="mkt-btn-secondary wide" @click="goRegister()">Get started</button>
          </div>

          <div class="price-card featured">
            <div class="price-kind accent">Premium</div>
            <div class="price-amount">${{ monthlyDisplay(premium) }}<span class="per"> / month</span></div>
            <p class="price-desc">Everything in Free, plus the tools that turn your data into answers.</p>
            <ul class="price-feats">
              <li>AI chat that reads your full log</li>
              <li>Rolling 7-day macro targets</li>
              <li>Correlation charts, any two metrics</li>
              <li>Deeper dose charts and stats</li>
              <li>Up to 20 custom compounds</li>
              <li>Saved meals, cloud sync, data export</li>
            </ul>
            <button class="mkt-btn-primary wide" @click="goRegister(premium.id, billingInterval)">Start {{ premium.pricing.trialDays }}-day free trial →</button>
            <div class="price-trial-note">{{ priceNote(premium) }}</div>
          </div>

          <div class="price-card">
            <div class="price-kind">Unlimited</div>
            <div class="price-amount">${{ monthlyDisplay(unlimited) }}<span class="per"> / month</span></div>
            <p class="price-desc">Everything in Premium, AI uncapped. For users who live in the chat.</p>
            <ul class="price-feats">
              <li>Unlimited AI messages per day</li>
              <li>Longer conversation context</li>
              <li>Food image recognition, uncapped</li>
              <li>Unlimited custom compounds</li>
              <li>Priority support</li>
            </ul>
            <button class="mkt-btn-secondary wide" @click="goRegister(unlimited.id, billingInterval)">Start {{ unlimited.pricing.trialDays }}-day free trial →</button>
            <div class="price-trial-note">{{ priceNote(unlimited) }}</div>
          </div>
        </div>

        <div v-if="checkoutErr" class="err">{{ checkoutErr }}</div>

        <h2 class="mkt-h2">What's in each tier</h2>
        <table class="mkt-table">
          <thead>
            <tr><th>Feature</th><th>Free</th><th>Premium</th><th>Unlimited</th></tr>
          </thead>
          <tbody>
            <tr><td>Dose tracking with half-life curves</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Food log, barcode scan, meals</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Weight, waist, symptoms, notes</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Progress photos</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Custom compounds</td><td>3</td><td>20</td><td>Unlimited</td></tr>
            <tr><td>AI chat coach</td><td>—</td><td>60 msgs/day</td><td>Unlimited</td></tr>
            <tr><td>Rolling 7-day macro targets</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Correlation charts</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Food image recognition</td><td>—</td><td>Limited</td><td>Unlimited</td></tr>
            <tr><td>Cloud sync + data export</td><td>—</td><td>✓</td><td>✓</td></tr>
            <tr><td>Priority support</td><td>—</td><td>—</td><td>✓</td></tr>
          </tbody>
        </table>

        <h2 class="mkt-h2">Pricing FAQ</h2>
        <div class="faq-item"><h3 class="faq-q">Is there a free trial?</h3><p class="faq-body">Yes. Both Premium and Unlimited include a 14-day free trial. Your card is collected upfront and charged at trial end. Cancel any time before trial ends and you're not charged.</p></div>
        <div class="faq-item"><h3 class="faq-q">Can I cancel anytime?</h3><p class="faq-body">Yes. Cancel from Settings. Access continues through the end of the paid period. No hidden fees.</p></div>
        <div class="faq-item"><h3 class="faq-q">Can I switch between Premium and Unlimited?</h3><p class="faq-body">Yes. Upgrades are prorated immediately. Downgrades take effect at the end of the current billing cycle.</p></div>
        <div class="faq-item"><h3 class="faq-q">Does Free work with Mounjaro, Zepbound, Ozempic, Wegovy?</h3><p class="faq-body">Yes. Free includes full dose tracking with half-life curves for all built-in GLP-1 compounds.</p></div>
        <div class="faq-item"><h3 class="faq-q">Do I need Premium to track compounded peptides?</h3><p class="faq-body">No. Free supports up to 3 custom compounds — enough for most compounded GLP-1 users. Premium raises the cap to 20, Unlimited is unlimited.</p></div>
        <div class="faq-item"><h3 class="faq-q">How do you handle refunds?</h3><p class="faq-body">Cancel before your 14-day trial ends and you pay nothing. After that, we'll refund on request within 7 days of an accidental renewal — email support.</p></div>
      </div>
    </section>
  </MarketingLayout>
</template>

<style scoped>
.price-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  margin: 8px 0 32px;
}
.price-toggle-btn {
  background: transparent;
  border: none;
  padding: 10px 20px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  cursor: pointer;
}
.price-toggle-btn.active { background: var(--primary); color: var(--bg); }
.save-tag {
  margin-left: 6px;
  font-size: 10px;
  color: var(--primary);
}
.price-toggle-btn.active .save-tag { color: var(--bg); }

.price-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  margin-bottom: 48px;
}
.price-card {
  border: 1px solid var(--border);
  padding: 28px 24px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
}
.price-card.featured { border-color: var(--primary); }
.price-kind {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}
.price-kind.accent { color: var(--primary); }
.price-amount {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 12px;
}
.price-amount .per {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-tertiary);
}
.price-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 20px;
  min-height: 60px;
}
.price-feats {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
  flex: 1;
}
.price-feats li::before { content: '✓  '; color: var(--primary); }
.wide { width: 100%; }
.price-trial-note {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 10px;
  text-align: center;
}
.err { color: var(--color-carbs); margin-top: 16px; font-size: 13px; }
</style>
