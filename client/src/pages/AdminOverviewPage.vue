<script setup>
import { ref, onMounted, computed } from 'vue';
import { fetchAdminUsageOverview, fetchAdminFunnel, fetchAdminUsers } from '../api/admin.js';
import { fetchAdminSupportSummary } from '../api/adminSupport.js';

const loading = ref(true);
const error = ref(null);

const usage1d = ref(null);
const usage30d = ref(null);
const funnel30d = ref(null);
const usersTotal = ref(0);
const supportSummary = ref(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [u1, u30, f30, ulist, sup] = await Promise.all([
      fetchAdminUsageOverview({ days: 1, limit: 1 }),
      fetchAdminUsageOverview({ days: 30, limit: 1 }),
      fetchAdminFunnel({ days: 30 }),
      fetchAdminUsers({ page: 1, limit: 1 }),
      fetchAdminSupportSummary().catch(() => null),
    ]);
    usage1d.value = u1?.totals || {};
    usage30d.value = u30?.totals || {};
    funnel30d.value = f30 || {};
    usersTotal.value = ulist?.total || 0;
    supportSummary.value = sup;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const conversionRate = computed(() => {
  const steps = funnel30d.value?.steps || [];
  if (steps.length < 2) return null;
  const top = steps[0]?.visitors || 0;
  const bottom = steps[steps.length - 1]?.visitors || 0;
  if (!top) return null;
  return (bottom / top) * 100;
});

const signups30d = computed(() => {
  const steps = funnel30d.value?.steps || [];
  // Last step is conventionally "signed up" — fall back to bottom of funnel
  // if naming changes so the tile still shows something meaningful.
  const last = steps[steps.length - 1];
  return last?.visitors ?? 0;
});

const visitors30d = computed(() => funnel30d.value?.steps?.[0]?.visitors ?? 0);

const openTickets = computed(() => supportSummary.value?.openTickets ?? 0);
const openFeatures = computed(() => supportSummary.value?.openFeatures ?? 0);

function fmtUsd(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}
function fmtInt(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
}
function fmtPct(n) {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <h1>Admin Overview</h1>
        <p class="subtitle">Cross-section health snapshot. Click a tile to drill in.</p>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <section class="tile-section">
        <h2>LLM</h2>
        <div class="tiles">
          <router-link to="/admin/llm-usage" class="tile">
            <div class="tile-label">Cost · today</div>
            <div class="tile-value">{{ fmtUsd(usage1d?.costUsd) }}</div>
            <div class="tile-sub">{{ fmtInt(usage1d?.messages) }} msgs</div>
          </router-link>
          <router-link to="/admin/llm-usage" class="tile">
            <div class="tile-label">Cost · 30d</div>
            <div class="tile-value">{{ fmtUsd(usage30d?.costUsd) }}</div>
            <div class="tile-sub">{{ fmtInt(usage30d?.messages) }} msgs</div>
          </router-link>
          <router-link to="/admin/llm-usage" class="tile" :class="{ warn: (usage30d?.errors || 0) > 0 }">
            <div class="tile-label">Errors · 30d</div>
            <div class="tile-value">{{ fmtInt(usage30d?.errors) }}</div>
            <div class="tile-sub">across {{ fmtInt(usage30d?.users) }} users</div>
          </router-link>
        </div>
      </section>

      <section class="tile-section">
        <h2>Growth</h2>
        <div class="tiles">
          <router-link to="/admin/funnel" class="tile">
            <div class="tile-label">Visitors · 30d</div>
            <div class="tile-value">{{ fmtInt(visitors30d) }}</div>
            <div class="tile-sub">funnel top</div>
          </router-link>
          <router-link to="/admin/funnel" class="tile">
            <div class="tile-label">Signups · 30d</div>
            <div class="tile-value">{{ fmtInt(signups30d) }}</div>
            <div class="tile-sub">funnel bottom</div>
          </router-link>
          <router-link to="/admin/funnel" class="tile">
            <div class="tile-label">Conversion · 30d</div>
            <div class="tile-value">{{ fmtPct(conversionRate) }}</div>
            <div class="tile-sub">visitors → signed up</div>
          </router-link>
          <router-link to="/admin/users" class="tile">
            <div class="tile-label">Users · total</div>
            <div class="tile-value">{{ fmtInt(usersTotal) }}</div>
            <div class="tile-sub">all-time accounts</div>
          </router-link>
        </div>
      </section>

      <section class="tile-section">
        <h2>Support</h2>
        <div class="tiles">
          <router-link to="/admin/support" class="tile" :class="{ warn: openTickets > 0 }">
            <div class="tile-label">Open tickets</div>
            <div class="tile-value">{{ fmtInt(openTickets) }}</div>
            <div class="tile-sub">open + in-progress</div>
          </router-link>
          <router-link to="/admin/support?tab=features" class="tile">
            <div class="tile-label">Feature requests</div>
            <div class="tile-value">{{ fmtInt(openFeatures) }}</div>
            <div class="tile-sub">open</div>
          </router-link>
        </div>
      </section>

      <section class="tile-section">
        <h2>Tools</h2>
        <div class="tiles">
          <router-link to="/admin/marketing-embed" class="tile tool">
            <div class="tile-label">Marketing</div>
            <div class="tile-value tool-name">Open →</div>
            <div class="tile-sub">influencer CRM, prompts, jobs</div>
          </router-link>
          <router-link to="/admin/jobs" class="tile tool">
            <div class="tile-label">Jobs</div>
            <div class="tile-value tool-name">Agendash →</div>
            <div class="tile-sub">scheduled tasks</div>
          </router-link>
          <a href="https://jeff-jassky.sentry.io/issues/" target="_blank" rel="noopener noreferrer" class="tile tool">
            <div class="tile-label">Sentry</div>
            <div class="tile-value tool-name">Issues ↗</div>
            <div class="tile-sub">errors + perf</div>
          </a>
          <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer" class="tile tool">
            <div class="tile-label">Stripe</div>
            <div class="tile-value tool-name">Dashboard ↗</div>
            <div class="tile-sub">billing + revenue</div>
          </a>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1280px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-family: var(--font-display); font-size: 24px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }

.tile-section { margin-bottom: 28px; }
.tile-section h2 {
  font-family: var(--font-display);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  margin: 0 0 10px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.tile {
  display: block;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 14px 16px;
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}
.tile:hover {
  border-color: var(--primary);
  transform: translateY(-1px);
}
.tile.warn { border-color: var(--danger, #d9534f); }
.tile.tool { border-style: dashed; }

.tile-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary, var(--text-secondary));
  font-family: var(--font-display);
  font-weight: 700;
}
.tile-value {
  font-size: 26px;
  font-family: var(--font-display);
  font-weight: 700;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
.tile-value.tool-name {
  font-size: 18px;
  color: var(--primary);
}
.tile-sub {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.loading, .error { padding: 32px; text-align: center; color: var(--text-secondary); }
.error { color: var(--danger, #d9534f); }
</style>
