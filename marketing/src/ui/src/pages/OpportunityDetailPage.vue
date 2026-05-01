<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';

const route = useRoute();
const router = useRouter();

const opp = ref(null);
const error = ref(null);

// Draft body — single source of truth for the canonical reply text.
// Updated by: load(), agent set_draft tool calls (via SSE), manual edits.
const draftBody = ref('');
const draftDirty = ref(false);

// Chat state.
const messages = ref([]);
const inFlight = ref(false);
const composerInput = ref('');
const streamingAssistant = ref(null); // { text, toolUses: [{ id, name, input, result, isError }] }
const messagesEl = ref(null);
let eventSource = null;

const BUCKET_META = {
  DIRECT_ASK:       { label: 'direct ask',  cls: 'good',   tip: 'User explicitly asked for an app — reply ASAP.' },
  INDIRECT_PROBLEM: { label: 'indirect',    cls: 'accent', tip: 'User has a problem the app solves.' },
  TOPIC_ADJACENT:   { label: 'topic',       cls: 'warn',   tip: 'On-topic for niche, no app mention.' },
  SKIP:             { label: 'skip',        cls: 'bad',    tip: 'Off-topic / vent / drama.' },
};
function bucketMeta(b) { return BUCKET_META[b] || { label: b || '?', cls: '', tip: '' }; }

function ageStr(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const draftCharCount = computed(() => draftBody.value.length);

async function load() {
  try {
    opp.value = await api.redditEngagement.getOpportunity(route.params.id);
  } catch (e) { error.value = e.message; }
}

async function loadChat() {
  try {
    const r = await api.redditEngagement.chatMessages(route.params.id);
    messages.value = r.messages || [];
    if (!draftDirty.value) draftBody.value = r.draftBody || '';
    inFlight.value = !!r.inFlight;
    scrollToBottomSoon();
  } catch (e) { error.value = e.message; }
}

function startStream() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(api.redditEngagement.chatStreamUrl(route.params.id));
  eventSource.onmessage = (e) => {
    let evt;
    try { evt = JSON.parse(e.data); } catch { return; }
    handleEvent(evt);
  };
  eventSource.onerror = () => {
    // Browser auto-reconnects. No-op.
  };
}

function ensureStreamingTurn() {
  if (!streamingAssistant.value) {
    streamingAssistant.value = { text: '', toolUses: [] };
  }
}

function handleEvent(evt) {
  if (evt.type === 'user-message') {
    // Server already persisted; reflect locally if not already present
    // (covers SSE-arrived-before-our-optimistic-append edge case).
    const last = messages.value[messages.value.length - 1];
    if (!(last && last.role === 'user' && last.content === evt.content)) {
      messages.value.push({ role: 'user', content: evt.content, ts: evt.ts });
    }
    ensureStreamingTurn();
    inFlight.value = true;
    scrollToBottomSoon();
  } else if (evt.type === 'assistant-text') {
    ensureStreamingTurn();
    streamingAssistant.value.text += evt.text;
    scrollToBottomSoon();
  } else if (evt.type === 'tool-use') {
    ensureStreamingTurn();
    streamingAssistant.value.toolUses.push({
      id: evt.toolUseId,
      name: evt.name,
      input: evt.input,
      result: null,
      isError: false,
    });
    // Live-preview the draft as soon as the agent writes it.
    if (evt.name === 'set_draft' && evt.input?.body && !draftDirty.value) {
      draftBody.value = evt.input.body;
    }
    scrollToBottomSoon();
  } else if (evt.type === 'tool-result') {
    if (!streamingAssistant.value) return;
    const t = streamingAssistant.value.toolUses.find((x) => x.id === evt.toolUseId);
    if (t) {
      t.result = typeof evt.content === 'string' ? evt.content : JSON.stringify(evt.content);
      t.isError = !!evt.isError;
    }
  } else if (evt.type === 'done') {
    streamingAssistant.value = null;
    inFlight.value = false;
    loadChat();
  } else if (evt.type === 'error') {
    inFlight.value = false;
    error.value = evt.message;
    streamingAssistant.value = null;
  } else if (evt.type === 'cleared') {
    messages.value = [];
    streamingAssistant.value = null;
    inFlight.value = false;
  }
}

async function sendMessage() {
  const content = composerInput.value.trim();
  if (!content || inFlight.value) return;
  composerInput.value = '';
  // Optimistic append for instant UX; server SSE may also push it (handled).
  messages.value.push({ role: 'user', content, ts: new Date().toISOString() });
  inFlight.value = true;
  ensureStreamingTurn();
  scrollToBottomSoon();
  try {
    await api.redditEngagement.chatSend(route.params.id, content);
  } catch (e) {
    error.value = e.message;
    inFlight.value = false;
    streamingAssistant.value = null;
  }
}

