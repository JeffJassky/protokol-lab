<script setup>
import { ref, onMounted, computed } from 'vue';
import { useSettingsStore } from '../stores/settings.js';

const store = useSettingsStore();

const sex = ref('male');
const heightFeet = ref(5);
const heightInches = ref(10);
const currentWeightLbs = ref(180);
const goalWeightLbs = ref(170);
const calories = ref(2000);
const proteinGrams = ref(150);
const fatGrams = ref(65);
const carbsGrams = ref(200);

const saving = ref(false);
const saved = ref(false);
const error = ref('');

const totalHeightInches = computed(() => heightFeet.value * 12 + heightInches.value);

onMounted(async () => {
  if (!store.loaded) {
    await store.fetchSettings();
  }
  if (store.settings) {
    const s = store.settings;
    sex.value = s.sex;
    heightFeet.value = Math.floor(s.heightInches / 12);
    heightInches.value = s.heightInches % 12;
    currentWeightLbs.value = s.currentWeightLbs;
    goalWeightLbs.value = s.goalWeightLbs || '';
    calories.value = s.targets.calories;
    proteinGrams.value = s.targets.proteinGrams;
    fatGrams.value = s.targets.fatGrams;
    carbsGrams.value = s.targets.carbsGrams;
  }
});

async function handleSave() {
  error.value = '';
  saved.value = false;
  saving.value = true;
  try {
    await store.updateSettings({
      sex: sex.value,
      heightInches: totalHeightInches.value,
      currentWeightLbs: Number(currentWeightLbs.value),
      goalWeightLbs: goalWeightLbs.value ? Number(goalWeightLbs.value) : null,
      targets: {
        calories: Number(calories.value),
        proteinGrams: Number(proteinGrams.value),
        fatGrams: Number(fatGrams.value),
        carbsGrams: Number(carbsGrams.value),
      },
    });
    saved.value = true;
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <h2>Settings</h2>
    <form @submit.prevent="handleSave">
      <div class="card">
        <h3>Profile</h3>
        <div class="field">
          <label>Sex</label>
          <div class="radio-group">
            <label class="radio"><input type="radio" v-model="sex" value="male" /> Male</label>
            <label class="radio"><input type="radio" v-model="sex" value="female" /> Female</label>
          </div>
        </div>
        <div class="field">
          <label>Height</label>
          <div class="inline-fields">
            <input type="number" v-model.number="heightFeet" min="3" max="8" class="sm" /> <span>ft</span>
            <input type="number" v-model.number="heightInches" min="0" max="11" class="sm" /> <span>in</span>
          </div>
        </div>
        <div class="field">
          <label for="weight">Current Weight (lbs)</label>
          <input id="weight" type="number" v-model.number="currentWeightLbs" step="0.1" required />
        </div>
        <div class="field">
          <label for="goal">Goal Weight (lbs)</label>
          <input id="goal" type="number" v-model.number="goalWeightLbs" step="0.1" />
        </div>
      </div>

      <div class="card">
        <h3>Daily Targets</h3>
        <div class="field">
          <label for="calories">Calories</label>
          <input id="calories" type="number" v-model.number="calories" required />
        </div>
        <div class="field">
          <label for="protein">Protein (g)</label>
          <input id="protein" type="number" v-model.number="proteinGrams" required />
        </div>
        <div class="field">
          <label for="fat">Fat (g)</label>
          <input id="fat" type="number" v-model.number="fatGrams" required />
        </div>
        <div class="field">
          <label for="carbs">Carbs (g)</label>
          <input id="carbs" type="number" v-model.number="carbsGrams" required />
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="saved" class="success">Settings saved.</p>
      <button type="submit" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save Settings' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.settings-page { max-width: 480px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card h3 {
  font-size: 0.95rem;
  margin-bottom: 1rem;
  color: var(--text);
}
.field {
  margin-bottom: 0.75rem;
}
.field > label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
}
.field input[type="number"] {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.95rem;
  width: 100%;
  background: var(--bg);
  color: var(--text);
}
.field input[type="number"]:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
.field input.sm { width: 64px; }
.inline-fields {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.radio-group {
  display: flex;
  gap: 1.25rem;
}
.radio {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.9rem;
  color: var(--text);
  cursor: pointer;
}
button[type="submit"] {
  padding: 0.6rem 1.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
}
button[type="submit"]:hover { background: var(--primary-hover); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: var(--danger); font-size: 0.85rem; margin-bottom: 0.5rem; }
.success { color: var(--success); font-size: 0.85rem; margin-bottom: 0.5rem; }
</style>
