<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const props = defineProps({ contact: { type: Object, required: true } });

const drafts = ref([]);
const lists = ref([]);
const voices = ref([]);
const error = ref(null);
const loading = ref(true);

const composeFor = ref({ channel: '', listId: '', voiceContactId: '' });
const composing = ref(false);

const channelOptions = computed(() => {
  const types = (props.contact.contactChannels || []).map((c) => c.type);
  // Always allow creator-style channels even if no contactChannel exists
  const fallback = ['email', 'reddit_dm', 'x_dm', 'instagram_dm', 'substack_message', 'contact_form', 'linkedin_inmail'];
  return Array.from(new Set([...types, ...fallback]));
});

async function load() {
  loading.value = true;
  try {
    const [d, l, v] = await Promise.all([
      api.drafts.list({ contactId: props.contact._id }),
      api.lists.list(),
      api.contacts.voices(),
    ]);
    drafts.value = d.drafts;
    lists.value = l.lists;
    voices.value = v.voices;
    if (!composeFor.value.channel) {
      const preferred = (props.contact.contactChannels || []).find((c) => c.isPreferred);
      composeFor.value.channel = preferred?.type || channelOptions.value[0] || 'email';
    }
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);

async function compose() {
  composing.value = true;
  error.value = null;
  try {
    const r = await api.drafts.create({
      contactId: props.contact._id,
      channel: composeFor.value.channel,
      listId: composeFor.value.listId || null,
      voiceContactId: composeFor.value.voiceContactId || null,
      async: true,
    });
    // Poll for the draft
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      await new Promise((res) => setTimeout(res, 800));
      const fresh = await api.drafts.list({ contactId: props.contact._id });
      const found = fresh.drafts.find((d) => d.sourceJobId === r.jobId);
      if (found) {
        drafts.value = fresh.drafts;
        composing.value = false;
        return;
      }
    }
    error.value = 'compose timed out — check back in a moment';
  } catch (e) { error.value = e.message; composing.value = false; }
  finally {
    if (composing.value) composing.value = false;
  }
}

async function update(d, key, value) {
  d[key] = value;
  await api.drafts.update(d._id, { [key]: value });
}

async function approve(d) {
  Object.assign(d, await api.drafts.approve(d._id));
}
async function markSent(d) {
  Object.assign(d, await api.drafts.markSent(d._id));
}
async function discard(d) {
  Object.assign(d, await api.drafts.discard(d._id));
}

// Channel-aware "open" button
function openLink(d) {
  if (d.channel === 'email') {
    const channel = props.contact.contactChannels?.find((c) => c.type === 'email');
    const to = channel?.value || '';
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}`;
    window.open(url);
  } else if (d.channel === 'reddit_dm') {
    const presence = props.contact.presences?.find((p) => p.platform === 'reddit');
    const to = presence?.handle || prompt('Reddit username (without u/):');
    if (!to) return;
    const url = `https://www.reddit.com/message/compose/?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(d.subject || '')}&message=${encodeURIComponent(d.body || '')}`;
    window.open(url, '_blank');
  } else if (d.channel === 'instagram_dm') {
    const presence = props.contact.presences?.find((p) => p.platform === 'instagram');
    const handle = presence?.handle || prompt('Instagram handle:');
    if (!handle) return;
    window.open(`https://ig.me/m/${handle}`, '_blank');
    copyToClipboard(d.body || '');
  } else if (d.channel === 'x_dm') {
    copyToClipboard(d.body || '');
    const presence = props.contact.presences?.find((p) => p.platform === 'x');
    if (presence?.url) window.open(presence.url, '_blank');
    else alert('Body copied. Open X DM manually.');
  } else if (d.channel === 'contact_form') {
    const channel = props.contact.contactChannels?.find((c) => c.type === 'contact_form');
    if (channel?.value) {
      copyToClipboard(d.body || '');
      window.open(channel.value, '_blank');
    } else {
      alert('No contact form URL recorded for this contact.');
    }
  } else {
    copyToClipboard(d.body || '');
    alert('Body copied to clipboard.');
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
}
</script>

<template>
  <div>
    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Compose new draft</h3>
      <p style="margin:0 0 12px;font-size:12px;color:var(--text-dim)">
        Single-shot LLM call. Uses this contact's recentContent, personalizedHooks, the chosen list's pitch context, and the chosen voice's profile.
      </p>
      <div class="row" style="margin-bottom:8px">
        <div class="field" style="margin:0">
          <label class="field-label">Channel</label>
          <select class="select" v-model="composeFor.channel">
            <option v-for="c in channelOptions" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field" style="margin:0">
          <label class="field-label">List context (optional)</label>
          <select class="select" v-model="composeFor.listId">
            <option value="">—</option>
            <option v-for="l in lists" :key="l._id" :value="l._id">{{ l.name }}</option>
          </select>
        </div>
        <div class="field" style="margin:0">
          <label class="field-label">Write as voice (optional)</label>
          <select class="select" v-model="composeFor.voiceContactId">
            <option value="">— neutral —</option>
            <option v-for="v in voices" :key="v._id" :value="v._id">{{ v.name }}</option>
          </select>
        </div>
      </div>
      <button class="btn primary" :disabled="composing" @click="compose">
        {{ composing ? 'Composing…' : 'Compose' }}
      </button>
      <p v-if="error" style="color:var(--bad);margin-top:8px">{{ error }}</p>
    </div>

    <p v-if="loading" class="empty-state">loading…</p>

    <div v-for="d in drafts" :key="d._id" class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <span class="pill accent">{{ d.channel }}</span>
            <span class="pill" :class="{ good: d.status === 'sent', bad: d.status === 'discarded' }">{{ d.status }}</span>
            <span style="font-size:11px;color:var(--text-dim)">${{ Number(d.costUsd || 0).toFixed(4) }} · {{ d.modelUsed }}</span>
          </div>
          <input
            class="input"
            placeholder="subject (omit for DMs)"
            :value="d.subject"
            @blur="(e) => update(d, 'subject', e.target.value)"
            style="margin-bottom:6px;font-weight:600"
          />
          <textarea
            class="textarea"
            rows="6"
            :value="d.body"
            @blur="(e) => update(d, 'body', e.target.value)"
          />
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn" @click="openLink(d)">Open / Copy</button>
            <button class="btn" v-if="d.status === 'draft'" @click="approve(d)">Approve</button>
            <button class="btn primary" v-if="d.status !== 'sent'" @click="markSent(d)">Mark sent</button>
            <button class="btn danger" v-if="d.status !== 'discarded'" @click="discard(d)">Discard</button>
          </div>
          <details style="margin-top:8px;font-size:12px">
            <summary style="cursor:pointer;color:var(--text-dim)">Hook used</summary>
            <p style="margin:4px 0 0;font-style:italic;color:var(--accent-2)">"{{ d.hookSentenceUsed }}"</p>
          </details>
        </div>
      </div>
    </div>

    <div v-if="!loading && drafts.length === 0" class="card">
      <p class="empty-state">No drafts for this contact yet.</p>
    </div>
  </div>
</template>
