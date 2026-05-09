<script setup>
import { ref, computed, onMounted } from 'vue';
import { useExercisesStore } from '../../stores/exercises.js';

const store = useExercisesStore();

const ENGINE_CLASSES = [
  { key: 'exercise_cardio', label: 'Cardio' },
  { key: 'exercise_resistance', label: 'Resistance' },
  { key: 'exercise_hiit', label: 'HIIT' },
  { key: 'exercise_recovery', label: 'Recovery' },
];

// New-row form state. Kept local instead of routed because catalog
// adds are quick — open modal, fill three fields, save.
const showNewModal = ref(false);
const newName = ref('');
const newClass = ref('exercise_cardio');
const newMet = ref(5);
const newDuration = ref(30);
const newError = ref('');

const groupedExercises = computed(() => {
  const groups = new Map();
  for (const cls of ENGINE_CLASSES) groups.set(cls.key, []);
  for (const ex of store.exercises) {
    if (!groups.has(ex.engineClass)) groups.set(ex.engineClass, []);
    groups.get(ex.engineClass).push(ex);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label: ENGINE_CLASSES.find((c) => c.key === key)?.label || key,
    list,
  }));
});

async function toggleEnabled(ex) {
  await store.update(ex._id, { enabled: !ex.enabled });
}

async function remove(ex) {
  const noun = ex.isSystem ? 'disable' : 'delete';
  if (!confirm(`${noun[0].toUpperCase() + noun.slice(1)} "${ex.name}"?`)) return;
  await store.remove(ex._id);
}

function openNew() {
  newName.value = '';
  newClass.value = 'exercise_cardio';
  newMet.value = 5;
  newDuration.value = 30;
  newError.value = '';
  showNewModal.value = true;
}

async function createNew() {
  newError.value = '';
  if (!newName.value.trim()) {
    newError.value = 'Name required';
    return;
  }
  try {
    await store.create({
      name: newName.value.trim(),
      engineClass: newClass.value,
      metValue: Number(newMet.value),
      defaultDurationMin: Number(newDuration.value),
    });
    showNewModal.value = false;
  } catch (err) {
    newError.value = err.message || 'Create failed';
  }
}

onMounted(async () => {
  if (!store.loaded) await store.fetchAll();
});
</script>

<template>
  <div class="exercises-page">
    <div class="head">
      <router-link to="/profile/settings/exercise" class="back-link" aria-label="Back">
        ‹ Exercise
      </router-link>
      <h2 class="page-title">Exercise catalog</h2>
      <button type="button" class="add-btn" @click="openNew">+ Add</button>
    </div>

    <div class="card callout">
      System exercises seed automatically. Disable any you don't want
      cluttering the picker; add custom entries for activities not in
      the seed list. Each entry pins to one of three engine classes
      (cardio / resistance / HIIT) which the simulation uses to model
      sympathetic stress, metabolic load, and mechanical load.
    </div>

    <div
      v-for="group in groupedExercises"
      :key="group.key"
      class="card group"
    >
      <h3 class="group-label">{{ group.label }}</h3>

      <div
        v-for="ex in group.list"
        :key="ex._id"
        class="exercise-row"
        :class="{ disabled: !ex.enabled }"
      >
        <span class="ex-icon">{{ ex.icon || '·' }}</span>
        <div class="ex-meta">
          <div class="ex-name">{{ ex.name }}</div>
          <div class="ex-detail">
            {{ ex.metValue }} MET · default {{ ex.defaultDurationMin }} min
            <span v-if="ex.isSystem" class="ex-system">system</span>
          </div>
        </div>
        <label class="enable-toggle">
          <input
            type="checkbox"
            :checked="ex.enabled"
            @change="toggleEnabled(ex)"
          />
        </label>
        <button
          v-if="!ex.isSystem"
          type="button"
          class="del-btn"
          @click="remove(ex)"
          aria-label="Delete"
        >×</button>
      </div>
    </div>

    <!-- New-exercise modal -->
    <div v-if="showNewModal" class="modal-backdrop" @click.self="showNewModal = false">
      <div class="modal">
        <h3>New exercise</h3>
        <label class="form-row">
          <span>Name</span>
          <input v-model="newName" type="text" placeholder="e.g. Mountain biking" />
        </label>
        <label class="form-row">
          <span>Class</span>
          <select v-model="newClass">
            <option
              v-for="cls in ENGINE_CLASSES"
              :key="cls.key"
              :value="cls.key"
            >
              {{ cls.label }}
            </option>
          </select>
        </label>
        <label class="form-row">
          <span>MET</span>
          <input v-model.number="newMet" type="number" min="1" max="20" step="0.1" />
        </label>
        <label class="form-row">
          <span>Default duration (min)</span>
          <input v-model.number="newDuration" type="number" min="1" step="5" />
        </label>
        <p v-if="newError" class="err">{{ newError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="showNewModal = false">Cancel</button>
          <button type="button" class="btn-primary" @click="createNew">Add</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.exercises-page { max-width: 720px; }
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.back-link { text-decoration: none; color: var(--text-tertiary); font-size: var(--font-size-s); }
.back-link:hover { color: var(--text); }
.page-title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0;
  flex: 1;
}
.add-btn {
  padding: 4px 12px;
  font-size: var(--font-size-s);
  background: var(--primary);
  color: var(--primary-fg, #fff);
  border: none;
  cursor: pointer;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.callout {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
  border-left: 2px solid var(--primary);
}
.group-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-3);
}

.exercise-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
.exercise-row:first-of-type { border-top: none; }
.exercise-row.disabled .ex-name,
.exercise-row.disabled .ex-detail {
  color: var(--text-tertiary);
}
.ex-icon { font-size: 18px; min-width: 24px; text-align: center; }
.ex-meta { flex: 1; min-width: 0; }
.ex-name { font-size: var(--font-size-s); color: var(--text); }
.ex-detail { font-size: var(--font-size-xs); color: var(--text-tertiary); }
.ex-system {
  margin-left: var(--space-2);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  border: 1px solid var(--border);
  padding: 1px 4px;
}
.enable-toggle { display: flex; align-items: center; }
.del-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: var(--font-size-l);
  line-height: 1;
}
.del-btn:hover { color: var(--danger); }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  z-index: 100;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-5);
  width: 90%;
  max-width: 420px;
}
.modal h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: var(--space-3);
}
.form-row span {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.form-row input,
.form-row select {
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
}
.err { color: var(--danger); font-size: var(--font-size-s); margin: 0 0 var(--space-2); }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.btn-cancel,
.btn-primary {
  padding: 6px 14px;
  font-size: var(--font-size-s);
  cursor: pointer;
  border: 1px solid var(--border);
}
.btn-cancel { background: var(--surface); color: var(--text-secondary); }
.btn-primary { background: var(--primary); color: var(--primary-fg, #fff); border-color: var(--primary); }
</style>
