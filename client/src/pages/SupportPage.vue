<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import {
  fetchMyTickets,
  createTicket,
  fetchFeatures,
  createFeature,
  upvoteFeature,
  removeUpvote,
  updateMyProfile,
} from '../api/support.js';
import { snapshotContext, buildSubject, buildDescription } from '../utils/bugReport.js';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const tabs = [
  { id: 'tickets', label: 'My Tickets' },
  { id: 'features', label: 'Feature Requests' },
];
const activeTab = ref(route.query.tab === 'features' ? 'features' : 'tickets');
watch(activeTab, (v) => {
  router.replace({ query: { ...route.query, tab: v } });
});

// ---- Tickets ----
const tickets = ref([]);
const ticketsLoading = ref(false);
const ticketsError = ref(null);
const showNewTicket = ref(false);
const newTicket = ref({ happened: '', expected: '', doing: '' });
const creatingTicket = ref(false);
const newTicketErr = ref(null);

async function loadTickets() {
  ticketsLoading.value = true;
  ticketsError.value = null;
  try {
    const data = await fetchMyTickets();
    tickets.value = data.tickets || [];
  } catch (e) {
    ticketsError.value = e.message;
  } finally {
    ticketsLoading.value = false;
  }
}

async function submitTicket() {
  newTicketErr.value = null;
  creatingTicket.value = true;
  try {
    const ctx = snapshotContext(route);
    const { ticket } = await createTicket({
      subject: buildSubject(newTicket.value.happened),
      description: buildDescription(newTicket.value, ctx),
    });
    newTicket.value = { happened: '', expected: '', doing: '' };
    showNewTicket.value = false;
    await loadTickets();
    router.push(`/support/tickets/${ticket.id || ticket._id}`);
  } catch (e) {
    newTicketErr.value = e.message;
  } finally {
    creatingTicket.value = false;
  }
}

// ---- Features ----
const features = ref([]);
const featuresLoading = ref(false);
const featuresError = ref(null);
const featureFilter = ref('');
const featureQ = ref('');
const featureSort = ref('top');

const showNewFeature = ref(false);
const newFeature = ref({ title: '', description: '' });
const creatingFeature = ref(false);
const newFeatureErr = ref(null);

async function loadFeatures() {
  featuresLoading.value = true;
  featuresError.value = null;
  try {
    const data = await fetchFeatures({
      status: featureFilter.value,
      q: featureQ.value,
      sort: featureSort.value,
    });
    features.value = data.features || [];
  } catch (e) {
    featuresError.value = e.message;
  } finally {
    featuresLoading.value = false;
  }
}

let searchTimer = null;
watch([featureFilter, featureSort], loadFeatures);
watch(featureQ, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(loadFeatures, 300);
});

async function submitFeature() {
  newFeatureErr.value = null;
  creatingFeature.value = true;
  try {
    await createFeature(newFeature.value);
    newFeature.value = { title: '', description: '' };
    showNewFeature.value = false;
    await loadFeatures();
  } catch (e) {
    newFeatureErr.value = e.message;
  } finally {
    creatingFeature.value = false;
  }
}

async function toggleVote(f) {
  try {
    const res = f.upvotedByMe ? await removeUpvote(f.id) : await upvoteFeature(f.id);
    Object.assign(f, res.feature);
  } catch (e) {
    featuresError.value = e.message;
  }
}

// ---- Display name ----
const editingName = ref(false);
const draftName = ref('');
const savingName = ref(false);
const nameErr = ref(null);

function openNameEditor() {
  draftName.value = auth.user?.displayName || '';
  editingName.value = true;
}

async function saveName() {
  savingName.value = true;
  nameErr.value = null;
  try {
    const { user } = await updateMyProfile({ displayName: draftName.value });
    auth.user = { ...auth.user, displayName: user.displayName };
    editingName.value = false;
  } catch (e) {
    nameErr.value = e.message;
  } finally {
    savingName.value = false;
  }
}

function effectiveDisplayName() {
  const u = auth.user;
  if (!u) return '—';
  return u.displayName || (u.email?.split('@')[0] ?? 'User');
}

onMounted(() => {
  loadTickets();
  loadFeatures();
});

const ticketStatusLabel = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
const featureStatusLabel = {
  open: 'Open', planned: 'Planned', in_progress: 'In progress', shipped: 'Shipped', declined: 'Declined',
};

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString();
}
</script>

