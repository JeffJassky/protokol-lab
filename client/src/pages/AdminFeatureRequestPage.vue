<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchAdminFeature,
  updateAdminFeature,
  deleteAdminFeature,
} from '../api/adminSupport.js';
import { addFeatureComment } from '../api/support.js';

const route = useRoute();
const featureId = computed(() => route.params.id);

const feature = ref(null);
const loading = ref(true);
const error = ref(null);
const busy = ref(null);
const banner = ref(null);

const commentBody = ref('');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchAdminFeature(featureId.value);
    feature.value = data.feature;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(featureId, load);

async function changeStatus(next) {
  if (!next || next === feature.value.status) return;
  busy.value = 'status';
  banner.value = null;
  try {
    const { feature: updated } = await updateAdminFeature(featureId.value, { status: next });
    feature.value = { ...feature.value, ...updated };
    banner.value = { ok: true, msg: `Status → ${next}` };
  } catch (e) {
    banner.value = { ok: false, msg: e.message };
  } finally {
    busy.value = null;
  }
}

async function postComment() {
  if (!commentBody.value.trim()) return;
  busy.value = 'comment';
  try {
    const { feature: updated } = await addFeatureComment(featureId.value, commentBody.value.trim());
    feature.value = { ...feature.value, ...updated };
    commentBody.value = '';
  } catch (e) {
    banner.value = { ok: false, msg: e.message };
  } finally {
    busy.value = null;
  }
}

async function removeFeature() {
  if (!confirm(`Delete "${feature.value.title}"? Cannot be undone.`)) return;
  try {
    await deleteAdminFeature(featureId.value);
    location.href = '/admin/support?tab=features';
  } catch (e) {
    banner.value = { ok: false, msg: e.message };
  }
}

const STATUSES = ['open', 'planned', 'in_progress', 'shipped', 'declined'];
const statusLabel = {
  open: 'Open', planned: 'Planned', in_progress: 'In progress', shipped: 'Shipped', declined: 'Declined',
};

function fmtDate(v) { return v ? new Date(v).toLocaleString() : '—'; }
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <router-link to="/admin/support?tab=features" class="back-link">← Feature requests</router-link>
        <h1 v-if="feature">{{ feature.title }}</h1>
        <p v-if="feature" class="subtitle">
          <strong>{{ feature.upvoteCount }}</strong> upvotes
          <span class="muted">· by {{ feature.authorDisplayName || feature.authorEmail }}</span>
          <span class="muted">· {{ fmtDate(feature.createdAt) }}</span>
        </p>
      </div>
      <div v-if="feature" class="header-controls">
        <label>
          <span>Status</span>
          <select
            :value="feature.status"
            :disabled="busy === 'status'"
            @change="changeStatus($event.target.value)"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">{{ statusLabel[s] }}</option>
          </select>
        </label>
        <button class="btn danger" @click="removeFeature">Delete</button>
      </div>
    </header>

    <div v-if="banner" class="banner" :class="{ ok: banner.ok, err: !banner.ok }">{{ banner.msg }}</div>
    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="feature">
      <section class="card description">{{ feature.description }}</section>

      <h2>Comments ({{ feature.comments?.length || 0 }})</h2>
      <ul v-if="feature.comments?.length" class="comments">
        <li v-for="c in feature.comments" :key="c.id" class="comment">
          <div class="comment-head">
            <strong>{{ c.authorDisplayName || c.authorEmail }}</strong>
            <span v-if="c.authorIsAdmin" class="badge admin">Staff</span>
            <span class="muted">{{ fmtDate(c.createdAt) }}</span>
          </div>
          <div class="comment-body">{{ c.body }}</div>
        </li>
      </ul>

      <form class="composer card" @submit.prevent="postComment">
        <label>
          <span>Admin comment</span>
          <textarea v-model="commentBody" rows="3" maxlength="4000" placeholder="Respond as staff (shows Staff badge)" />
        </label>
        <div class="row-actions">
          <button class="btn primary" type="submit" :disabled="busy === 'comment' || !commentBody.trim()">
            {{ busy === 'comment' ? 'Posting…' : 'Post comment' }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.back-link { color: var(--text-secondary); text-decoration: none; font-size: 12px; }
.back-link:hover { color: var(--primary); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 22px; margin: 4px 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.muted { color: var(--text-tertiary, var(--text-secondary)); }

.header-controls { display: flex; gap: 10px; align-items: flex-end; }
.header-controls label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
.header-controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; font-family: inherit; font-size: 13px; }

.banner { padding: 10px 14px; margin-bottom: 16px; font-size: 13px; border: 1px solid; }
.banner.ok { border-color: var(--primary); color: var(--primary); }
.banner.err { border-color: var(--danger, #d9534f); color: var(--danger, #d9534f); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 14px 16px; }
.description { white-space: pre-wrap; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }

h2 { font-family: var(--font-display); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin: 20px 0 10px; }
.comments { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-direction: column; gap: 8px; }
.comment { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 10px 14px; }
.comment-head { display: flex; gap: 10px; align-items: center; font-size: 13px; margin-bottom: 4px; flex-wrap: wrap; }
.comment-head .muted { font-size: 11.5px; margin-left: auto; }
.comment-body { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.badge.admin { background: var(--primary-soft, var(--primary)); color: var(--primary); padding: 1px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 4px; }

.composer { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.composer label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.composer textarea { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: inherit; font-size: 14px; resize: vertical; text-transform: none; letter-spacing: 0; }
.row-actions { display: flex; gap: 10px; }

.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: var(--radius-small, 6px); }
.btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary, #fff); }
.btn.danger { border-color: var(--danger, #d9534f); color: var(--danger, #d9534f); }

.loading, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
