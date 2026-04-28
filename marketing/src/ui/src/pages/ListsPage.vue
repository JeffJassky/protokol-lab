<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const lists = ref([]);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  try {
    const data = await api.lists.list();
    lists.value = data.lists;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function createNew() {
  const list = await api.lists.create({ name: 'New list' });
  router.push({ name: 'list-detail', params: { id: list._id } });
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
      <div>
        <h1 class="page-title">Lists</h1>
        <p class="page-sub">Targeted contact groupings, each with its own pitch context the AI uses for research and drafts.</p>
      </div>
      <button class="btn primary" @click="createNew">+ New List</button>
    </div>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-else-if="loading" class="empty-state">loading…</p>

    <div v-else-if="lists.length === 0" class="card">
      <p class="empty-state">No lists yet.</p>
    </div>

    <table v-else class="table">
      <thead>
        <tr><th>Name</th><th>Contacts</th><th>Updated</th></tr>
      </thead>
      <tbody>
        <tr v-for="list in lists" :key="list._id" @click="router.push({ name: 'list-detail', params: { id: list._id } })">
          <td>
            <strong>{{ list.name }}</strong>
            <div v-if="list.pitchSummary" style="font-size:11px;color:var(--text-dim)">{{ list.pitchSummary.slice(0, 100) }}</div>
          </td>
          <td>{{ list.contactCount }}</td>
          <td style="color:var(--text-dim);font-size:12px">{{ list.updatedAt }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
