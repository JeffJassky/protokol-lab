<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '../api.js';

const props = defineProps({
  contact: { type: Object, required: true },
});
const emit = defineEmits(['contact-updated']);

const lists = ref([]);
const selectedListId = ref('');
const budget = ref(0.5);
const events = ref([]);
const currentJob = ref(null);
const error = ref(null);
const recentJobs = ref([]);
let eventSource = null;

onMounted(async () => {
  try {
    const data = await api.lists.list();
    lists.value = data.lists;
    const jobs = await api.research.listJobs({ contactId: props.contact._id });
    recentJobs.value = jobs.jobs;
  } catch (e) { error.value = e.message; }
});

onUnmounted(() => closeStream());

function closeStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

async function runResearch() {
  error.value = null;
  events.value = [];
  closeStream();
  try {
    const r = await api.research.enqueue(props.contact._id, selectedListId.value || null, Number(budget.value));
    currentJob.value = { _id: r.jobId, status: 'queued' };
    subscribe(r.jobId);
    pollUntilDone(r.jobId);
  } catch (e) { error.value = e.message; }
}

function subscribe(jobId) {
  const url = api.research.streamUrl(jobId);
  eventSource = new EventSource(url, { withCredentials: true });
  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      events.value.push({ ...event, ts: Date.now() });
    } catch {}
  };
  eventSource.onerror = () => {
    // Browsers retry automatically; we just log.
    events.value.push({ type: 'sse_error', ts: Date.now() });
  };
}

