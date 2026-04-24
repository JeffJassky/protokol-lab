<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchFeature,
  upvoteFeature,
  removeUpvote,
  addFeatureComment,
} from '../api/support.js';

const route = useRoute();
const featureId = computed(() => route.params.id);

const feature = ref(null);
const loading = ref(true);
const error = ref(null);
const voteBusy = ref(false);

const commentBody = ref('');
const posting = ref(false);
const commentErr = ref(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchFeature(featureId.value);
    feature.value = data.feature;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(featureId, load);

async function toggleVote() {
  voteBusy.value = true;
  try {
    const res = feature.value.upvotedByMe
      ? await removeUpvote(feature.value.id)
      : await upvoteFeature(feature.value.id);
    feature.value = { ...feature.value, ...res.feature };
  } catch (e) {
    error.value = e.message;
  } finally {
    voteBusy.value = false;
  }
}

async function submitComment() {
  if (!commentBody.value.trim()) return;
  posting.value = true;
  commentErr.value = null;
  try {
    const { feature: updated } = await addFeatureComment(featureId.value, commentBody.value.trim());
    feature.value = updated;
    commentBody.value = '';
  } catch (e) {
    commentErr.value = e.message;
  } finally {
    posting.value = false;
  }
}

const statusLabel = {
  open: 'Open', planned: 'Planned', in_progress: 'In progress', shipped: 'Shipped', declined: 'Declined',
};

function fmtDate(v) {
  return v ? new Date(v).toLocaleString() : '—';
}
</script>

<template>
  <div class="feature-detail">
    <header class="page-header">
      <router-link to="/support?tab=features" class="back-link">← Feature requests</router-link>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="feature">
      <div class="feature-head">
        <button
          class="vote-button"
          :class="{ voted: feature.upvotedByMe }"
          :disabled="voteBusy"
          @click="toggleVote"
        >
          <span class="arrow">▲</span>
          <span class="count">{{ feature.upvoteCount }}</span>
        </button>
        <div class="head-body">
          <h1>{{ feature.title }}</h1>
          <div class="head-meta">
            <span class="status-pill" :data-status="feature.status">{{ statusLabel[feature.status] }}</span>
            <span>Posted by {{ feature.authorDisplayName || feature.authorEmail?.split('@')[0] }}</span>
            <span class="muted">{{ fmtDate(feature.createdAt) }}</span>
          </div>
        </div>
      </div>

      <section class="card description">{{ feature.description }}</section>

      <h2>Comments ({{ feature.comments?.length || 0 }})</h2>

      <ul v-if="feature.comments?.length" class="comments">
        <li v-for="c in feature.comments" :key="c.id" class="comment">
          <div class="comment-head">
            <strong>{{ c.authorDisplayName || c.authorEmail?.split('@')[0] }}</strong>
            <span v-if="c.authorIsAdmin" class="badge admin">Staff</span>
            <span class="muted">{{ fmtDate(c.createdAt) }}</span>
          </div>
          <div class="comment-body">{{ c.body }}</div>
        </li>
      </ul>

      <form class="composer card" @submit.prevent="submitComment">
        <label>
          <span>Add a comment</span>
          <textarea v-model="commentBody" maxlength="4000" rows="3" placeholder="Thoughts, use case, +1…" />
        </label>
        <p v-if="commentErr" class="error">{{ commentErr }}</p>
        <div class="row-actions">
          <button class="btn primary" type="submit" :disabled="posting || !commentBody.trim()">
            {{ posting ? 'Posting…' : 'Post comment' }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.feature-detail { font-family: var(--font-body); color: var(--text); }
.back-link { color: var(--text-secondary); text-decoration: none; font-size: 12px; }
.back-link:hover { color: var(--primary); }

.feature-head { display: flex; gap: 14px; margin: 14px 0 18px; align-items: flex-start; }
.head-body h1 { font-family: var(--font-display); font-size: 22px; margin: 0 0 6px; }
.head-meta { display: flex; gap: 10px; font-size: 13px; color: var(--text-secondary); align-items: center; flex-wrap: wrap; }
.muted { color: var(--text-tertiary, var(--text-secondary)); }

.vote-button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; min-width: 60px; color: var(--text-secondary); font-family: inherit; }
.vote-button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.vote-button:disabled { opacity: 0.5; cursor: not-allowed; }
.vote-button.voted { background: var(--primary-soft, var(--primary)); border-color: var(--primary); color: var(--primary); }
.vote-button .arrow { font-size: 12px; }
.vote-button .count { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 14px 16px; }
.description { white-space: pre-wrap; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }

h2 { font-family: var(--font-display); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin: 20px 0 10px; }

.comments { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-direction: column; gap: 8px; }
.comment { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-small, 6px); padding: 10px 14px; }
.comment-head { display: flex; gap: 10px; align-items: center; font-size: 13px; margin-bottom: 4px; flex-wrap: wrap; }
.comment-head .muted { font-size: 11.5px; margin-left: auto; }
.comment-body { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.badge.admin { background: var(--primary-soft, var(--primary)); color: var(--primary); padding: 1px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 4px; }

.composer { display: flex; flex-direction: column; gap: 10px; }
.composer label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.composer textarea { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: inherit; font-size: 14px; resize: vertical; text-transform: none; letter-spacing: 0; }
.composer textarea:focus { outline: none; border-color: var(--primary); }

.row-actions { display: flex; gap: 10px; align-items: center; }
.btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; font-size: 13px; cursor: pointer; border-radius: var(--radius-small, 6px); font-family: inherit; }
.btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary, #fff); }

.status-pill { display: inline-block; padding: 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; }
.status-pill[data-status="open"] { color: var(--primary); border-color: var(--primary); }
.status-pill[data-status="planned"] { color: var(--primary); }
.status-pill[data-status="in_progress"] { color: var(--text); }
.status-pill[data-status="shipped"] { color: #16a34a; border-color: #16a34a; }
.status-pill[data-status="declined"] { color: var(--text-tertiary, var(--text-secondary)); }

.loading, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
