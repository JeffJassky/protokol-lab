<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import TagInput from '../components/TagInput.vue';

const route = useRoute();
const router = useRouter();
const sub = ref(null);
const voices = ref([]);
const error = ref(null);
const saving = ref(false);

async function load() {
  try {
    const [s, v] = await Promise.all([api.redditEngagement.getSubreddit(route.params.id), api.contacts.voices()]);
    sub.value = s;
    voices.value = v.voices;
    sub.value.scanRules = sub.value.scanRules || { keywords: [], excludeKeywords: [], maxPostAgeHours: 72, minPostScore: 1 };
  } catch (e) { error.value = e.message; }
}
onMounted(load);
watch(() => route.params.id, load);

async function save() {
  saving.value = true;
  try {
    sub.value = await api.redditEngagement.updateSubreddit(route.params.id, sub.value);
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

async function remove() {
  if (!confirm(`Stop monitoring r/${sub.value.subreddit}?`)) return;
  await api.redditEngagement.deleteSubreddit(route.params.id);
  router.push({ name: 'subreddits' });
}

async function scanNow() {
  await api.redditEngagement.scanNow(route.params.id);
  alert('Scan enqueued.');
}
</script>

<template>
  <div v-if="!sub"><p class="empty-state">loading…</p></div>
  <div v-else>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">r/{{ sub.subreddit }}</h1>
        <p class="page-sub">Last scan: {{ sub.lastScanAt ? new Date(sub.lastScanAt).toLocaleString() : 'never' }}</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" @click="scanNow">Scan now</button>
        <button class="btn danger" @click="remove">Delete</button>
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>
    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Identity</h3>
      <div class="row" style="margin-bottom:8px">
        <div class="field" style="margin:0">
          <label class="field-label">Subreddit (no r/)</label>
          <input class="input" v-model="sub.subreddit" />
        </div>
        <div class="field" style="margin:0">
          <label class="field-label">Voice (Contact w/ voiceProfile)</label>
          <select class="select" v-model="sub.voiceContactId">
            <option v-for="v in voices" :key="v._id" :value="v._id">{{ v.name }}</option>
          </select>
        </div>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px" title="Sub is monitored. Off = hidden from scheduler entirely.">
          <input type="checkbox" v-model="sub.active" /> Active
        </label>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px" title="On = scheduler scans on the interval below. Off = manual-only via Scan now.">
          <input type="checkbox" v-model="sub.autoScanEnabled" /> Auto-scan
        </label>
        <div class="field" style="margin:0;max-width:160px">
          <label class="field-label">Auto-scan every (min)</label>
          <input class="input" type="number" min="60" step="60" v-model.number="sub.scanIntervalMinutes" :disabled="!sub.autoScanEnabled" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Scan rules</h3>
      <div class="field">
        <label class="field-label">Required keywords (any-of). Empty = match all posts in window.</label>
        <TagInput v-model="sub.scanRules.keywords" />
      </div>
      <div class="field">
        <label class="field-label">Exclude keywords</label>
        <TagInput v-model="sub.scanRules.excludeKeywords" />
      </div>
      <div class="row">
        <div class="field" style="margin:0">
          <label class="field-label">Max post age (hours)</label>
          <input class="input" type="number" min="1" v-model="sub.scanRules.maxPostAgeHours" />
        </div>
        <div class="field" style="margin:0">
          <label class="field-label">Min post score</label>
          <input class="input" type="number" v-model="sub.scanRules.minPostScore" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Budget</h3>
      <div class="row">
        <div class="field" style="margin:0">
          <label class="field-label">Per scan-run cap (USD)</label>
          <input class="input" type="number" step="0.05" v-model="sub.budget.perRunCapUsd" />
        </div>
        <div class="field" style="margin:0">
          <label class="field-label">Monthly cap (USD)</label>
          <input class="input" type="number" step="1" v-model="sub.budget.monthlyCapUsd" />
        </div>
      </div>
    </div>
  </div>
</template>
