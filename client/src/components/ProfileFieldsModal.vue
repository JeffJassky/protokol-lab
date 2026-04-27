<script setup>
// Mounted once at app level. Listens to the gate state from
// useProfileFieldsGate; whenever a feature awaits ensure([...]) and any of
// the requested fields are missing, this modal opens, collects them, and
// resolves the awaiting promise.
//
// Two exits: Save (writes via /api/settings PATCH, resolves true) and Skip
// (no write, resolves false). Callers decide whether to proceed on a Skip.

import { ref, watch } from 'vue';
import { _gateState, _resolveCurrent } from '../composables/useProfileFieldsGate.js';
import { useSettingsStore } from '../stores/settings.js';

const { open, pending } = _gateState();
const settings = useSettingsStore();

const values = ref({});
const saving = ref(false);
const error = ref('');

watch(open, (v) => {
  if (v) {
    values.value = {};
    error.value = '';
  }
});

async function save() {
  if (!pending.value) return;
  const patch = {};
  for (const def of pending.value.needs) {
    const raw = values.value[def.field];
    if (raw === '' || raw == null) {
      error.value = `Please fill in ${def.label.toLowerCase()}`;
      return;
    }
    patch[def.field] = def.kind === 'number' ? Number(raw) : raw;
  }
  saving.value = true;
  try {
    await settings.patchSettings(patch);
    _resolveCurrent(true);
  } catch (err) {
    error.value = err.message || 'Could not save';
  } finally {
    saving.value = false;
  }
}

function skip() {
  _resolveCurrent(false);
}
</script>

<template>
  <div v-if="open && pending" class="profile-modal-backdrop" @click.self="skip">
    <div class="profile-modal" role="dialog" aria-modal="true">
      <h3>Quick setup</h3>
      <p class="hint">
        We need a couple details to make this feature work for you.
      </p>

      <div v-for="def in pending.needs" :key="def.field" class="field">
        <label :for="`pf-${def.field}`">{{ def.label }}</label>
        <select
          v-if="def.kind === 'enum'"
          :id="`pf-${def.field}`"
          v-model="values[def.field]"
        >
          <option value="">—</option>
          <option v-for="opt in def.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <input
          v-else
          :id="`pf-${def.field}`"
          v-model="values[def.field]"
          :type="def.kind === 'number' ? 'number' : 'text'"
          :step="def.step || 1"
          :min="def.min"
          :max="def.max"
        />
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="actions">
        <button class="btn-skip" :disabled="saving" type="button" @click="skip">
          Skip for now
        </button>
        <button class="btn-save" :disabled="saving" type="button" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-modal-backdrop {
  position: fixed; inset: 0; z-index: 110;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4, 16px);
}
.profile-modal {
  background: var(--surface);
  border-radius: var(--radius-medium, 10px);
  padding: var(--space-6, 24px);
  width: 100%;
  max-width: 380px;
}
h3 { margin: 0 0 var(--space-2, 8px); font-size: 18px; }
.hint {
  color: var(--text-secondary);
  font-size: var(--font-size-xs, 12px);
  margin: 0 0 var(--space-4, 16px);
}
.field { margin-bottom: var(--space-3, 12px); }
.field label {
  display: block;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.field input,
.field select {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-small, 6px);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.error {
  background: var(--danger-soft, #fee2e2);
  color: var(--danger, #b91c1c);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-small);
  font-size: var(--font-size-xs);
  margin: var(--space-3) 0;
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  margin-top: var(--space-4, 16px);
}
.btn-skip,
.btn-save {
  flex: 1;
  padding: var(--space-3);
  border-radius: var(--radius-small);
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-s, 14px);
}
.btn-skip {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.btn-skip:hover { color: var(--text); }
.btn-save {
  background: var(--primary);
  color: var(--text-on-primary, #fff);
  font-weight: var(--font-weight-medium);
}
.btn-save[disabled],
.btn-skip[disabled] { opacity: 0.5; cursor: not-allowed; }
</style>
