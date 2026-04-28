<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';
import PromptEditor from '../components/PromptEditor.vue';

const prompts = ref([]);
const error = ref(null);
const loading = ref(true);
const selectedKey = ref(null);

onMounted(async () => {
  try {
    const data = await api.prompts.list();
    prompts.value = data.prompts;
    if (prompts.value.length > 0) selectedKey.value = prompts.value[0].key;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

const grouped = computed(() => {
  const map = {};
  for (const p of prompts.value) {
    if (!map[p.module]) map[p.module] = [];
    map[p.module].push(p);
  }
  return map;
});
</script>

<template>
  <div>
    <h1 class="page-title">Prompts</h1>
    <p class="page-sub">Every LLM prompt the suite uses. Editable, versioned, restorable to default.</p>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>
    <p v-else-if="loading" class="empty-state">loading…</p>

    <div v-else-if="prompts.length === 0" class="card">
      <p class="empty-state">No prompts registered yet — modules light up in Phase 3+.</p>
    </div>

    <div v-else style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start">
      <aside>
        <div v-for="(items, mod) in grouped" :key="mod" style="margin-bottom:16px">
          <div class="nav-section" style="padding:0 0 4px">{{ mod }}</div>
          <div v-for="p in items" :key="p.key" class="card"
               style="padding:8px 12px;margin-bottom:4px;cursor:pointer"
               :style="{ borderColor: selectedKey === p.key ? 'var(--accent)' : 'var(--border)' }"
               @click="selectedKey = p.key">
            <strong style="font-size:13px">{{ p.title || p.key }}</strong>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">v{{ p.version }}</div>
          </div>
        </div>
      </aside>
      <main>
        <PromptEditor v-if="selectedKey" :key="selectedKey" :prompt-key="selectedKey" />
      </main>
    </div>
  </div>
</template>
