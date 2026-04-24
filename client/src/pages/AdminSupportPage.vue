<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchAdminTickets,
  fetchAdminFeatures,
  updateAdminFeature,
  deleteAdminFeature,
} from '../api/adminSupport.js';

const route = useRoute();
const router = useRouter();

const tabs = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'features', label: 'Feature requests' },
];
const activeTab = ref(route.query.tab === 'features' ? 'features' : 'tickets');
watch(activeTab, (v) => router.replace({ query: { ...route.query, tab: v } }));

// Pre-fill userId filter when deep-linked from admin user detail.
const userIdFilter = ref(route.query.userId || '');

// --- Tickets ---
const tickets = ref([]);
const ticketPage = ref(1);
const ticketLimit = ref(50);
const ticketTotal = ref(0);
const ticketStatus = ref('');
const ticketQ = ref('');
const ticketCounts = ref({});
const ticketsLoading = ref(false);
const ticketsError = ref(null);

async function loadTickets() {
  ticketsLoading.value = true;
  ticketsError.value = null;
  try {
    const data = await fetchAdminTickets({
      status: ticketStatus.value,
      q: ticketQ.value,
      userId: userIdFilter.value,
      page: ticketPage.value,
      limit: ticketLimit.value,
    });
    tickets.value = data.tickets;
    ticketTotal.value = data.total;
    ticketCounts.value = data.countsByStatus || {};
  } catch (e) {
    ticketsError.value = e.message;
  } finally {
    ticketsLoading.value = false;
  }
}

let ticketSearchTimer = null;
watch(ticketStatus, () => { ticketPage.value = 1; loadTickets(); });
watch(userIdFilter, () => { ticketPage.value = 1; loadTickets(); });
watch(ticketQ, () => {
  if (ticketSearchTimer) clearTimeout(ticketSearchTimer);
  ticketSearchTimer = setTimeout(() => { ticketPage.value = 1; loadTickets(); }, 300);
});

function changeTicketPage(delta) {
  const next = ticketPage.value + delta;
  if (next < 1) return;
  ticketPage.value = next;
  loadTickets();
}

// --- Features ---
const features = ref([]);
const featureStatus = ref('');
const featureQ = ref('');
const featureCounts = ref({});
const featuresLoading = ref(false);
const featuresError = ref(null);

async function loadFeatures() {
  featuresLoading.value = true;
  featuresError.value = null;
  try {
    const data = await fetchAdminFeatures({ status: featureStatus.value, q: featureQ.value });
    features.value = data.features;
    featureCounts.value = data.countsByStatus || {};
  } catch (e) {
    featuresError.value = e.message;
  } finally {
    featuresLoading.value = false;
  }
}

let featureSearchTimer = null;
watch(featureStatus, loadFeatures);
watch(featureQ, () => {
  if (featureSearchTimer) clearTimeout(featureSearchTimer);
  featureSearchTimer = setTimeout(loadFeatures, 300);
});

async function updateFeatureStatus(f, status) {
  try {
    const { feature } = await updateAdminFeature(f.id, { status });
    Object.assign(f, feature);
    featureCounts.value = {};
    loadFeatures();
  } catch (e) {
    featuresError.value = e.message;
  }
}

async function removeFeature(f) {
  if (!confirm(`Delete "${f.title}"? This cannot be undone.`)) return;
  try {
    await deleteAdminFeature(f.id);
    features.value = features.value.filter((x) => x.id !== f.id);
  } catch (e) {
    featuresError.value = e.message;
  }
}

const ticketStatusLabel = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
const featureStatusLabel = {
  open: 'Open', planned: 'Planned', in_progress: 'In progress', shipped: 'Shipped', declined: 'Declined',
};
const FEATURE_STATUSES = ['open', 'planned', 'in_progress', 'shipped', 'declined'];

function fmtDate(v) { return v ? new Date(v).toLocaleString() : '—'; }

