<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const filters = reactive({ status: '', fit: '', subreddit: '' });
const data = ref({ opportunities: [], total: 0 });
const subs = ref([]);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  try {
    const params = {
      status: filters.status || undefined,
      fit: filters.fit || undefined,
      subreddit: filters.subreddit || undefined,
      limit: 100,
    };
    const [opps, s] = await Promise.all([
      api.redditEngagement.listOpportunities(params),
      api.redditEngagement.listSubreddits(),
    ]);
    data.value = opps;
    subs.value = s.subreddits;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);
watch(filters, load, { deep: true });

async function triage(opp) {
  await api.redditEngagement.triage(opp._id);
  alert('Triage enqueued. Refresh in a moment.');
}
async function draft(opp) {
  await api.redditEngagement.draft(opp._id);
  alert('Draft enqueued. Refresh in a moment.');
}
async function dismiss(opp) {
  if (!confirm('Dismiss this opportunity?')) return;
  await api.redditEngagement.dismiss(opp._id);
  load();
}
</script>

<template>
  <div>
    <h1 class="page-title">Engagement feed</h1>
    <p class="page-sub">{{ data.total }} opportunities. Triage / draft / dismiss / mark-posted.</p>

    <div class="toolbar">
      <select class="select" style="max-width:160px" v-model="filters.status">
        <option value="">any status</option>
        <option v-for="s in ['new', 'triaged', 'drafted', 'reviewed', 'posted', 'dismissed', 'low-fit-archived']" :key="s" :value="s">{{ s }}</option>
      </select>
      <select class="select" style="max-width:140px" v-model="filters.fit">
        <option value="">any fit</option>
        <option v-for="f in ['high', 'medium', 'low', 'no']" :key="f" :value="f">{{ f }}</option>
      </select>
      <select class="select" style="max-width:200px" v-model="filters.subreddit">
        <option value="">any subreddit</option>
        <option v-for="s in subs" :key="s._id" :value="s.subreddit">r/{{ s.subreddit }}</option>
      </select>
    </div>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-else-if="loading" class="empty-state">loading…</p>

    <div v-else-if="data.opportunities.length === 0" class="card">
      <p class="empty-state">No opportunities. Add a monitored subreddit and let scans run, or click "Scan now".</p>
    </div>

    <div v-for="opp in data.opportunities" :key="opp._id" class="card"
         style="cursor:pointer"
         @click="router.push({ name: 'opportunity-detail', params: { id: opp._id } })">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
        <div>
          <span class="pill">r/{{ opp.subreddit }}</span>
          <span class="pill" style="margin-left:6px">{{ opp.status }}</span>
          <span v-if="opp.triage?.fit" class="pill"
                :class="{ good: opp.triage.fit === 'high', accent: opp.triage.fit === 'medium', warn: opp.triage.fit === 'low', bad: opp.triage.fit === 'no' }"
                style="margin-left:6px">fit: {{ opp.triage.fit }}</span>
        </div>
        <span style="font-size:11px;color:var(--text-dim)">{{ new Date(opp.postedAt).toLocaleString() }}</span>
      </div>
      <strong style="font-size:14px">{{ opp.title }}</strong>
      <p style="margin:6px 0 0;font-size:12px;color:var(--text-dim)">u/{{ opp.authorUsername }} · score {{ opp.postScore }} · {{ opp.postCommentCount }} comments</p>
      <p v-if="opp.postExcerpt" style="margin:6px 0 0;font-size:13px;line-height:1.4">{{ opp.postExcerpt.slice(0, 280) }}…</p>

      <div v-if="opp.triage?.valueAngle" style="margin-top:8px;padding:8px;background:var(--panel-2);border-radius:4px">
        <strong style="font-size:11px;color:var(--text-dim)">Triage angle:</strong>
        <p style="margin:2px 0 0;font-size:13px">{{ opp.triage.valueAngle }}</p>
      </div>

      <div v-if="opp.draft?.body" style="margin-top:8px;padding:8px;background:var(--panel-2);border-radius:4px">
        <strong style="font-size:11px;color:var(--text-dim)">Draft preview:</strong>
        <p style="margin:2px 0 0;font-size:13px;white-space:pre-wrap;line-height:1.4">{{ opp.draft.body.slice(0, 320) }}{{ opp.draft.body.length > 320 ? '…' : '' }}</p>
      </div>

      <div style="margin-top:8px;display:flex;gap:6px">
        <button v-if="!opp.triage" class="btn" @click.stop="triage(opp)">Triage</button>
        <button v-if="opp.triage && !opp.draft" class="btn" @click.stop="draft(opp)">Draft</button>
        <button v-if="opp.status !== 'dismissed'" class="btn danger" @click.stop="dismiss(opp)">Dismiss</button>
        <a v-if="opp.postUrl" :href="opp.postUrl" target="_blank" rel="noopener" class="btn" @click.stop>Open post</a>
      </div>
    </div>
  </div>
</template>
