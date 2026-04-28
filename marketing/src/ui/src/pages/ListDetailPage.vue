<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';

const route = useRoute();
const router = useRouter();

const list = ref(null);
const members = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref(null);
const addBox = ref('');

async function load() {
  loading.value = true;
  try {
    list.value = await api.lists.get(route.params.id);
    const data = await api.contacts.list({ listId: route.params.id, limit: 200 });
    members.value = data.contacts;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => route.params.id, load);

async function save() {
  saving.value = true;
  try {
    list.value = await api.lists.update(route.params.id, list.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirm(`Delete list ${list.value.name}? Members are not deleted.`)) return;
  await api.lists.remove(route.params.id);
  router.push({ name: 'lists' });
}

async function removeMember(contactId) {
  await api.lists.removeMember(route.params.id, contactId);
  members.value = members.value.filter((c) => c._id !== contactId);
}

async function addMembers() {
  const ids = addBox.value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;
  await api.lists.addMembers(route.params.id, ids);
  addBox.value = '';
  await load();
}
</script>

<template>
  <div v-if="loading"><p class="empty-state">loading…</p></div>
  <div v-else-if="!list"><p style="color:var(--bad)">List not found.</p></div>
  <div v-else>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">{{ list.name || 'Untitled list' }}</h1>
        <p class="page-sub">{{ members.length }} members</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn danger" @click="remove">Delete</button>
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div class="card">
      <div class="field">
        <label class="field-label">Name</label>
        <input class="input" v-model="list.name" />
      </div>
      <div class="field">
        <label class="field-label">Pitch summary (one line — what we're pitching, why this list cares)</label>
        <input class="input" v-model="list.pitchSummary" />
      </div>
      <div class="field">
        <label class="field-label">Context prompt (large — fed to the agent for every research/draft job in this list)</label>
        <textarea class="textarea" v-model="list.contextPrompt" rows="10"
                  placeholder="Describe the audience, the angle, what we want the AI to look for, what voice we're writing in…" />
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Members</h3>
      <div class="row" style="margin-bottom:12px">
        <input class="input grow-2" v-model="addBox" placeholder="paste contact IDs, comma- or space-separated, then click Add" />
        <button class="btn" @click="addMembers" :disabled="!addBox.trim()">Add</button>
      </div>
      <p v-if="members.length === 0" class="empty-state">No members yet.</p>
      <table v-else class="table">
        <thead><tr><th>Name</th><th>Relationship</th><th>Primary role</th><th>Tags</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in members" :key="c._id" @click.stop="router.push({ name: 'contact-detail', params: { id: c._id } })">
            <td><strong>{{ c.name }}</strong></td>
            <td><span class="pill">{{ c.relationship }}</span></td>
            <td>{{ c.primaryRole || '—' }}</td>
            <td>
              <span v-for="t in (c.tags || []).slice(0, 3)" :key="t" class="pill" style="margin-right:4px">{{ t }}</span>
            </td>
            <td><button class="btn danger" @click.stop="removeMember(c._id)">remove</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