<template>
  <div class="support-page">
    <header class="page-header">
      <div>
        <h1>Support</h1>
        <p class="subtitle">
          Signed in as <strong>{{ effectiveDisplayName() }}</strong> &middot;
          {{ auth.user?.email }}
          <button class="link-btn" @click="openNameEditor">
            edit display name
          </button>
        </p>
      </div>
    </header>

    <div v-if="editingName" class="card inline-editor">
      <label>
        <span>Display name</span>
        <input
          v-model="draftName"
          maxlength="60"
          placeholder="How you appear on feature requests"
        />
      </label>
      <div class="row-actions">
        <button class="btn" :disabled="savingName" @click="saveName">
          {{ savingName ? 'Saving…' : 'Save' }}
        </button>
        <button class="btn ghost" @click="editingName = false">Cancel</button>
        <span v-if="nameErr" class="error">{{ nameErr }}</span>
      </div>
    </div>

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
    <section v-if="activeTab === 'tickets'" class="panel">
      <div class="panel-header">
        <h2>Your tickets</h2>
        <button class="btn primary" @click="showNewTicket = !showNewTicket">
          {{ showNewTicket ? 'Close' : 'New ticket' }}
        </button>
      </div>

      <form
        v-if="showNewTicket"
        class="card composer"
        @submit.prevent="submitTicket"
      >
        <p class="composer-intro">Tell us in your own words.</p>
        <label>
          <span>What happened?</span>
          <textarea
            v-model="newTicket.happened"
            maxlength="2000"
            rows="3"
            required
            placeholder="e.g. The page went blank after I clicked Save."
          />
        </label>
        <label>
          <span>What did you expect to happen instead?</span>
          <textarea
            v-model="newTicket.expected"
            maxlength="2000"
            rows="2"
            placeholder="e.g. I expected my note to be saved and shown in the list."
          />
        </label>
        <label>
          <span
            >What were you doing right before?
            <em class="optional">(optional)</em></span
          >
          <textarea
            v-model="newTicket.doing"
            maxlength="2000"
            rows="2"
            placeholder="e.g. I tapped on a meal, edited the calories, then hit Save."
          />
        </label>
        <p v-if="newTicketErr" class="error">{{ newTicketErr }}</p>
        <div class="row-actions">
          <button
            class="btn primary"
            :disabled="creatingTicket || !newTicket.happened.trim()"
            type="submit"
          >
            {{ creatingTicket ? 'Sending…' : 'Send report' }}
          </button>
          <p class="hint">
            You can attach screenshots after the ticket is created.
          </p>
        </div>
      </form>

      <div v-if="ticketsLoading" class="loading">Loading…</div>
      <div v-else-if="ticketsError" class="error">{{ ticketsError }}</div>
      <table v-else-if="tickets.length" class="data-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Status</th>
            <th class="num">Msgs</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tickets" :key="t.id">
            <td>
              <router-link
                :to="`/support/tickets/${t.id}`"
                >{{ t.subject }}</router-link
              >
            </td>
            <td>
              <span
                class="status-pill"
                :data-status="t.status"
                >{{ ticketStatusLabel[t.status] }}</span
              >
            </td>
            <td class="num">{{ t.messageCount }}</td>
            <td>{{ fmtDate(t.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No tickets yet. Hit a bug? Open one above.</div>
    </section>

    <!-- FEATURES -->
    <section v-if="activeTab === 'features'" class="panel">
      <div class="panel-header">
        <h2>Feature requests</h2>
        <button class="btn primary" @click="showNewFeature = !showNewFeature">
          {{ showNewFeature ? 'Close' : 'Suggest a feature' }}
        </button>
      </div>

      <form
        v-if="showNewFeature"
        class="card composer"
        @submit.prevent="submitFeature"
      >
        <label>
          <span>Title</span>
          <input
            v-model="newFeature.title"
            maxlength="160"
            required
            placeholder="What's the idea?"
          />
        </label>
        <label>
          <span>Describe it</span>
          <textarea
            v-model="newFeature.description"
            maxlength="6000"
            rows="5"
            required
            placeholder="Who benefits? What problem does it solve?"
          />
        </label>
        <p v-if="newFeatureErr" class="error">{{ newFeatureErr }}</p>
        <div class="row-actions">
          <button class="btn primary" :disabled="creatingFeature" type="submit">
            {{ creatingFeature ? 'Posting…' : 'Post request' }}
          </button>
          <p class="hint">
            Your display name ({{ effectiveDisplayName() }}) is shown publicly.
          </p>
        </div>
      </form>

      <div class="filter-bar">
        <input
          v-model="featureQ"
          type="search"
          placeholder="Search…"
          class="search-input"
        />
        <select v-model="featureFilter">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="shipped">Shipped</option>
          <option value="declined">Declined</option>
        </select>
        <select v-model="featureSort">
          <option value="top">Top voted</option>
          <option value="new">Newest</option>
        </select>
      </div>

      <div v-if="featuresLoading" class="loading">Loading…</div>
      <div v-else-if="featuresError" class="error">{{ featuresError }}</div>
      <ul v-else-if="features.length" class="feature-list">
        <li v-for="f in features" :key="f.id" class="feature-row">
          <button
            class="vote-button"
            :class="{ voted: f.upvotedByMe }"
            @click="toggleVote(f)"
            :title="f.upvotedByMe ? 'Remove upvote' : 'Upvote'"
          >
            <span class="arrow">▲</span>
            <span class="count">{{ f.upvoteCount }}</span>
          </button>
          <div class="feature-body">
            <router-link
              :to="`/support/features/${f.id}`"
              class="feature-title"
            >
              {{ f.title }}
            </router-link>
            <p class="feature-excerpt">{{ f.description }}</p>
            <div class="feature-meta">
              <span
                class="status-pill"
                :data-status="f.status"
                >{{ featureStatusLabel[f.status] }}</span
              >
              <span
                >{{ f.authorDisplayName || f.authorEmail?.split('@')[0] }}</span
              >
              <span
                >{{ f.commentCount }}
                comment{{ f.commentCount === 1 ? '' : 's' }}</span
              >
              <span>{{ fmtDate(f.createdAt) }}</span>
            </div>
          </div>
        </li>
      </ul>
      <div v-else class="empty">No feature requests yet. Be first.</div>
    </section>
  </div>
</template>

<style scoped>
.support-page { font-family: var(--font-body); color: var(--text); }
.page-header h1 { font-family: var(--font-display); font-size: 24px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0 0 18px; }
.link-btn { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 12px; margin-left: 8px; padding: 0; }
.link-btn:hover { text-decoration: underline; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin: 0 0 20px; }
.tab { background: none; border: none; padding: 10px 16px; font-size: 14px; color: var(--text-secondary); cursor: pointer; font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }

.panel { margin-bottom: 24px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin: 0 0 12px; }
.panel-header h2 { font-family: var(--font-display); font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin: 0; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 16px; margin: 0 0 16px; }
.composer { display: flex; flex-direction: column; gap: 12px; }
.composer label { display: flex; flex-direction: column; gap: 4px; font-family: var(--font-display, inherit); font-size: 13px; font-weight: var(--font-weight-bold, 600); color: var(--text); text-transform: uppercase; letter-spacing: 0.06em; }
.composer input, .composer textarea { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: var(--font-body, inherit); font-weight: 400; font-size: 14px; text-transform: none; letter-spacing: 0; }
.composer textarea { resize: vertical; min-height: 64px; }
.composer input:focus, .composer textarea:focus { outline: none; border-color: var(--primary); }
.composer-intro { font-size: 13px; color: var(--text-secondary); margin: 0 0 4px; line-height: 1.5; }
.composer .optional { color: var(--text-secondary); font-style: normal; text-transform: none; letter-spacing: 0; }

.inline-editor { display: flex; flex-direction: column; gap: 10px; }
.inline-editor label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.inline-editor input { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: inherit; font-size: 14px; }

.row-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hint { color: var(--text-secondary); font-size: 12px; margin: 0; }

.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; font-family: inherit; font-size: 13px; cursor: pointer; border-radius: var(--radius-small, 6px); }
.btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary, #fff); }
.btn.primary:hover:not(:disabled) { background: var(--primary-hover, var(--primary)); color: var(--text-on-primary, #fff); }
.btn.ghost { background: none; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.filter-bar select, .search-input { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: inherit; font-size: 13px; }
.search-input { flex: 1; min-width: 180px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border: 1px solid var(--border); }
.data-table th { text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); background: var(--surface-alt); border-bottom: 1px solid var(--border); }
.data-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.data-table a { color: var(--text); text-decoration: none; }
.data-table a:hover { color: var(--primary); }

.status-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; }
.status-pill[data-status="open"] { color: var(--primary); border-color: var(--primary); }
.status-pill[data-status="in_progress"] { color: var(--text); border-color: var(--text-secondary); }
.status-pill[data-status="closed"], .status-pill[data-status="declined"] { color: var(--text-tertiary, var(--text-secondary)); }
.status-pill[data-status="planned"] { color: var(--primary); }
.status-pill[data-status="shipped"] { color: #16a34a; border-color: #16a34a; }

.feature-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.feature-row { display: flex; gap: 12px; padding: 14px; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-small, 6px); }
.vote-button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; min-width: 48px; color: var(--text-secondary); font-family: inherit; }
.vote-button:hover { border-color: var(--primary); color: var(--primary); }
.vote-button.voted { background: var(--primary-soft, var(--primary)); border-color: var(--primary); color: var(--primary); }
.vote-button .arrow { font-size: 11px; }
.vote-button .count { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }

.feature-body { flex: 1; min-width: 0; }
.feature-title { color: var(--text); text-decoration: none; font-size: 15px; font-weight: 600; display: block; margin-bottom: 4px; }
.feature-title:hover { color: var(--primary); }
.feature-excerpt { color: var(--text-secondary); font-size: 13px; line-height: 1.4; margin: 0 0 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.feature-meta { display: flex; gap: 10px; font-size: 11.5px; color: var(--text-tertiary, var(--text-secondary)); flex-wrap: wrap; align-items: center; }

.loading, .empty { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); font-size: 13px; }
</style>
