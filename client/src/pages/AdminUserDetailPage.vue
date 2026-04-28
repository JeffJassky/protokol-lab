<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchAdminUserDetail,
  updateUserPlan,
  syncUserFromStripe,
} from '../api/admin.js';
import { PLANS, PLAN_IDS } from '../../../shared/plans.js';

const route = useRoute();
const router = useRouter();

const userId = computed(() => route.params.id);
const days = ref(30);
const loading = ref(true);
const error = ref(null);
const data = ref(null);
const actionBusy = ref(null);
const actionBanner = ref(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchAdminUserDetail(userId.value, { days: days.value });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(userId, load);

const user = computed(() => data.value?.user);
const plan = computed(() => data.value?.plan);
const currentLimits = computed(() => data.value?.currentLimits || {});
const currentFeatures = computed(() => data.value?.currentFeatures || {});
const usageNow = computed(() => data.value?.usageNow || {});
const chatTotals = computed(() => data.value?.chatTotals || {});
const chatByDay = computed(() => data.value?.chatByDay || []);
const recentMessages = computed(() => data.value?.recentMessages || []);
const stripe = computed(() => data.value?.stripe || null);
const funnelEvents = computed(() => data.value?.funnelEvents || []);

const limitEntries = computed(() => Object.entries(currentLimits.value));
const featureEntries = computed(() =>
  Object.entries(currentFeatures.value).filter(([, v]) => v === true),
);

const activeSubscription = computed(() =>
  stripe.value?.subscriptions?.find((s) =>
    ['active', 'trialing', 'past_due'].includes(s.status),
  ) || stripe.value?.subscriptions?.[0] || null,
);

async function handlePlanChange(newPlanId) {
  if (!user.value) return;
  actionBusy.value = 'plan';
  actionBanner.value = null;
  try {
    await updateUserPlan(user.value.id, { plan: newPlanId });
    actionBanner.value = { ok: true, msg: `Plan set to ${newPlanId}` };
    await load();
  } catch (e) {
    actionBanner.value = { ok: false, msg: e.message };
  } finally {
    actionBusy.value = null;
  }
}

async function handleStripeSync() {
  if (!user.value) return;
  actionBusy.value = 'sync';
  actionBanner.value = null;
  try {
    const res = await syncUserFromStripe(user.value.id);
    actionBanner.value = {
      ok: true,
      msg: res.applied
        ? `Synced: plan ${res.plan} (sub ${res.subscriptionStatus})`
        : `No subscriptions found (${res.reason || 'empty'})`,
    };
    await load();
  } catch (e) {
    actionBanner.value = { ok: false, msg: e.message };
  } finally {
    actionBusy.value = null;
  }
}

const planOptions = Object.values(PLANS).map((p) => ({ id: p.id, title: p.marketing.title }));

function fmtUsd(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}`; }
function fmtUsdPrecise(n) { return n == null ? '—' : `$${Number(n).toFixed(4)}`; }
function fmtInt(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }
function fmtLimit(v) {
  if (v === Infinity || v === null || v === undefined) return '∞';
  if (typeof v === 'number' && !Number.isFinite(v)) return '∞';
  return fmtInt(v);
}
function fmtDate(v) { return v ? new Date(v).toLocaleDateString() : '—'; }
function fmtDateTime(v) { return v ? new Date(v).toLocaleString() : '—'; }
function fmtDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Limits rendering — preserve declaration order, skip nulls
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <router-link to="/admin/users" class="back-link">← Users</router-link>
        <h1>{{ user?.email || '…' }}</h1>
        <p class="subtitle">
          <span class="plan-pill" :data-plan="user?.plan">{{ user?.plan }}</span>
          <span v-if="user?.isAdmin" class="admin-badge">admin</span>
          <span class="muted"> · {{ user?.id }}</span>
        </p>
      </div>
      <div class="header-controls">
        <router-link
          v-if="user"
          :to="`/admin/support?userId=${user.id}`"
          class="link-button"
        >Support tickets →</router-link>
        <label>
          <span>Window</span>
          <select v-model.number="days" @change="load">
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
            <option :value="90">90 days</option>
            <option :value="365">1 year</option>
          </select>
        </label>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <div v-if="actionBanner" class="banner" :class="{ ok: actionBanner.ok, err: !actionBanner.ok }">
        {{ actionBanner.msg }}
      </div>

      <!-- Top-level KPIs -->
      <section class="stat-grid">
        <div class="stat primary">
          <div class="stat-label">Lifetime revenue</div>
          <div class="stat-value">{{ fmtUsd(stripe?.lifetimeRevenueUsd) }}</div>
          <div class="stat-sub">{{ stripe?.invoiceCount || 0 }} paid invoices</div>
        </div>
        <div class="stat">
          <div class="stat-label">MRR</div>
          <div class="stat-value">{{ fmtUsd(stripe?.mrrUsd) }}</div>
          <div class="stat-sub">{{ activeSubscription?.status || 'no sub' }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Chat cost (today)</div>
          <div class="stat-value">{{ fmtUsd(usageNow.today?.costUsd) }}</div>
          <div class="stat-sub">{{ fmtInt(usageNow.today?.messages) }} msgs</div>
        </div>
        <div class="stat">
          <div class="stat-label">Chat cost (this month)</div>
          <div class="stat-value">{{ fmtUsd(usageNow.month?.costUsd) }}</div>
          <div class="stat-sub">{{ fmtInt(usageNow.month?.messages) }} msgs</div>
        </div>
        <div class="stat">
          <div class="stat-label">Chat cost ({{ days }}d)</div>
          <div class="stat-value">{{ fmtUsd(chatTotals.costUsd) }}</div>
          <div class="stat-sub">{{ fmtInt(chatTotals.messages) }} msgs</div>
        </div>
      </section>

      <div class="grid-2col">
        <!-- User + plan admin -->
        <section class="card">
          <h2>Account</h2>
          <dl class="kv">
            <dt>Email</dt><dd>{{ user.email }}</dd>
            <dt>Joined</dt><dd>{{ fmtDateTime(user.createdAt) }}</dd>
            <dt>Plan</dt><dd>{{ plan?.title }} ({{ user.plan }})</dd>
            <dt>Activated</dt><dd>{{ fmtDateTime(user.planActivatedAt) }}</dd>
            <dt>Expires</dt><dd>{{ fmtDateTime(user.planExpiresAt) }}</dd>
            <dt>Stripe customer</dt>
            <dd>
              <code v-if="user.stripeCustomerId">{{ user.stripeCustomerId }}</code>
              <span v-else class="muted">none</span>
            </dd>
            <dt>Stripe subscription</dt>
            <dd>
              <code v-if="user.stripeSubscriptionId">{{ user.stripeSubscriptionId }}</code>
              <span v-else class="muted">none</span>
            </dd>
            <dt>Admin</dt><dd>{{ user.isAdmin ? 'Yes' : 'No' }}</dd>
            <dt>Overrides</dt>
            <dd>
              <code v-if="user.limitsOverride">{{ JSON.stringify(user.limitsOverride) }}</code>
              <span v-else class="muted">none</span>
            </dd>
          </dl>

          <div class="actions">
            <label class="action-row">
              <span>Change plan</span>
              <select
                :value="user.plan"
                :disabled="actionBusy === 'plan'"
                @change="handlePlanChange($event.target.value)"
              >
                <option v-for="p in planOptions" :key="p.id" :value="p.id">
                  {{ p.title }} ({{ p.id }})
                </option>
              </select>
            </label>
            <button
              class="btn"
              :disabled="!user.stripeCustomerId || actionBusy === 'sync'"
              @click="handleStripeSync"
            >
              {{ actionBusy === 'sync' ? 'Syncing…' : 'Force Stripe sync' }}
            </button>
          </div>
        </section>

        <!-- Current chat limits -->
        <section class="card">
          <h2>Effective chat limits</h2>
          <dl class="kv kv-compact">
            <template v-for="[key, val] in limitEntries" :key="key">
              <dt>{{ key }}</dt>
              <dd>{{ fmtLimit(val) }}</dd>
            </template>
          </dl>
          <h3>Enabled features</h3>
          <div class="feature-pills">
            <span v-for="[key] in featureEntries" :key="key" class="feature-pill">
              {{ key }}
            </span>
            <span v-if="!featureEntries.length" class="muted">None</span>
          </div>
        </section>
      </div>

      <!-- Stripe: subscriptions -->
      <section v-if="stripe && !stripe.error" class="card">
        <h2>Subscriptions</h2>
        <table v-if="stripe.subscriptions?.length" class="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Amount</th>
              <th>Price / Product</th>
              <th>Trial end</th>
              <th>Current period</th>
              <th>Cancel</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in stripe.subscriptions" :key="s.id">
              <td>
                <span class="status-pill" :data-status="s.status">{{ s.status }}</span>
              </td>
              <td class="num">{{ fmtUsd(s.amountUsd) }} / {{ s.interval || '?' }}</td>
              <td><code>{{ s.priceId }}</code></td>
              <td>{{ fmtDateTime(s.trialEnd) }}</td>
              <td>{{ fmtDate(s.currentPeriodStart) }} → {{ fmtDate(s.currentPeriodEnd) }}</td>
              <td>{{ s.cancelAtPeriodEnd ? fmtDate(s.currentPeriodEnd) : (s.canceledAt ? fmtDate(s.canceledAt) : '—') }}</td>
              <td>{{ fmtDate(s.created) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No subscriptions.</div>
      </section>

      <!-- Stripe: invoices -->
      <section v-if="stripe && !stripe.error" class="card">
        <h2>Invoices</h2>
        <table v-if="stripe.invoices?.length" class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th class="num">Paid</th>
              <th class="num">Due</th>
              <th>Created</th>
              <th>Paid at</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in stripe.invoices" :key="inv.id">
              <td>{{ inv.number || inv.id }}</td>
              <td><span class="status-pill" :data-status="inv.status">{{ inv.status }}</span></td>
              <td class="num">{{ fmtUsd(inv.amountPaidUsd) }}</td>
              <td class="num">{{ fmtUsd(inv.amountDueUsd) }}</td>
              <td>{{ fmtDate(inv.created) }}</td>
              <td>{{ fmtDateTime(inv.paidAt) }}</td>
              <td class="link-cell">
                <a v-if="inv.hostedInvoiceUrl" :href="inv.hostedInvoiceUrl" target="_blank" rel="noopener">View</a>
                <a v-if="inv.invoicePdf" :href="inv.invoicePdf" target="_blank" rel="noopener">PDF</a>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No invoices.</div>
      </section>

      <!-- Stripe: recent charges -->
      <section v-if="stripe && !stripe.error && stripe.charges?.length" class="card">
        <h2>Recent charges</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th class="num">Amount</th>
              <th class="num">Refunded</th>
              <th>Description</th>
              <th>Created</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in stripe.charges" :key="c.id">
              <td>
                <span class="status-pill" :data-status="c.status">{{ c.status }}</span>
                <span v-if="c.failureMessage" class="muted"> · {{ c.failureMessage }}</span>
              </td>
              <td class="num">{{ fmtUsd(c.amountUsd) }}</td>
              <td class="num">{{ c.refunded ? fmtUsd(c.refundedUsd) : '—' }}</td>
              <td>{{ c.description || '—' }}</td>
              <td>{{ fmtDateTime(c.created) }}</td>
              <td><a v-if="c.receiptUrl" :href="c.receiptUrl" target="_blank" rel="noopener">View</a></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="stripe?.error" class="card">
        <h2>Stripe</h2>
        <div class="error">Stripe data unavailable: {{ stripe.error }}</div>
      </section>
      <section v-if="!stripe && user.stripeCustomerId" class="card">
        <h2>Stripe</h2>
        <div class="muted">No Stripe data loaded.</div>
      </section>

      <!-- Chat: daily breakdown -->
      <section class="card">
        <h2>Chat activity — last {{ days }} days</h2>
        <table v-if="chatByDay.length" class="data-table">
          <thead>
            <tr>
              <th>Date (UTC)</th>
              <th class="num">Messages</th>
              <th class="num">Input tokens</th>
              <th class="num">Output tokens</th>
              <th class="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in chatByDay" :key="d.date">
              <td>{{ d.date }}</td>
              <td class="num">{{ fmtInt(d.messages) }}</td>
              <td class="num">{{ fmtInt(d.inputTokens) }}</td>
              <td class="num">{{ fmtInt(d.outputTokens) }}</td>
              <td class="num">{{ fmtUsd(d.costUsd) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No chat activity.</div>
      </section>

      <!-- Chat: recent messages -->
      <section class="card">
        <h2>Recent messages</h2>
        <table v-if="recentMessages.length" class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Status</th>
              <th class="num">Iter</th>
              <th class="num">Tools</th>
              <th class="num">Input</th>
              <th class="num">Output</th>
              <th class="num">Cost</th>
              <th class="num">Duration</th>
              <th>Model</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in recentMessages" :key="m.id">
              <td>{{ fmtDateTime(m.createdAt) }}</td>
              <td>
                <span class="status-pill" :data-status="m.status">{{ m.status }}</span>
                <span v-if="m.errorMessage" class="muted"> · {{ m.errorMessage }}</span>
              </td>
              <td class="num">{{ fmtInt(m.iterations) }}</td>
              <td class="num">{{ fmtInt(m.toolCalls) }} / {{ fmtInt(m.searchCalls) }}</td>
              <td class="num">{{ fmtInt(m.inputTokens) }}</td>
              <td class="num">{{ fmtInt(m.outputTokens) }}</td>
              <td class="num">{{ fmtUsdPrecise(m.costUsd) }}</td>
              <td class="num">{{ fmtDuration(m.durationMs) }}</td>
              <td><code>{{ m.model }}</code></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No recent messages.</div>
      </section>

      <!-- Funnel timeline — events tied to this user, including those
           backfilled at register time via anonId stitching. -->
      <section class="card">
        <h2>Funnel timeline</h2>
        <table v-if="funnelEvents.length" class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Path</th>
              <th>UTM</th>
              <th>Props</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in funnelEvents" :key="e.id">
              <td>{{ fmtDateTime(e.ts) }}</td>
              <td><code>{{ e.name }}</code></td>
              <td class="muted">{{ e.path || '—' }}</td>
              <td class="muted">
                <span v-if="e.utm?.source">{{ e.utm.source }}</span>
                <span v-else>—</span>
              </td>
              <td class="muted"><code>{{ JSON.stringify(e.props || {}) }}</code></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No funnel events captured yet.</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1400px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.back-link { color: var(--text-secondary); text-decoration: none; font-size: 12px; }
.back-link:hover { color: var(--primary); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 22px; margin: 4px 0 4px; word-break: break-all; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }
.muted { color: var(--text-tertiary, var(--text-secondary)); }
.admin-badge { margin-left: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--primary); }
.header-controls { display: flex; gap: 10px; align-items: flex-end; }
.header-controls label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
.header-controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; font-family: inherit; font-size: 13px; }
.link-button { align-self: flex-end; border: 1px solid var(--border); padding: 8px 12px; color: var(--text); text-decoration: none; font-size: 12px; }
.link-button:hover { border-color: var(--primary); color: var(--primary); }

.banner { padding: 10px 14px; margin-bottom: 16px; font-size: 13px; border: 1px solid; }
.banner.ok { background: var(--surface); border-color: var(--primary); color: var(--primary); }
.banner.err { background: var(--surface); border-color: var(--danger, #d9534f); color: var(--danger, #d9534f); }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat { background: var(--surface); border: 1px solid var(--border); padding: 12px 14px; }
.stat.primary { border-color: var(--primary); }
.stat-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-display); font-weight: 700; }
.stat-value { font-size: 22px; font-family: var(--font-display); font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
.stat-sub { font-size: 11.5px; color: var(--text-secondary); margin-top: 2px; }

.grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
@media (max-width: 900px) { .grid-2col { grid-template-columns: 1fr; } }

.card { background: var(--surface); border: 1px solid var(--border); padding: 16px 18px; margin-bottom: 16px; }
.card h2 { font-family: var(--font-display); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin: 0 0 12px; }
.card h3 { font-family: var(--font-display); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary, var(--text-secondary)); margin: 14px 0 6px; }

.kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
.kv dt { color: var(--text-secondary); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--font-display); font-weight: 700; }
.kv dd { margin: 0; font-variant-numeric: tabular-nums; word-break: break-all; }
.kv code { font-family: var(--font-mono); font-size: 11.5px; background: var(--surface-alt); padding: 1px 5px; border: 1px solid var(--border); }
.kv.kv-compact { grid-template-columns: max-content 1fr; }

.actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.action-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.action-row select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 5px 8px; font-family: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; }
.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 7px 14px; font-family: inherit; font-size: 13px; cursor: pointer; }
.btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.feature-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.feature-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; border: 1px solid var(--border); color: var(--text-secondary); background: var(--surface-alt); }

.data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.data-table th { text-align: left; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-display); font-weight: 700; border-bottom: 1px solid var(--border); background: var(--surface-alt); }
.data-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; }
.data-table tbody tr:hover td { background: var(--surface-alt); }
.data-table code { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
.data-table .link-cell { display: flex; gap: 8px; }
.data-table a { color: var(--primary); text-decoration: none; }
.data-table a:hover { text-decoration: underline; }

.plan-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); }
.plan-pill[data-plan="premium"] { color: var(--primary); border-color: var(--primary); }
.plan-pill[data-plan="unlimited"] { color: var(--purple, var(--primary)); border-color: var(--purple, var(--primary)); }

.status-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); }
.status-pill[data-status="active"], .status-pill[data-status="paid"], .status-pill[data-status="succeeded"], .status-pill[data-status="ok"] { color: var(--primary); border-color: var(--primary); }
.status-pill[data-status="trialing"] { color: var(--text); border-color: var(--border); }
.status-pill[data-status="past_due"], .status-pill[data-status="unpaid"], .status-pill[data-status="failed"], .status-pill[data-status="error"], .status-pill[data-status="max_iterations"] { color: var(--danger, #d9534f); border-color: var(--danger, #d9534f); }
.status-pill[data-status="canceled"], .status-pill[data-status="incomplete_expired"] { color: var(--text-tertiary, var(--text-secondary)); }

.loading, .empty, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
