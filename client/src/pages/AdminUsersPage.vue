<script setup>
import { ref, onMounted, watch } from 'vue';
import { fetchAdminUsers } from '../api/admin.js';
import { PLAN_IDS } from '../../../shared/plans.js';

const users = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(50);
const q = ref('');
const planFilter = ref('');
const loading = ref(false);
const error = ref(null);

const planOptions = [
  { value: '', label: 'All plans' },
  { value: PLAN_IDS.FREE, label: 'Free' },
  { value: PLAN_IDS.PREMIUM, label: 'Premium' },
  { value: PLAN_IDS.UNLIMITED, label: 'Unlimited' },
];

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetchAdminUsers({
      q: q.value,
      plan: planFilter.value,
      page: page.value,
      limit: limit.value,
    });
    users.value = res.users || [];
    total.value = res.total || 0;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Debounced search
let searchTimer = null;
watch(q, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 300);
});
watch(planFilter, () => {
  page.value = 1;
  load();
});

function changePage(delta) {
  const next = page.value + delta;
  if (next < 1) return;
  page.value = next;
  load();
}

function fmtUsd(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}
function fmtInt(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
}
function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString();
}
function fmtDateTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString();
}
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <h1>Admin · Users</h1>
        <p class="subtitle">{{ total }} total</p>
      </div>
      <div class="header-controls">
        <router-link to="/admin" class="link-button">← Overview</router-link>
      </div>
    </header>

    <div class="filter-bar">
      <input
        v-model="q"
        type="search"
        placeholder="Search email…"
        class="search-input"
      />
      <select v-model="planFilter" class="plan-select">
        <option
          v-for="opt in planOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <table v-if="users.length" class="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Plan</th>
            <th>Stripe</th>
            <th class="num">Chat msgs (30d)</th>
            <th class="num">Chat cost (30d)</th>
            <th>Last active</th>
            <th>Joined</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>
              <router-link :to="`/admin/users/${u.id}`">
                {{ u.email }}
              </router-link>
              <span v-if="u.isAdmin" class="admin-badge">admin</span>
            </td>
            <td>
              <span class="plan-pill" :data-plan="u.plan">{{ u.plan }}</span>
              <span v-if="u.hasLimitsOverride" class="override-badge" title="Has per-user limits override">⚑</span>
            </td>
            <td>
              <span v-if="u.hasActiveSubscription" class="status on">Sub</span>
              <span v-else-if="u.hasStripeCustomer" class="status pending">Customer</span>
              <span v-else class="status off">—</span>
            </td>
            <td class="num">{{ fmtInt(u.chat30d.messages) }}</td>
            <td class="num">{{ fmtUsd(u.chat30d.costUsd) }}</td>
            <td>{{ fmtDateTime(u.chat30d.lastActiveAt) }}</td>
            <td>{{ fmtDate(u.createdAt) }}</td>
            <td>{{ fmtDate(u.planExpiresAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No users match.</div>

      <div class="pagination">
        <button :disabled="page === 1" @click="changePage(-1)">← Prev</button>
        <span>Page {{ page }} · {{ users.length }} of {{ total }}</span>
        <button :disabled="page * limit >= total" @click="changePage(1)">Next →</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1400px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 24px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }
.link-button { border: 1px solid var(--border); padding: 8px 14px; color: var(--text); text-decoration: none; font-size: 13px; }
.link-button:hover { border-color: var(--primary); color: var(--primary); }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; }
.search-input, .plan-select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; font-family: inherit; font-size: 13px; }
.search-input { flex: 1; min-width: 200px; }
.search-input:focus, .plan-select:focus { outline: none; border-color: var(--primary); }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border: 1px solid var(--border); }
.data-table th { text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-display); font-weight: 700; border-bottom: 1px solid var(--border); background: var(--surface-alt); }
.data-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; }
.data-table tbody tr:hover td { background: var(--surface-alt); }
.data-table a { color: var(--text); }
.data-table a:hover { color: var(--primary); }

.plan-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); }
.plan-pill[data-plan="premium"] { color: var(--primary); border-color: var(--primary); }
.plan-pill[data-plan="unlimited"] { color: var(--purple, var(--primary)); border-color: var(--purple, var(--primary)); }

.admin-badge { margin-left: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--primary); }
.override-badge { margin-left: 6px; color: var(--danger, #d9534f); }

.status { font-size: 11px; padding: 2px 6px; text-transform: uppercase; letter-spacing: 0.06em; }
.status.on { color: var(--primary); }
.status.pending { color: var(--text-secondary); }
.status.off { color: var(--text-tertiary, var(--text-secondary)); }

.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 16px; font-size: 13px; color: var(--text-secondary); }
.pagination button { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 14px; font-family: inherit; font-size: 13px; cursor: pointer; }
.pagination button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.loading, .empty, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