onMounted(() => { loadTickets(); loadFeatures(); });
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <h1>Admin · Support</h1>
        <p class="subtitle">
          {{ ticketCounts.open || 0 }} open · {{ ticketCounts.in_progress || 0 }} in progress · {{ ticketCounts.closed || 0 }} closed
        </p>
      </div>
      <div class="header-controls">
        <router-link to="/admin" class="link-button">← Overview</router-link>
      </div>
    </header>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- TICKETS -->
    <section v-if="activeTab === 'tickets'">
      <div class="filter-bar">
        <input v-model="ticketQ" type="search" placeholder="Search subject, description, email…" class="search-input" />
        <select v-model="ticketStatus">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
        </select>
        <input v-if="userIdFilter" :value="userIdFilter" disabled class="search-input" style="max-width: 260px" />
        <button v-if="userIdFilter" class="btn ghost" @click="userIdFilter = ''">Clear user filter</button>
      </div>

      <div v-if="ticketsLoading" class="loading">Loading…</div>
      <div v-else-if="ticketsError" class="error">{{ ticketsError }}</div>
      <template v-else>
        <table v-if="tickets.length" class="data-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>User</th>
              <th>Status</th>
              <th class="num">Msgs</th>
              <th class="num">Files</th>
              <th>Updated</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tickets" :key="t.id">
              <td>
                <router-link :to="`/admin/support/tickets/${t.id}`">{{ t.subject }}</router-link>
              </td>
              <td>
                <router-link :to="`/admin/users/${t.userId}`" class="muted">{{ t.userEmail }}</router-link>
              </td>
              <td><span class="status-pill" :data-status="t.status">{{ ticketStatusLabel[t.status] }}</span></td>
              <td class="num">{{ t.messageCount }}</td>
              <td class="num">{{ t.attachmentCount }}</td>
              <td>{{ fmtDate(t.updatedAt) }}</td>
              <td>{{ fmtDate(t.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No tickets match.</div>

        <div class="pagination">
          <button :disabled="ticketPage === 1" @click="changeTicketPage(-1)">← Prev</button>
          <span>Page {{ ticketPage }} · {{ tickets.length }} of {{ ticketTotal }}</span>
          <button :disabled="ticketPage * ticketLimit >= ticketTotal" @click="changeTicketPage(1)">Next →</button>
        </div>
      </template>
    </section>

    <!-- FEATURES -->
    <section v-if="activeTab === 'features'">
      <div class="filter-bar">
        <input v-model="featureQ" type="search" placeholder="Search…" class="search-input" />
        <select v-model="featureStatus">
          <option value="">All statuses</option>
          <option v-for="s in FEATURE_STATUSES" :key="s" :value="s">{{ featureStatusLabel[s] }}</option>
        </select>
      </div>
      <div v-if="featuresLoading" class="loading">Loading…</div>
      <div v-else-if="featuresError" class="error">{{ featuresError }}</div>
      <template v-else>
        <table v-if="features.length" class="data-table">
          <thead>
            <tr>
              <th class="num">Votes</th>
              <th>Title</th>
              <th>Author</th>
              <th>Status</th>
              <th class="num">Comments</th>
              <th>Created</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in features" :key="f.id">
              <td class="num"><strong>{{ f.upvoteCount }}</strong></td>
              <td><router-link :to="`/admin/support/features/${f.id}`">{{ f.title }}</router-link></td>
              <td class="muted">{{ f.authorDisplayName || f.authorEmail?.split('@')[0] }}</td>
              <td>
                <select
                  :value="f.status"
                  class="status-select"
                  @change="updateFeatureStatus(f, $event.target.value)"
                >
                  <option v-for="s in FEATURE_STATUSES" :key="s" :value="s">{{ featureStatusLabel[s] }}</option>
                </select>
              </td>
              <td class="num">{{ f.commentCount }}</td>
              <td>{{ fmtDate(f.createdAt) }}</td>
              <td>{{ fmtDate(f.updatedAt) }}</td>
              <td>
                <button class="link-btn danger" @click="removeFeature(f)">delete</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No feature requests.</div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1400px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 24px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }
.link-button { border: 1px solid var(--border); padding: 8px 14px; color: var(--text); text-decoration: none; font-size: 13px; }
.link-button:hover { border-color: var(--primary); color: var(--primary); }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin: 0 0 20px; }
.tab { background: none; border: none; padding: 10px 16px; font-size: 14px; color: var(--text-secondary); cursor: pointer; font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input, .filter-bar select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; font-family: inherit; font-size: 13px; }
.search-input { flex: 1; min-width: 200px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border: 1px solid var(--border); }
.data-table th { text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); background: var(--surface-alt); border-bottom: 1px solid var(--border); }
.data-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.data-table a { color: var(--text); text-decoration: none; }
.data-table a:hover { color: var(--primary); }
.muted { color: var(--text-tertiary, var(--text-secondary)); }

.status-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; }
.status-pill[data-status="open"] { color: var(--primary); border-color: var(--primary); }
.status-pill[data-status="in_progress"] { color: var(--text); }
.status-pill[data-status="closed"] { color: var(--text-tertiary, var(--text-secondary)); }
.status-select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 3px 6px; font-family: inherit; font-size: 12px; }

.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 16px; font-size: 13px; color: var(--text-secondary); }
.pagination button { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 14px; font-family: inherit; font-size: 13px; cursor: pointer; }
.pagination button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; }
.btn.ghost { background: none; }
.btn:hover { border-color: var(--primary); color: var(--primary); }

.link-btn { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 12px; padding: 0; }
.link-btn:hover { text-decoration: underline; }
.link-btn.danger { color: var(--danger, #d9534f); }

.loading, .empty { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); padding: 20px; text-align: center; font-size: 13px; }
</style>
