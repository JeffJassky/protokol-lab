<script setup>
import { ref, watch } from 'vue';
import { api } from '../api/index.js';
import EmojiPickerButton from './EmojiPickerButton.vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  foodItem: { type: Object, default: null },
});

const emit = defineEmits(['close', 'saved']);

const name = ref('');
const emoji = ref('');
const brand = ref('');
const servingSize = ref('');
const servingGrams = ref(100);
const caloriesPer = ref(0);
const proteinPer = ref(0);
const fatPer = ref(0);
const carbsPer = ref(0);
const saving = ref(false);
const error = ref('');

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.foodItem) {
      const f = props.foodItem;
      name.value = f.name || '';
      emoji.value = f.emoji || '';
      brand.value = f.brand || '';
      servingSize.value = f.servingSize || '';
      servingGrams.value = f.servingGrams || 100;
      caloriesPer.value = f.caloriesPer || 0;
      proteinPer.value = f.proteinPer || 0;
      fatPer.value = f.fatPer || 0;
      carbsPer.value = f.carbsPer || 0;
      error.value = '';
    }
  },
);

async function handleSave() {
  if (!props.foodItem?._id) return;
  saving.value = true;
  error.value = '';
  try {
    await api.put(`/api/food/${props.foodItem._id}`, {
      name: name.value,
      emoji: emoji.value,
      brand: brand.value,
      servingSize: servingSize.value,
      servingGrams: Number(servingGrams.value),
      caloriesPer: Number(caloriesPer.value),
      proteinPer: Number(proteinPer.value),
      fatPer: Number(fatPer.value),
      carbsPer: Number(carbsPer.value),
    });
    emit('saved');
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Edit Food Item</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <form @submit.prevent="handleSave">
        <div class="field name-row">
          <div class="emoji-col">
            <label>Icon</label>
            <EmojiPickerButton v-model="emoji" />
          </div>
          <div class="name-col">
            <label>Name</label>
            <input type="text" v-model="name" required />
          </div>
        </div>
        <div class="field">
          <label>Brand</label>
          <input type="text" v-model="brand" />
        </div>

        <div class="field-row">
          <div class="field">
            <label>Serving size</label>
            <input type="text" v-model="servingSize" placeholder='e.g. "1 cup"' />
          </div>
          <div class="field">
            <label>Serving (g)</label>
            <input type="number" v-model.number="servingGrams" min="0" step="1" />
          </div>
        </div>

        <div class="section-label">Per serving</div>

        <div class="field-row macros">
          <div class="field">
            <label class="cal-label">Calories</label>
            <input type="number" v-model.number="caloriesPer" min="0" step="1" />
          </div>
          <div class="field">
            <label class="p-label">Protein (g)</label>
            <input type="number" v-model.number="proteinPer" min="0" step="1" />
          </div>
          <div class="field">
            <label class="f-label">Fat (g)</label>
            <input type="number" v-model.number="fatPer" min="0" step="1" />
          </div>
          <div class="field">
            <label class="c-label">Carbs (g)</label>
            <input type="number" v-model.number="carbsPer" min="0" step="1" />
          </div>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-4);
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  padding: var(--space-5);
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-l);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.modal-header h3 { margin: 0; font-size: var(--font-size-m); }
.close-btn {
  background: none;
  border: none;
  font-size: var(--font-size-m);
  cursor: pointer;
  color: var(--text-secondary);
  padding: var(--space-1);
  border-radius: var(--radius-small);
}
.close-btn:hover { background: var(--bg); color: var(--text); }

.field { margin-bottom: var(--space-2); }
.field label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}
.field input {
  width: 100%;
  padding: var(--space-2) var(--space-2);
  font-size: var(--font-size-s);
}

.field-row {
  display: flex;
  gap: var(--space-2);
}
.name-row {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
}
.name-row .name-col { flex: 1; min-width: 0; }
.name-row .name-col label,
.name-row .emoji-col label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}
.name-row .name-col input {
  width: 100%;
  padding: var(--space-2) var(--space-2);
  font-size: var(--font-size-s);
}
.field-row .field { flex: 1; min-width: 0; }

.section-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--space-1);
  margin-top: var(--space-1);
}

.macros { flex-wrap: wrap; }
.macros .field { min-width: calc(50% - 0.35rem); flex: 1 1 calc(50% - 0.35rem); }

.cal-label { color: var(--color-cal) !important; }
.p-label { color: var(--color-protein) !important; }
.f-label { color: var(--color-fat) !important; }
.c-label { color: var(--color-carbs) !important; }

.error { color: var(--danger); font-size: var(--font-size-s); margin: var(--space-2) 0; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
</style>
