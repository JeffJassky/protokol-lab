<script setup>
import { ref, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';

const store = useSettingsStore();

const enabled = ref(true);
const hydrated = ref(false);

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const j = store.settings?.journal || {};
  enabled.value = j.enabled !== false;
  hydrated.value = true;
});

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

async function persist() {
  await store.patchSettings({
    journal: { enabled: enabled.value },
  });
}

watch([enabled], scheduleSave);
</script>

<template>
  <div class="journal-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Journal</h2>
    </div>

    <div class="card">
      <label class="row toggle-row">
        <span class="toggle-label">
          <span class="toggle-name">Enable journal</span>
          <span class="toggle-sub">Show a daily notes textarea on the Log page.</span>
        </span>
        <input type="checkbox" v-model="enabled" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.journal-page { max-width: 560px; }
.head {
  padding: var(--space-5) var(--space-5) 0;
  margin-bottom: var(--space-4);
}
.back-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-2);
  padding: var(--space-1) 0;
}
.back-link:hover { color: var(--text); }
.page-title { margin: 0; text-align: center; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}

.row { display: flex; align-items: center; gap: var(--space-2); }
.toggle-row { justify-content: space-between; }
.toggle-label { display: flex; flex-direction: column; gap: 2px; }
.toggle-name { font-size: var(--font-size-m); font-weight: var(--font-weight-medium); color: var(--text); }
.toggle-sub { font-size: var(--font-size-xs); color: var(--text-tertiary); }
</style>
