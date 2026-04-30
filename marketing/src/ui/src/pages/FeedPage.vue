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
async function draft(opp) {
  await api.redditEngagement.draft(opp._id);
  setTimeout(load, 1500);
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
  else if (e.key === 'd') draft(opp);
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
  <div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
      <div>
        <h1 class="page-title">Engagement feed</h1>
        <p class="page-sub">
          {{ visible.length }} actionable
          · <span style="color:var(--text-dim)">saved {{ counts.saved || 0 }} · passed {{ counts.passed || 0 }} · replied {{ counts.replied || 0 }} · dismissed {{ counts.dismissed || 0 }}</span>
        </p>
      </div>
      <div style="font-size:11px;color:var(--text-dim);text-align:right">
        <kbd>j</kbd>/<kbd>k</kbd> next/prev · <kbd>p</kbd> pass · <kbd>s</kbd> save · <kbd>d</kbd> draft · <kbd>r</kbd> open · <kbd>m</kbd> mark posted · <kbd>↵</kbd> detail
      </div>
    </div>

    <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
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

    <div
      v-for="(opp, i) in visible"
      :key="opp._id"
      class="card"
      :style="{
        cursor: 'pointer',
        outline: i === activeIndex ? '2px solid var(--accent, #4d8aff)' : 'none',
        outlineOffset: '-1px',
      }"
      @click="activeIndex = i"
    >
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span class="pill">r/{{ opp.subreddit }}</span>
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
        <span style="font-size:11px;color:var(--text-dim);white-space:nowrap">
          {{ ageStr(opp.postedAt) }} ago · u/{{ opp.authorUsername }} · {{ opp.postCommentCount }} comments
        </span>
      </div>

      <strong style="font-size:14px;display:block;margin-bottom:4px">{{ opp.title }}</strong>

      <p
        v-if="opp.triage?.because"
        style="margin:0 0 6px;font-size:12px;color:var(--text-dim);font-style:italic"
      >
        ↳ {{ opp.triage.because }}
      </p>

      <p
        v-if="opp.postExcerpt"
        style="margin:6px 0 0;font-size:13px;line-height:1.45;color:var(--text)"
      >
        {{ opp.postExcerpt.slice(0, 320) }}{{ opp.postExcerpt.length > 320 ? '…' : '' }}
      </p>

      <div
        v-if="opp.draft?.body"
        style="margin-top:8px;padding:8px;background:var(--panel-2);border-radius:4px;border-left:2px solid var(--good, #4caf50)"
      >
        <strong style="font-size:11px;color:var(--text-dim)">Draft preview</strong>
        <p style="margin:2px 0 0;font-size:13px;white-space:pre-wrap;line-height:1.45">
          {{ opp.draft.body.slice(0, 360) }}{{ opp.draft.body.length > 360 ? '…' : '' }}
        </p>
      </div>

      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="pass(opp)" title="p — never show again">Pass</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="save(opp)" title="s — snooze for later">Save</button>
        <button v-if="opp.decision === 'passed'" class="btn" @click.stop="unpass(opp)">Un-pass</button>
        <button v-if="opp.decision === 'pending' && !opp.draft && opp.triage" class="btn primary" @click.stop="draft(opp)" title="d — generate AI draft">Draft</button>
        <button v-if="opp.draft?.body" class="btn primary" @click.stop="openDetail(opp)">Edit draft</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="openOnReddit(opp)" title="r — open in reddit">Open</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click.stop="markPosted(opp)" title="m — mark replied">Mark posted</button>
      </div>
    </div>
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
</style>
