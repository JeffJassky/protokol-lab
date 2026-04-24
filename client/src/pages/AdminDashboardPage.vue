<script setup>
import { ref, onMounted, computed } from 'vue';
import { fetchAdminUsageOverview } from '../api/admin.js';

const loading = ref(true);
const error = ref(null);
const data = ref(null);
const days = ref(30);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchAdminUsageOverview({ days: days.value, limit: 25 });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const totals = computed(() => data.value?.totals || {});
const byUser = computed(() => data.value?.byUser || []);
const byDay = computed(() => data.value?.byDay || []);

function fmtUsd(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}
function fmtInt(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
}
function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString();
}
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <h1>Admin · Usage</h1>
        <p class="subtitle">AI chat cost + token consumption</p>
      </div>
      <div class="header-controls">
        <label>
          <span>Window</span>
          <select v-model.number="days" @change="load">
            <option :value="1">24 hours</option>
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
            <option :value="90">90 days</option>
            <option :value="365">1 year</option>
          </select>
        </label>
        <router-link to="/admin/users" class="link-button">Users →</router-link>
        <router-link to="/admin/support" class="link-button">Support →</router-link>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <section class="stat-grid">
        <div class="stat">
          <div class="stat-label">Active users</div>
          <div class="stat-value">{{ fmtInt(totals.users) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Messages</div>
          <div class="stat-value">{{ fmtInt(totals.messages) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Input tokens</div>
          <div class="stat-value">{{ fmtInt(totals.inputTokens) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Output tokens</div>
          <div class="stat-value">{{ fmtInt(totals.outputTokens) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Search calls</div>
          <div class="stat-value">{{ fmtInt(totals.searchCalls) }}</div>
        </div>
        <div class="stat primary">
          <div class="stat-label">Total cost</div>
          <div class="stat-value">{{ fmtUsd(totals.costUsd) }}</div>
        </div>
        <div class="stat" :class="{ warning: totals.errors > 0 }">
          <div class="stat-label">Errors</div>
          <div class="stat-value">{{ fmtInt(totals.errors) }}</div>
        </div>
      </section>

      <section class="card">
        <h2>Top users by cost</h2>
        <table v-if="byUser.length" class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th class="num">Msgs</th>
              <th class="num">Input tok</th>
              <th class="num">Output tok</th>
              <th class="num">Cost</th>
              <th class="num">Errors</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in byUser" :key="row.userId">
              <td>
                <router-link :to="`/admin/users/${row.userId}`">
                  {{ row.email || row.userId }}
                </router-link>
              </td>
              <td><span class="plan-pill" :data-plan="row.plan">{{ row.plan }}</span></td>
              <td class="num">{{ fmtInt(row.messages) }}</td>
              <td class="num">{{ fmtInt(row.inputTokens) }}</td>
              <td class="num">{{ fmtInt(row.outputTokens) }}</td>
              <td class="num">{{ fmtUsd(row.costUsd) }}</td>
              <td class="num" :class="{ error: row.errors > 0 }">{{ fmtInt(row.errors) }}</td>
              <td>{{ fmtDate(row.lastActiveAt) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No chat activity in this window.</div>
      </section>

      <section class="card">
        <h2>Daily breakdown</h2>
        <table v-if="byDay.length" class="data-table">
          <thead>
            <tr>
              <th>Date (UTC)</th>
              <th class="num">Users</th>
              <th class="num">Messages</th>
              <th class="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in byDay" :key="row.date">
              <td>{{ row.date }}</td>
              <td class="num">{{ fmtInt(row.users) }}</td>
              <td class="num">{{ fmtInt(row.messages) }}</td>
              <td class="num">{{ fmtUsd(row.costUsd) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No daily activity.</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1200px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 24px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }
.header-controls { display: flex; gap: 12px; align-items: center; }
.header-controls label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
.header-controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; font-family: inherit; font-size: 13px; }
.link-button { align-self: flex-end; border: 1px solid var(--border); padding: 8px 14px; color: var(--text); text-decoration: none; font-size: 13px; }
.link-button:hover { border-color: var(--primary); color: var(--primary); }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
.stat { background: var(--surface); border: 1px solid var(--border); padding: 12px 14px; }
.stat.primary { border-color: var(--primary); }
.stat.warning { border-color: var(--danger, #d9534f); }
.stat-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-display); font-weight: 700; }
.stat-value { font-size: 22px; font-family: var(--font-display); font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }

.card { background: var(--surface); border: 1px solid var(--border); padding: 16px 18px; margin-bottom: 20px; }
.card h2 { font-family: var(--font-display); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin: 0 0 12px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-display); font-weight: 700; border-bottom: 1px solid var(--border); }
.data-table td { padding: 8px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; }
.data-table tbody tr:hover td { background: var(--surface-alt); }
.data-table a { color: var(--text); }
.data-table a:hover { color: var(--primary); }
.data-table .error { color: var(--danger, #d9534f); }

.plan-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); }
.plan-pill[data-plan="premium"] { color: var(--primary); border-color: var(--primary); }
.plan-pill[data-plan="unlimited"] { color: var(--purple, var(--primary)); border-color: var(--purple, var(--primary)); }

.loading, .empty, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