async function clearChat() {
  if (!confirm('Clear chat history and start a fresh session? Draft body is kept.')) return;
  try {
    await api.redditEngagement.chatClear(route.params.id);
    await loadChat();
  } catch (e) { error.value = e.message; }
}

async function saveDraft() {
  try {
    await api.redditEngagement.updateOpportunity(route.params.id, { draftBody: draftBody.value });
    draftDirty.value = false;
  } catch (e) { error.value = e.message; }
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
function openOnReddit() { window.open(opp.value.postUrl, '_blank'); }

function scrollToBottomSoon() {
  nextTick(() => {
    const el = messagesEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function onComposerKey(e) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    sendMessage();
  }
}

function toolLabel(name) {
  if (name === 'fetch_my_recent_comments') return 'Fetched recent comments';
  if (name === 'fetch_post_thread') return 'Fetched post';
  if (name === 'set_draft') return 'Updated draft';
  return name;
}

function load_all() {
  load();
  loadChat();
  startStream();
}

onMounted(load_all);
watch(() => route.params.id, () => {
  if (eventSource) { eventSource.close(); eventSource = null; }
  load_all();
});
onUnmounted(() => { if (eventSource) eventSource.close(); });
</script>

<template>
  <div v-if="!opp" class="detail-wrap"><p class="empty-state">loading…</p></div>
  <div v-else class="detail-wrap">
    <router-link :to="{ name: 'reddit-feed' }" class="back-link">← Engagement feed</router-link>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <article class="post post--detail">
      <header class="post-meta">
        <span class="post-meta__sub">r/{{ opp.subreddit }}</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__user">Posted by u/{{ opp.authorUsername }}</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__time">{{ ageStr(opp.postedAt) }} ago</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__time">score {{ opp.postScore ?? 0 }}</span>
        <span class="post-meta__sep">·</span>
        <span class="post-meta__time">{{ opp.postCommentCount }} comments</span>
      </header>

      <h1 class="post-title">{{ opp.title }}</h1>

      <div class="post-pills">
        <span class="pill">{{ opp.status }}</span>
        <span
          v-if="opp.triage?.bucket"
          class="pill"
          :class="bucketMeta(opp.triage.bucket).cls"
          :title="bucketMeta(opp.triage.bucket).tip"
        >{{ bucketMeta(opp.triage.bucket).label }}</span>
        <span v-if="opp.decision && opp.decision !== 'pending'" class="pill" style="background:#444">{{ opp.decision }}</span>
      </div>

      <div v-if="opp.postExcerpt" class="post-body">{{ opp.postExcerpt }}</div>

      <aside v-if="opp.triage?.because" class="triage-note">
        <span class="triage-note__label">Why surfaced</span>
        <span class="triage-note__text">{{ opp.triage.because }}</span>
      </aside>

      <div class="post-actions">
        <button class="btn" @click="openOnReddit">Open on Reddit</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click="passIt">Pass</button>
        <button v-if="opp.decision === 'pending'" class="btn" @click="saveIt">Save for later</button>
        <button v-if="!opp.authorContactId && opp.authorUsername" class="btn" @click="linkAuthor">Link author → Contact</button>
        <router-link v-if="opp.authorContactId" :to="`/contacts/${opp.authorContactId}`" class="btn">Open linked Contact</router-link>
        <button class="btn danger" @click="dismiss">Dismiss</button>
      </div>
    </article>

    <section class="section">
      <header class="section-head">
        <h2 class="section-title">Draft reply</h2>
        <span class="section-meta">
          <span v-if="draftBody">{{ draftCharCount }} chars</span>
          <span v-if="draftDirty" style="color:var(--warn);margin-left:8px">unsaved</span>
        </span>
      </header>

      <textarea
        class="textarea draft-textarea"
        rows="10"
        :value="draftBody"
        @input="(e) => { draftBody = e.target.value; draftDirty = true; }"
        placeholder="The agent will write a draft here. Edit by hand at any time."
      />

      <div class="post-actions" style="margin-top:12px">
        <button class="btn primary" :disabled="!draftDirty" @click="saveDraft">Save draft edits</button>
        <button v-if="opp.status !== 'posted'" class="btn primary" @click="markPosted">Mark posted (paste URL)</button>
      </div>
    </section>

    <section class="section">
      <header class="section-head">
        <h2 class="section-title">Drafting chat</h2>
        <span class="section-meta">
          <span v-if="inFlight" class="chat-pulse">agent thinking…</span>
          <button v-if="messages.length" class="btn-link" @click="clearChat">clear</button>
        </span>
      </header>

      <div ref="messagesEl" class="chat-messages">
        <p v-if="!messages.length && !streamingAssistant" class="empty-state" style="margin:0">
          Ask the agent to draft a reply. It will pull the post + your recent comments first.
        </p>

        <div v-for="(m, i) in messages" :key="i" class="msg" :class="`msg--${m.role}`">
          <div class="msg__role">{{ m.role === 'tool_use' ? toolLabel(m.toolName) : m.role }}</div>
          <div v-if="m.role === 'tool_use'" class="msg__tool">
            <code>{{ m.toolName }}({{ m.content }})</code>
          </div>
          <div v-else-if="m.role === 'tool_result'" class="msg__tool" :class="{ 'msg__tool--err': m.isError }">
            <details>
              <summary>{{ toolLabel(m.toolName) }} result</summary>
              <pre>{{ m.content }}</pre>
            </details>
          </div>
          <div v-else class="msg__body">{{ m.content }}</div>
        </div>

        <div v-if="streamingAssistant" class="msg msg--assistant msg--streaming">
          <div class="msg__role">assistant</div>
          <div v-for="t in streamingAssistant.toolUses" :key="t.id" class="msg__tool">
            <span class="tool-tag" :class="{ 'tool-tag--err': t.isError, 'tool-tag--pending': t.result === null }">
              {{ t.result === null ? '…' : (t.isError ? '✕' : '✓') }} {{ toolLabel(t.name) }}
            </span>
          </div>
          <div v-if="streamingAssistant.text" class="msg__body">{{ streamingAssistant.text }}<span class="cursor">▍</span></div>
        </div>
      </div>

      <div class="composer">
        <textarea
          v-model="composerInput"
          class="textarea composer__input"
          rows="3"
          placeholder="Ask for a draft, request edits, anything. Cmd/Ctrl+Enter to send."
          @keydown="onComposerKey"
          :disabled="inFlight"
        />
        <button class="btn primary" :disabled="inFlight || !composerInput.trim()" @click="sendMessage">
          {{ inFlight ? 'Sending…' : 'Send' }}
        </button>
      </div>
    </section>

    <section v-if="opp.postedCommentUrl" class="section">
      <header class="section-head">
        <h2 class="section-title">Posted</h2>
      </header>
      <p style="margin:0;font-size:13px">
        <a :href="opp.postedCommentUrl" target="_blank" rel="noopener">{{ opp.postedCommentUrl }}</a>
      </p>
    </section>
  </div>
</template>

<style scoped>
.detail-wrap {
  max-width: 760px;
  margin: 0 auto;
}

.back-link {
  display: inline-block;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 12px;
}
.back-link:hover { color: var(--accent); text-decoration: none; }

.post {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 16px;
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
.post-meta__sub { color: var(--text); font-weight: 600; }
.post-meta__sep { opacity: 0.6; }

.post-title {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0 0 10px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.post-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.post-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0 0 14px;
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
  margin: 0 0 14px;
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

.post-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
}
.section-meta {
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  display: flex;
  gap: 8px;
  align-items: center;
}

.draft-textarea {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  min-height: 200px;
}

.btn-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11px;
  text-decoration: underline;
  font-family: inherit;
}
.btn-link:hover { color: var(--accent); }

.chat-messages {
  max-height: 480px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 4px 8px;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.msg__role {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}
.msg__body {
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--panel-2);
  padding: 10px 12px;
  border-radius: 6px;
}
.msg--user .msg__role { color: var(--accent-2); }
.msg--user .msg__body {
  background: rgba(88, 166, 255, 0.08);
  border-left: 2px solid var(--accent);
}
.msg--assistant .msg__body {
  background: var(--panel-2);
  border-left: 2px solid var(--good);
}
.msg__tool {
  font-size: 12px;
}
.msg__tool code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  color: var(--text-dim);
  background: var(--bg);
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
  border: 1px solid var(--border);
}
.msg__tool pre {
  margin: 6px 0 0;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.msg__tool details summary {
  cursor: pointer;
  color: var(--text-dim);
}
.msg__tool--err pre { color: var(--bad); }

.tool-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-dim);
  margin-right: 4px;
}
.tool-tag--err { color: var(--bad); border-color: var(--bad); }
.tool-tag--pending { animation: pulse 1.5s ease-in-out infinite; }

.cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s steps(2) infinite;
  color: var(--accent);
}
@keyframes blink { 50% { opacity: 0; } }
@keyframes pulse { 50% { opacity: 0.4; } }

.chat-pulse { color: var(--accent); animation: pulse 1.5s ease-in-out infinite; }

.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-top: 8px;
}
.composer__input {
  flex: 1;
  font-size: 13px;
  min-height: 60px;
}
</style>
