<script setup>
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import { usePhotoTypesStore } from '../../stores/photoTypes.js';

const settingsStore = useSettingsStore();
const photoTypesStore = usePhotoTypesStore();

const adding = ref(false);
const newName = ref('');
const error = ref('');

const editingId = ref(null);
const editName = ref('');

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.fetchSettings();
  await photoTypesStore.fetchPhotoTypes();
});

const photosSettings = computed(() => settingsStore.settings?.photos || {
  enabled: false,
  showOnLog: true,
  showOnDashboard: true,
});

async function patchPhotos(patch) {
  await settingsStore.patchSettings({
    photos: { ...photosSettings.value, ...patch },
  });
}

async function toggleEnabled() {
  await patchPhotos({ enabled: !photosSettings.value.enabled });
}
async function toggleShowOnLog() {
  await patchPhotos({ showOnLog: !photosSettings.value.showOnLog });
}
async function toggleShowOnDashboard() {
  await patchPhotos({ showOnDashboard: !photosSettings.value.showOnDashboard });
}

async function toggleType(t) {
  await photoTypesStore.updatePhotoType(t._id, { enabled: !t.enabled });
}

function startEdit(t) {
  editingId.value = t._id;
  editName.value = t.name;
}
async function saveEdit(t) {
  if (!editName.value.trim()) return;
  await photoTypesStore.updatePhotoType(t._id, { name: editName.value.trim() });
  editingId.value = null;
}
function cancelEdit() {
  editingId.value = null;
}
async function handleDelete(t) {
  if (t.isPreset) return;
  if (!confirm(`Delete "${t.name}" and all photos tagged with it?`)) return;
  await photoTypesStore.deletePhotoType(t._id);
}

async function handleAdd() {
  error.value = '';
  if (!newName.value.trim()) {
    error.value = 'Name required';
    return;
  }
  try {
    await photoTypesStore.createPhotoType({ name: newName.value.trim() });
    newName.value = '';
    adding.value = false;
  } catch (err) {
    error.value = err.message || 'Failed to create photo type';
  }
}

const presetTypes = computed(() => photoTypesStore.photoTypes.filter((t) => t.isPreset));
const customTypes = computed(() => photoTypesStore.photoTypes.filter((t) => !t.isPreset));
</script>

<template>
  <div class="photos-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back"
        >‹ Profile</router-link
      >
      <h2 class="page-title">Photos</h2>
    </div>

    <div class="card">
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="photosSettings.enabled"
          @change="toggleEnabled"
        />
        <span class="toggle-label">
          <span class="toggle-title">Enable photo logging</span>
          <span class="toggle-sub">Track progress photos by category</span>
        </span>
      </label>

      <div v-if="photosSettings.enabled" class="sub-toggles">
        <label class="toggle-row sub">
          <input
            type="checkbox"
            :checked="photosSettings.showOnLog"
            @change="toggleShowOnLog"
          />
          <span class="toggle-label">
            <span class="toggle-title">Show on Log page</span>
            <span class="toggle-sub">Capture card with one slot per type</span>
          </span>
        </label>
        <label class="toggle-row sub">
          <input
            type="checkbox"
            :checked="photosSettings.showOnDashboard"
            @change="toggleShowOnDashboard"
          />
          <span class="toggle-label">
            <span class="toggle-title">Show on Dashboard</span>
            <span class="toggle-sub">Timeline grouped by photo type</span>
          </span>
        </label>
      </div>
    </div>

    <div v-if="photosSettings.enabled" class="card">
      <h3 class="group-title">Photo Types</h3>
      <p class="hint">
        Toggle which categories to capture. Disabling preserves existing
        photos. Custom types let you track specific things (skin condition,
        outfit, lighting setup, …).
      </p>

      <ul class="type-list">
        <li
          v-for="t in presetTypes"
          :key="t._id"
          class="type-row"
        >
          <template v-if="editingId === t._id">
            <span class="type-name locked">{{ t.name }}</span>
            <button class="btn-text" type="button" @click="cancelEdit">Cancel</button>
          </template>
          <template v-else>
            <label class="toggle-row inline">
              <input
                type="checkbox"
                :checked="t.enabled"
                @change="toggleType(t)"
              />
              <span class="type-name">{{ t.name }}</span>
              <span class="preset-badge">preset</span>
            </label>
          </template>
        </li>

        <li
          v-for="t in customTypes"
          :key="t._id"
          class="type-row"
        >
          <template v-if="editingId === t._id">
            <input v-model="editName" type="text" class="edit-name-input" />
            <button class="btn-text" type="button" @click="cancelEdit">Cancel</button>
            <button class="btn-primary small" type="button" @click="saveEdit(t)">Save</button>
          </template>
          <template v-else>
            <label class="toggle-row inline">
              <input
                type="checkbox"
                :checked="t.enabled"
                @change="toggleType(t)"
              />
              <span class="type-name">{{ t.name }}</span>
            </label>
            <div class="row-actions">
              <button class="row-action" type="button" @click="startEdit(t)">Edit</button>
              <button class="row-action danger" type="button" @click="handleDelete(t)">Delete</button>
            </div>
          </template>
        </li>
      </ul>

      <div class="add-area">
        <button
          v-if="!adding"
          type="button"
          class="btn-secondary"
          @click="adding = true"
        >
          + Add custom photo type
        </button>
        <form v-else class="add-form" @submit.prevent="handleAdd">
          <input
            v-model="newName"
            type="text"
            placeholder="e.g. Eczema, Outfit, Lighting setup"
            autofocus
          />
          <button class="btn-primary" type="submit">Add</button>
          <button
            class="btn-text"
            type="button"
            @click="adding = false; newName = ''; error = ''"
          >
            Cancel
          </button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.photos-page { max-width: 560px; }

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

.group-title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-m);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.hint {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  margin: 0 0 var(--space-4);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
}
.toggle-row.inline { flex: 1; min-width: 0; }
.toggle-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}
.toggle-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.toggle-title { color: var(--text); }
.toggle-sub {
  color: var(--text-secondary);
  font-size: var(--font-size-s);
}

.sub-toggles {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-left: var(--space-4);
  border-left: 2px solid var(--border);
}

.type-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}
.type-row:last-child { border-bottom: none; }

.type-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.type-name.locked { color: var(--text-secondary); }

.preset-badge {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 0 var(--space-1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.row-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
.row-action {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  border-radius: var(--radius-small);
}
.row-action:hover { color: var(--text); background: var(--bg); }
.row-action.danger:hover { color: var(--danger); background: var(--danger-soft); }

.edit-name-input {
  flex: 1;
  min-width: 140px;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
}

.add-area { margin-top: var(--space-4); }
.add-form {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}
.add-form input[type='text'] {
  flex: 1;
  min-width: 180px;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
}

.error {
  color: var(--danger);
  font-size: var(--font-size-s);
  margin-top: var(--space-2);
}

.btn-primary.small {
  padding: 0.35rem 0.8rem;
  font-size: var(--font-size-s);
}
</style>
