<script setup>
import { ref, reactive, computed, onMounted, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();

// Default view: actionable buckets (DIRECT_ASK + INDIRECT_PROBLEM), pending
// decision. The whole point of the feed is "what should I reply to right now."
const filters = reactive({
  showBucket: 'actionable',  // 'actionable' | 'all-replyable' | 'direct' | 'indirect' | 'topic' | 'all'
  showDecision: 'pending',   // 'pending' | 'saved' | 'passed' | 'replied' | 'dismissed' | 'all'
  subreddit: '',
});

const data = ref({ opportunities: [], total: 0, decisionCounts: {} });
const subs = ref([]);
const loading = ref(true);
const error = ref(null);
const activeIndex = ref(0);

function bucketFilter() {
  switch (filters.showBucket) {
    case 'actionable':    return 'DIRECT_ASK,INDIRECT_PROBLEM';
    case 'all-replyable': return 'DIRECT_ASK,INDIRECT_PROBLEM,TOPIC_ADJACENT';
    case 'direct':        return 'DIRECT_ASK';
    case 'indirect':      return 'INDIRECT_PROBLEM';
    case 'topic':         return 'TOPIC_ADJACENT';
    case 'all':           return undefined;
    default:              return undefined;
  }
}

async function load() {
  loading.value = true;
  try {
    const [opps, s] = await Promise.all([
      api.redditEngagement.listOpportunities({
        decision: filters.showDecision === 'all' ? '' : filters.showDecision,
        bucket: bucketFilter(),
        subreddit: filters.subreddit || undefined,
        limit: 100,
      }),
      api.redditEngagement.listSubreddits(),
    ]);
    // Sort: DIRECT_ASK first (time-sensitive — hour window matters),
    // then INDIRECT_PROBLEM, then TOPIC_ADJACENT, then by recency within each.
    const bucketOrder = { DIRECT_ASK: 0, INDIRECT_PROBLEM: 1, TOPIC_ADJACENT: 2, SKIP: 3 };
    opps.opportunities.sort((a, b) => {
      const ba = bucketOrder[a.triage?.bucket] ?? 99;
      const bb = bucketOrder[b.triage?.bucket] ?? 99;
      if (ba !== bb) return ba - bb;
      return new Date(b.postedAt) - new Date(a.postedAt);
    });
    data.value = opps;
    subs.value = s.subreddits;
    if (activeIndex.value >= opps.opportunities.length) activeIndex.value = 0;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);
watch(filters, load, { deep: true });

const visible = computed(() => data.value.opportunities);
const counts = computed(() => data.value.decisionCounts || {});

async function pass(opp) {
  await api.redditEngagement.pass(opp._id);
  removeFromList(opp._id);
}
async function save(opp) {
  await api.redditEngagement.save(opp._id);
  removeFromList(opp._id);
}
async function dismiss(opp) {
  await api.redditEngagement.dismiss(opp._id);
  removeFromList(opp._id);
}
async function unpass(opp) {
  await api.redditEngagement.unpass(opp._id);
  load();
}
async function markPosted(opp) {
  const url = prompt('Reddit comment URL (optional, paste if you have it):') || '';
  await api.redditEngagement.markPosted(opp._id, url);
  removeFromList(opp._id);
}

function removeFromList(id) {
  const idx = visible.value.findIndex((o) => o._id === id);
  if (idx >= 0) {
    data.value.opportunities.splice(idx, 1);
    data.value.total = Math.max(0, data.value.total - 1);
  }
  if (activeIndex.value >= visible.value.length) {
    activeIndex.value = Math.max(0, visible.value.length - 1);
  }
}

function openOnReddit(opp) {
  if (opp.postUrl) window.open(opp.postUrl, '_blank', 'noopener');
}

function openDetail(opp) {
  router.push({ name: 'opportunity-detail', params: { id: opp._id } });
}

function onKey(e) {
  if (e.target.matches('input,textarea,select')) return;
  const opp = visible.value[activeIndex.value];
  if (e.key === 'j') { activeIndex.value = Math.min(visible.value.length - 1, activeIndex.value + 1); e.preventDefault(); }
  else if (e.key === 'k') { activeIndex.value = Math.max(0, activeIndex.value - 1); e.preventDefault(); }
  else if (!opp) return;
  else if (e.key === 'p') pass(opp);
  else if (e.key === 's') save(opp);
  else if (e.key === 'r') openOnReddit(opp);
  else if (e.key === 'Enter') openDetail(opp);
  else if (e.key === 'm') markPosted(opp);
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

// Bucket → pill color + display label.
const BUCKET_META = {
  DIRECT_ASK:       { label: 'direct ask',  cls: 'good',   tip: 'User explicitly asked for an app — reply ASAP, recommend the app.' },
  INDIRECT_PROBLEM: { label: 'indirect',    cls: 'accent', tip: 'User has a problem the app solves — substance-first reply, app as footnote.' },
  TOPIC_ADJACENT:   { label: 'topic',       cls: 'warn',   tip: 'On-topic for the niche but not about the app. Useful comment, no app mention.' },
  SKIP:             { label: 'skip',        cls: 'bad',    tip: 'Off-topic / vent / drama. Tombstoned automatically.' },
};
function bucketMeta(b) { return BUCKET_META[b] || { label: b || '?', cls: '', tip: '' }; }

function ageStr(d) {
  const ms = Date.now() - new Date(d).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Time-sensitive flag: DIRECT_ASK posts older than 1h get a clock indicator.
function isStaleDirect(opp) {
  if (opp.triage?.bucket !== 'DIRECT_ASK') return false;
  return Date.now() - new Date(opp.postedAt).getTime() > 3600 * 1000;
}
</script>

<template>
  <div class="feed-wrap">
    <div class="feed-head">
      <div>
        <h1 class="page-title">Engagement feed</h1>
        <p class="page-sub">
          {{ visible.length }} actionable
          · <span style="color:var(--text-dim)">saved {{ counts.saved || 0 }} · passed {{ counts.passed || 0 }} · replied {{ counts.replied || 0 }} · dismissed {{ counts.dismissed || 0 }}</span>
        </p>
      </div>
      <div class="kbd-hints">
        <kbd>j</kbd>/<kbd>k</kbd> next/prev · <kbd>p</kbd> pass · <kbd>s</kbd> save · <kbd>r</kbd> open · <kbd>m</kbd> mark posted · <kbd>↵</kbd> open detail to draft
      </div>
    </div>

    <div class="toolbar">
      <select class="select" style="max-width:200px" v-model="filters.showBucket">
        <option value="actionable">Actionable (Direct + Indirect)</option>
        <option value="all-replyable">All replyable (+ Topic)</option>
        <option value="direct">Direct asks only</option>
        <option value="indirect">Indirect problems only</option>
        <option value="topic">Topic-adjacent only</option>
        <option value="all">All buckets</option>
      </select>
      <select class="select" style="max-width:170px" v-model="filters.showDecision">
        <option value="pending">Pending</option>
        <option value="saved">Saved</option>
        <option value="passed">Passed</option>
        <option value="replied">Replied</option>
        <option value="dismissed">Dismissed</option>
        <option value="all">All</option>
      </select>
      <select class="select" style="max-width:200px" v-model="filters.subreddit">
        <option value="">Any subreddit</option>
        <option v-for="s in subs" :key="s._id" :value="s.subreddit">r/{{ s.subreddit }}</option>
      </select>
    </div>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-else-if="loading" class="empty-state">loading…</p>

    <div v-else-if="visible.length === 0" class="card">
      <p class="empty-state">
        Nothing actionable right now.
        <span v-if="filters.showDecision === 'pending'">
          Try "Scan now" on a subreddit, or change the bucket / decision filter.
        </span>
      </p>
    </div>

    <article
      v-for="(opp, i) in visible"
      :key="opp._id"
      class="post"
      :class="{ 'post--active': i === activeIndex }"
      @click="activeIndex = i"
    >
      <header class="post-meta">
        <span class="post-meta__sub">r/{{ opp.subreddit }}</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__user">Posted by u/{{ opp.authorUsername }}</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__time">{{ ageStr(opp.postedAt) }} ago</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__time">{{ opp.postCommentCount }} comments</span>
      </header>

      <h2 class="post-title">{{ opp.title }}</h2>

      <div class="post-pills">
        <span
          v-if="opp.triage?.bucket"
          class="pill"
          :class="bucketMeta(opp.triage.bucket).cls"
          :title="bucketMeta(opp.triage.bucket).tip"
        >{{ bucketMeta(opp.triage.bucket).label }}</span>
        <span v-if="isStaleDirect(opp)" class="pill bad" title="DIRECT_ASK posted >1h ago — visibility window closing">⏰ stale</span>
        <span v-if="opp.draft?.body" class="pill good">drafted</span>
        <span v-if="opp.decision !== 'pending'" class="pill" style="background:#444">{{ opp.decision }}</span>
      </div>

      <div v-if="opp.postExcerpt" class="post-body">{{ opp.postExcerpt }}</div>

      <aside v-if="opp.triage?.because" class="triage-note">
        <span class="triage-note__label">Why surfaced</span>
        <span class="triage-note__text">{{ opp.triage.because }}</span>
      </aside>

      <section v-if="opp.draft?.body" class="draft-preview">
        <header class="draft-preview__label">Draft preview</header>
        <p class="draft-preview__body">{{ opp.draft.body.slice(0, 360) }}{{ opp.draft.body.length > 360 ? '…' : '' }}</p>
      </section>

      <div class="post-actions">
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="pass(opp)" title="p — never show again">Pass</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="save(opp)" title="s — snooze for later">Save</button>
        <button v-if="opp.decision === 'passed'" class="btn" @click.stop="unpass(opp)">Un-pass</button>
        <button v-if="opp.decision === 'pending'" class="btn primary" @click.stop="openDetail(opp)">{{ opp.draft?.body ? 'Edit draft' : 'Draft reply' }}</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="openOnReddit(opp)" title="r — open in reddit">Open</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="markPosted(opp)" title="m — mark replied">Mark posted</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
kbd {
  background: var(--panel-2);
  border: 1px solid var(--border, #333);
  border-radius: 3px;
  padding: 1px 4px;
  font-family: monospace;
  font-size: 10px;
}

.feed-wrap {
  max-width: 760px;
  margin: 0 auto;
}

.feed-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.kbd-hints {
  font-size: 11px;
  color: var(--text-dim);
  text-align: right;
}

.post {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: border-color 120ms ease;
}
.post:hover { border-color: #4a525e; }
.post--active {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 6px;
}
.post-meta__sub {
  color: var(--text);
  font-weight: 600;
}
.post-meta__user {
  color: var(--text-dim);
}
.post-meta__sep {
  opacity: 0.6;
}

.post-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0 0 8px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.post-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.post-body {
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0 0 12px;
}

.triage-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 0 0 12px;
}
.triage-note__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent);
  white-space: nowrap;
  padding-top: 2px;
}
.triage-note__text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-dim);
}

.draft-preview {
  background: var(--panel-2);
  border-left: 2px solid var(--good);
  border-radius: 4px;
  padding: 10px 12px;
  margin: 0 0 12px;
}
.draft-preview__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin-bottom: 4px;
}
.draft-preview__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.post-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
</style>
