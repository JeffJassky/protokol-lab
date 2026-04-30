<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const subs = ref([]);
const voices = ref([]);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  try {
    const [s, v] = await Promise.all([api.redditEngagement.listSubreddits(), api.contacts.voices()]);
    subs.value = s.subreddits;
    voices.value = v.voices;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);

async function createNew() {
  if (voices.value.length === 0) {
    alert('Create a Contact with relationship=self/team and an active voiceProfile first — that becomes the voice the AI replies as.');
    router.push({ name: 'contacts' });
    return;
  }
  const name = prompt('Subreddit name (without r/):');
  if (!name) return;
  const sub = await api.redditEngagement.createSubreddit({
    subreddit: name.replace(/^r\//, '').trim(),
    voiceContactId: voices.value[0]._id,
    scanRules: { keywords: [], maxPostAgeHours: 72, minPostScore: 1 },
  });
  router.push({ name: 'subreddit-detail', params: { id: sub._id } });
}

async function scanNow(s) {
  const startTs = Date.now();
  try {
    await api.redditEngagement.scanNow(s._id);
    s._scanStatus = 'scanning…'; // show inline status while we poll
    // Poll the runs endpoint until we see a run for this sub started after
    // our click. Up to 30s. Then surface scanned/candidate counts.
    let result = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { runs } = await api.redditEngagement.listRuns({ subredditId: s._id });
      const run = (runs || []).find((r) => new Date(r.startedAt).getTime() >= startTs - 1000);
      if (run && (run.status === 'done' || run.status === 'failed')) {
        result = run;
        break;
      }
    }
    s._scanStatus = null;
    if (!result) {
      alert(`Scan for r/${s.subreddit} still running. Check back in a moment.`);
      load();
      return;
    }
    if (result.status === 'failed') {
      alert(`Scan failed: ${result.error || '(no error message)'}\n\nIf this is a Reddit 403, you likely need to set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET — public-JSON mode is being blocked.`);
      load();
      return;
    }
    alert(
      `r/${s.subreddit} scan complete:\n` +
      `· ${result.postsScanned ?? 0} posts scanned\n` +
      `· ${result.candidatesIdentified ?? 0} candidate(s) added to triage queue\n\n` +
      `Triage runs async. Open the feed in ~10–30s to see what survives.`
    );
    load();
  } catch (e) {
    s._scanStatus = null;
    alert(e.message);
  }
}

async function toggleAutoScan(s) {
  const next = !s.autoScanEnabled;
  try {
    const updated = await api.redditEngagement.updateSubreddit(s._id, { autoScanEnabled: next });
    Object.assign(s, updated);
  } catch (e) { alert(e.message); }
}

async function toggleActive(s) {
  const next = !s.active;
  try {
    const updated = await api.redditEngagement.updateSubreddit(s._id, { active: next });
    Object.assign(s, updated);
  } catch (e) { alert(e.message); }
}

async function saveInterval(s, raw) {
  const val = Math.max(60, Number(raw) || 1440);
  if (val === s.scanIntervalMinutes) return;
  try {
    const updated = await api.redditEngagement.updateSubreddit(s._id, { scanIntervalMinutes: val });
    Object.assign(s, updated);
  } catch (e) { alert(e.message); }
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">Monitored subreddits</h1>
        <p class="page-sub">Manual-only by default — hit "Scan now" when you have time. Flip "Auto" on to opt a sub into scheduled scanning at the chosen interval.</p>
      </div>
      <button class="btn primary" @click="createNew">+ Add subreddit</button>
    </div>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-else-if="loading" class="empty-state">loading…</p>

    <div v-else-if="subs.length === 0" class="card">
      <p class="empty-state">None monitored yet.</p>
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Subreddit</th>
          <th>Voice</th>
          <th title="Sub is monitored at all. Off = hidden from scheduler.">Active</th>
          <th title="On = scheduler runs this sub at the chosen interval. Off = manual only.">Auto</th>
          <th>Interval</th>
          <th>Last scan</th>
          <th>Found</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in subs" :key="s._id" @click="router.push({ name: 'subreddit-detail', params: { id: s._id } })">
          <td><strong>r/{{ s.subreddit }}</strong></td>
          <td style="font-size:12px;color:var(--text-dim)">{{ voices.find(v => v._id === s.voiceContactId)?.name || '(?)' }}</td>
          <td>
            <span
              class="pill"
              :class="{ good: s.active }"
              style="cursor:pointer"
              @click.stop="toggleActive(s)"
              :title="`Click to turn ${s.active ? 'off' : 'on'}`"
            >{{ s.active ? 'on' : 'off' }}</span>
          </td>
          <td>
            <span
              class="pill"
              :class="{ good: s.autoScanEnabled }"
              style="cursor:pointer"
              @click.stop="toggleAutoScan(s)"
              :title="s.autoScanEnabled ? 'Scheduled scans on. Click to disable.' : 'Manual only. Click to enable scheduled scans.'"
            >{{ s.autoScanEnabled ? 'auto' : 'manual' }}</span>
          </td>
          <td @click.stop>
            <input
              class="input"
              type="number"
              min="60"
              step="60"
              :value="s.scanIntervalMinutes"
              :disabled="!s.autoScanEnabled"
              :title="s.autoScanEnabled ? 'Minutes between auto-scans' : 'Enable Auto to schedule scans'"
              style="width:80px;padding:4px 6px;font-size:12px"
              @change="(e) => saveInterval(s, e.target.value)"
            />
            <span style="font-size:11px;color:var(--text-dim);margin-left:4px">min</span>
          </td>
          <td style="font-size:12px;color:var(--text-dim)">{{ s.lastScanAt ? new Date(s.lastScanAt).toLocaleString() : 'never' }}</td>
          <td>{{ s.lastScanFoundCount ?? 0 }}</td>
          <td>
            <button class="btn" :disabled="!!s._scanStatus" @click.stop="scanNow(s)">
              {{ s._scanStatus || 'Scan now' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
