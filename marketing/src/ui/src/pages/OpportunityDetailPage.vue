<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';

const route = useRoute();
const router = useRouter();
const opp = ref(null);
const error = ref(null);
const draftDirty = ref(false);
const localDraftBody = ref('');
const steeringNote = ref('');

async function load() {
  try {
    opp.value = await api.redditEngagement.getOpportunity(route.params.id);
    localDraftBody.value = opp.value.draft?.body || '';
    draftDirty.value = false;
  } catch (e) { error.value = e.message; }
}
onMounted(load);
watch(() => route.params.id, load);

async function saveDraft() {
  await api.redditEngagement.updateOpportunity(route.params.id, { draftBody: localDraftBody.value });
  draftDirty.value = false;
  load();
}

async function rerunDraft() {
  await api.redditEngagement.draft(route.params.id, steeringNote.value || undefined);
  alert('Re-draft enqueued. Refresh in a moment.');
}

async function dismiss() {
  if (!confirm('Dismiss this opportunity?')) return;
  await api.redditEngagement.dismiss(route.params.id);
  router.push({ name: 'reddit-feed' });
}

async function passIt() {
  await api.redditEngagement.pass(route.params.id);
  router.push({ name: 'reddit-feed' });
}

async function saveIt() {
  await api.redditEngagement.save(route.params.id);
  router.push({ name: 'reddit-feed' });
}

async function markPosted() {
  const url = prompt('Reddit comment URL (optional):') || '';
  await api.redditEngagement.markPosted(route.params.id, url);
  router.push({ name: 'reddit-feed' });
}

async function linkAuthor() {
  await api.redditEngagement.linkAuthorToContact(route.params.id);
  load();
}

function openOnReddit() {
  window.open(opp.value.postUrl, '_blank');
}
</script>

<template>
  <div v-if="!opp"><p class="empty-state">loading…</p></div>
  <div v-else>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">r/{{ opp.subreddit }} — {{ opp.title }}</h1>
        <p class="page-sub">
          <span class="pill">{{ opp.status }}</span>
          <span v-if="opp.decision && opp.decision !== 'pending'" class="pill" style="margin-left:6px;background:#444">{{ opp.decision }}</span>
          <span v-if="opp.triage?.bucket" class="pill" style="margin-left:6px">{{ opp.triage.bucket }}</span>
          <span style="margin-left:6px;color:var(--text-dim);font-size:12px">u/{{ opp.authorUsername }} · score {{ opp.postScore }} · {{ opp.postCommentCount }} comments</span>
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" @click="openOnReddit">Open on Reddit</button>
        <button class="btn" @click="passIt" v-if="opp.decision === 'pending'">Pass</button>
        <button class="btn" @click="saveIt" v-if="opp.decision === 'pending'">Save for later</button>
        <button class="btn danger" @click="dismiss">Dismiss</button>
      </div>
    </div>
    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:14px">Original post</h3>
      <p style="margin:0;font-size:13px;line-height:1.5;white-space:pre-wrap">{{ opp.postExcerpt }}</p>
    </div>

    <div v-if="opp.triage" class="card">
      <h3 style="margin:0 0 8px;font-size:14px">Triage</h3>
      <dl class="kv">
        <dt>Bucket</dt><dd>{{ opp.triage.bucket }}</dd>
        <dt>Because</dt><dd>{{ opp.triage.because || '—' }}</dd>
      </dl>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:14px">Draft reply</h3>
      <p v-if="!opp.draft" class="empty-state" style="margin-bottom:8px">No draft yet.</p>
      <textarea
        v-if="opp.draft || localDraftBody"
        class="textarea"
        rows="10"
        :value="localDraftBody"
        @input="(e) => { localDraftBody = e.target.value; draftDirty = true; }"
      />
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" :disabled="!draftDirty" @click="saveDraft">Save draft edits</button>
        <button class="btn" @click="rerunDraft">Re-draft via AI</button>
        <button class="btn primary" v-if="opp.status !== 'posted'" @click="markPosted">Mark posted (paste URL)</button>
        <button class="btn" v-if="!opp.authorContactId && opp.authorUsername" @click="linkAuthor">Link author → Contact</button>
        <a v-if="opp.authorContactId" :href="`/contacts/${opp.authorContactId}`" class="btn">Open linked Contact</a>
      </div>
      <div style="margin-top:8px">
        <input class="input" v-model="steeringNote" placeholder="Optional steering note for re-draft (e.g. 'shorter, more skeptical')" />
      </div>
    </div>

    <div v-if="opp.postedCommentUrl" class="card">
      <h3 style="margin:0 0 8px;font-size:14px">Posted</h3>
      <p style="margin:0;font-size:13px"><a :href="opp.postedCommentUrl" target="_blank" rel="noopener">{{ opp.postedCommentUrl }}</a></p>
    </div>
  </div>
</template>
