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
  padding: 1rem;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  padding: 1.25rem;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-l);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.modal-header h3 { margin: 0; font-size: 1rem; }
.close-btn {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
}
.close-btn:hover { background: var(--bg); color: var(--text); }

.field { margin-bottom: 0.65rem; }
.field label {
  display: block;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 0.2rem;
}
.field input {
  width: 100%;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}
.field input:focus { outline: none; border-color: var(--primary); }

.field-row {
  display: flex;
  gap: 0.65rem;
}
.name-row {
  display: flex;
  gap: 0.65rem;
  align-items: flex-end;
}
.name-row .name-col { flex: 1; min-width: 0; }
.name-row .name-col label,
.name-row .emoji-col label {
  display: block;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 0.2rem;
}
.name-row .name-col input {
  width: 100%;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}
.name-row .name-col input:focus { outline: none; border-color: var(--primary); }
.field-row .field { flex: 1; min-width: 0; }

.section-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: 0.4rem;
  margin-top: 0.25rem;
}

.macros { flex-wrap: wrap; }
.macros .field { min-width: calc(50% - 0.35rem); flex: 1 1 calc(50% - 0.35rem); }

.cal-label { color: var(--color-cal) !important; }
.p-label { color: var(--color-protein) !important; }
.f-label { color: var(--color-fat) !important; }
.c-label { color: var(--color-carbs) !important; }

.error { color: var(--danger); font-size: 0.8rem; margin: 0.5rem 0; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.btn-secondary {
  padding: 0.45rem 0.9rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.btn-primary {
  padding: 0.45rem 0.9rem;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
</style>
