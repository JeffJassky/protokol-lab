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
  try {
    await api.redditEngagement.scanNow(s._id);
    alert(`Scan enqueued for r/${s.subreddit}.`);
  } catch (e) { alert(e.message); }
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">Monitored subreddits</h1>
        <p class="page-sub">Scanned on a schedule. Each subreddit is bound to a voice (a Contact with a voiceProfile).</p>
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
        <tr><th>Subreddit</th><th>Voice</th><th>Active</th><th>Interval</th><th>Last scan</th><th>Found</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="s in subs" :key="s._id" @click="router.push({ name: 'subreddit-detail', params: { id: s._id } })">
          <td><strong>r/{{ s.subreddit }}</strong></td>
          <td style="font-size:12px;color:var(--text-dim)">{{ voices.find(v => v._id === s.voiceContactId)?.name || '(?)' }}</td>
          <td><span class="pill" :class="{ good: s.active }">{{ s.active ? 'on' : 'off' }}</span></td>
          <td>{{ s.scanIntervalMinutes }}m</td>
          <td style="font-size:12px;color:var(--text-dim)">{{ s.lastScanAt ? new Date(s.lastScanAt).toLocaleString() : 'never' }}</td>
          <td>{{ s.lastScanFoundCount ?? 0 }}</td>
          <td><button class="btn" @click.stop="scanNow(s)">Scan now</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
