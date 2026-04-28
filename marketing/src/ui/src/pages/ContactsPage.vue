<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();

const filters = reactive({
  q: '',
  relationship: '',
  classification: '',
  status: '',
  platform: '',
  excludeConflicts: false,
});

const data = ref({ contacts: [], total: 0 });
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const params = {
      q: filters.q || undefined,
      relationship: filters.relationship || undefined,
      classification: filters.classification || undefined,
      status: filters.status || undefined,
      platform: filters.platform || undefined,
      excludeConflicts: filters.excludeConflicts ? '1' : undefined,
      limit: 100,
    };
    data.value = await api.contacts.list(params);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(filters, load, { deep: true });

function open(contact) {
  router.push({ name: 'contact-detail', params: { id: contact._id } });
}

async function createNew() {
  const created = await api.contacts.create({
    name: 'New contact',
    relationship: 'target',
    source: { type: 'manual', importedAt: new Date().toISOString() },
  });
  router.push({ name: 'contact-detail', params: { id: created._id } });
}

async function importJson() {
  const raw = prompt(
    'Paste JSON: an array of Contact objects, OR a single object { contacts: [...] }. Each must have at minimum a `name`.'
  );
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const contacts = Array.isArray(parsed) ? parsed : parsed.contacts || [];
    if (!Array.isArray(contacts) || contacts.length === 0) {
      alert('No contacts in the parsed payload.');
      return;
    }
    const r = await api.contacts.importMany(contacts);
    alert(`Imported ${r.inserted} contacts.`);
    load();
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
}

function largestAudience(contact) {
  const sizes = (contact.presences || []).map((p) => p.audienceSize).filter(Number.isFinite);
  if (sizes.length === 0) return null;
  return Math.max(...sizes);
}

function fmtAudience(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function platformIcons(contact) {
  return (contact.presences || []).map((p) => p.platform).slice(0, 5);
}

const RELATIONSHIPS = ['', 'target', 'self', 'team', 'unknown'];
const CLASSIFICATIONS = ['', 'influencer', 'creator', 'journalist', 'company', 'partner', 'prospect', 'employee', 'other'];
const STATUSES = ['', 'new', 'researching', 'enriched', 'drafted', 'sent', 'replied', 'declined', 'do_not_contact'];
const PLATFORMS = ['', 'podcast', 'substack', 'youtube', 'x', 'instagram', 'tiktok', 'reddit', 'blog', 'website', 'linkedin'];
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">Contacts</h1>
        <p class="page-sub">Shared across all modules. {{ data.total }} total.</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" @click="importJson">Import JSON</button>
        <button class="btn primary" @click="createNew">+ New Contact</button>
      </div>
    </div>

    <div class="toolbar">
      <input class="input" style="max-width:280px" placeholder="search name / niche / bio / tags…" v-model="filters.q" />
      <select class="select" style="max-width:160px" v-model="filters.relationship">
        <option v-for="r in RELATIONSHIPS" :key="r" :value="r">{{ r || 'any relationship' }}</option>
      </select>
      <select class="select" style="max-width:160px" v-model="filters.classification">
        <option v-for="c in CLASSIFICATIONS" :key="c" :value="c">{{ c || 'any classification' }}</option>
      </select>
      <select class="select" style="max-width:160px" v-model="filters.status">
        <option v-for="s in STATUSES" :key="s" :value="s">{{ s || 'any status' }}</option>
      </select>
      <select class="select" style="max-width:160px" v-model="filters.platform">
        <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p || 'any platform' }}</option>
      </select>
      <label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:4px">
        <input type="checkbox" v-model="filters.excludeConflicts" /> hide conflicts
      </label>
    </div>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-else-if="loading" class="empty-state">loading…</p>

    <div v-else-if="data.contacts.length === 0" class="card">
      <p class="empty-state">No contacts match these filters.</p>
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Relationship</th>
          <th>Primary role</th>
          <th>Platforms</th>
          <th>Audience</th>
          <th>Tags</th>
          <th>Status</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in data.contacts" :key="c._id" @click="open(c)">
          <td>
            <strong>{{ c.name }}</strong>
            <div v-if="c.displayHandle" style="font-size:11px;color:var(--text-dim)">{{ c.displayHandle }}</div>
          </td>
          <td><span class="pill" :class="{ accent: c.relationship !== 'target' }">{{ c.relationship }}</span></td>
          <td>{{ c.primaryRole || '—' }}</td>
          <td>
            <span v-for="p in platformIcons(c)" :key="p" class="pill" style="margin-right:4px">{{ p }}</span>
          </td>
          <td>{{ fmtAudience(largestAudience(c)) }}</td>
          <td>
            <span v-for="t in (c.tags || []).slice(0, 3)" :key="t" class="pill" style="margin-right:4px">{{ t }}</span>
            <span v-if="(c.tags || []).length > 3" class="empty-state">+{{ c.tags.length - 3 }}</span>
          </td>
          <td><span class="pill">{{ c.status }}</span></td>
          <td>
            <span v-if="c.doNotContact" class="pill bad" title="Do not contact">DNC</span>
            <span v-if="(c.conflicts || []).length > 0" class="pill warn" :title="c.conflicts.join(', ')">⚠</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