async function pollUntilDone(jobId) {
  const start = Date.now();
  const TIMEOUT = 5 * 60 * 1000;
  while (Date.now() - start < TIMEOUT) {
    try {
      const job = await api.research.getJob(jobId);
      currentJob.value = job;
      if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
        closeStream();
        // Reload contact so new findings show in cards
        const refreshed = await api.contacts.get(props.contact._id);
        emit('contact-updated', refreshed);
        const jobs = await api.research.listJobs({ contactId: props.contact._id });
        recentJobs.value = jobs.jobs;
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function fmtTs(ts) {
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <div>
    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Run research</h3>
      <p style="margin:0 0 12px;font-size:12px;color:var(--text-dim)">
        Multi-turn agent loop powered by Claude Code. Uses built-in WebSearch + WebFetch,
        plus rss_fetch, scrape_contact_page, save_finding, and platform-specific tools
        (Reddit/YouTube) when the contact has matching presences. Pick a list to provide
        pitch context — optional.
      </p>
      <div class="row" style="margin-bottom:8px">
        <div class="field" style="margin:0">
          <label class="field-label">List context (optional)</label>
          <select class="select" v-model="selectedListId">
            <option value="">— no list context —</option>
            <option v-for="l in lists" :key="l._id" :value="l._id">{{ l.name }}</option>
          </select>
        </div>
        <div class="field" style="margin:0">
          <label class="field-label">Budget cap (USD)</label>
          <input class="input" type="number" step="0.1" min="0.1" v-model="budget" />
        </div>
      </div>
      <button class="btn primary" @click="runResearch" :disabled="currentJob && ['queued','running'].includes(currentJob.status)">
        {{ currentJob && ['queued','running'].includes(currentJob.status) ? 'Running…' : 'Run research' }}
      </button>
      <p v-if="error" style="color:var(--bad);margin-top:8px">{{ error }}</p>
    </div>

    <div v-if="currentJob" class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:13px">Live feed</strong>
        <span class="pill" :class="{ good: currentJob.status === 'done', bad: currentJob.status === 'failed' }">
          {{ currentJob.status }}
        </span>
      </div>
      <div v-if="events.length === 0" class="empty-state" style="margin-top:8px">waiting for events…</div>
      <div v-else style="margin-top:8px;max-height:400px;overflow-y:auto;font-size:12px">
        <div v-for="(e, i) in events" :key="i"
             style="padding:8px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between">
            <span class="pill" :class="{ accent: e.type === 'tool_call', warn: e.type === 'budget_exceeded' || e.type === 'sse_error', good: e.type === 'done' }">{{ e.type }}</span>
            <span style="color:var(--text-dim);font-size:11px">{{ fmtTs(e.ts) }}</span>
          </div>
          <div v-if="e.type === 'tool_call'" style="margin-top:4px">
            <strong style="font-family:ui-monospace,'SF Mono',Menlo,monospace">{{ e.name }}</strong>
            <div style="color:var(--text-dim);font-size:11px;margin-top:2px">cost so far: ${{ Number(e.costSoFar || 0).toFixed(4) }}</div>
            <details style="margin-top:4px">
              <summary style="cursor:pointer;color:var(--accent)">input/output</summary>
              <pre style="background:var(--bg);padding:6px;border-radius:4px;font-size:11px;white-space:pre-wrap;max-height:200px;overflow:auto;margin-top:4px">{{ JSON.stringify({ input: e.input, output: e.output }, null, 2) }}</pre>
            </details>
          </div>
          <div v-else-if="e.type === 'message' && e.text" style="margin-top:4px;white-space:pre-wrap">{{ e.text }}</div>
          <div v-else-if="e.type === 'done'" style="margin-top:4px;color:var(--text-dim)">
            {{ e.iterations }} iterations · ${{ Number(e.costUsd || 0).toFixed(4) }} · stopped: {{ e.stoppedReason }}
          </div>
          <div v-else-if="e.type === 'budget_exceeded'" style="margin-top:4px;color:var(--warn)">
            Budget cap (${{ e.capUsd }}) hit at ${{ Number(e.costSoFar || 0).toFixed(4) }} — loop halted.
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Latest summary</h3>
      <p v-if="!contact.enrichmentSummary" class="empty-state">
        No research yet. Click "Run research" above.
      </p>
      <p v-else style="font-size:13px;white-space:pre-wrap">{{ contact.enrichmentSummary }}</p>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Recent content ({{ (contact.recentContent || []).length }})</h3>
      <p v-if="(contact.recentContent || []).length === 0" class="empty-state">No content gathered yet.</p>
      <div v-else>
        <div v-for="(rc, i) in contact.recentContent" :key="i"
             style="padding:10px;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong style="font-size:13px">
              <a v-if="rc.url" :href="rc.url" target="_blank" rel="noopener">{{ rc.title || rc.url }}</a>
              <span v-else>{{ rc.title }}</span>
            </strong>
            <span v-if="rc.platform" class="pill">{{ rc.platform }}</span>
          </div>
          <p v-if="rc.summary" style="margin:6px 0 0;font-size:12px;color:var(--text-dim)">{{ rc.summary }}</p>
          <p v-if="rc.distinctivePoint" style="margin:6px 0 0;font-size:12px;font-style:italic;color:var(--accent-2)">
            “{{ rc.distinctivePoint }}”
          </p>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Personalized hooks ({{ (contact.personalizedHooks || []).length }})</h3>
      <p v-if="(contact.personalizedHooks || []).length === 0" class="empty-state">
        No hook candidates yet. Each is a one-sentence reference you could open an outreach email with.
      </p>
      <ul v-else style="margin:0;padding-left:18px;font-size:13px">
        <li v-for="(h, i) in contact.personalizedHooks" :key="i" style="margin-bottom:6px">
          “{{ h.text }}”
          <a v-if="h.sourceContentUrl" :href="h.sourceContentUrl" target="_blank" rel="noopener"
             style="font-size:11px;margin-left:6px">source</a>
        </li>
      </ul>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Recent jobs</h3>
      <p v-if="recentJobs.length === 0" class="empty-state">No prior research jobs.</p>
      <table v-else class="table">
        <thead><tr><th>When</th><th>Status</th><th>Cost</th><th>Findings</th></tr></thead>
        <tbody>
          <tr v-for="j in recentJobs" :key="j._id">
            <td style="font-size:12px;color:var(--text-dim)">{{ new Date(j.createdAt).toLocaleString() }}</td>
            <td><span class="pill" :class="{ good: j.status === 'done', bad: j.status === 'failed' }">{{ j.status }}</span></td>
            <td style="font-size:12px">${{ Number(j.result?.costUsd || 0).toFixed(4) }}</td>
            <td style="font-size:12px">{{ j.result?.findingsCount || 0 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
