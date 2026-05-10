<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useSettingsStore } from '../stores/settings.js';
import MacroAllocator from '../components/MacroAllocator.vue';
import {
  ACTIVITY_LEVELS,
  GOAL_RATES,
  bmrMifflin,
  tdee as computeTdee,
} from '../../../shared/bio/bodyMath.js';

const store = useSettingsStore();

const sex = ref('male');
const age = ref('');
const heightFeet = ref(5);
const heightInches = ref(10);
const currentWeightLbs = ref(180);
const goalWeightLbs = ref(170);
// Resting metabolic rate (Mifflin-St Jeor). Auto-derived; rarely user-set.
const bmr = ref('');
// Total daily energy expenditure. Drives the calorie-deficit math.
const tdee = ref('');
const activityLevel = ref('');
const goalRateLbsPerWeek = ref(null);
const calories = ref(2000);
const proteinGrams = ref(150);
const fatGrams = ref(65);
const carbsGrams = ref(200);

const error = ref('');
const hydrated = ref(false);

const totalHeightInches = computed(() => heightFeet.value * 12 + heightInches.value);

const bmrComputed = computed(() => bmrMifflin({
  sex: sex.value,
  age: Number(age.value),
  heightInches: totalHeightInches.value,
  weightLbs: Number(currentWeightLbs.value),
}));

const tdeeComputed = computed(() =>
  computeTdee(bmrComputed.value, activityLevel.value),
);

const calorieDelta = computed(() => {
  const t = Number(tdee.value);
  const c = Number(calories.value);
  if (!t || !c) return null;
  return c - t;
});
const weeklyLbs = computed(() => {
  if (calorieDelta.value == null) return null;
  return calorieDelta.value / 500;
});
function signed(n, digits = 0) {
  const fixed = n.toFixed(digits);
  return n > 0 ? `+${fixed}` : fixed;
}

const timeToGoal = computed(() => {
  const cur = Number(currentWeightLbs.value);
  const goal = Number(goalWeightLbs.value);
  const wk = weeklyLbs.value;
  if (!cur || !goal) return { state: 'missing' };
  if (wk == null || wk === 0) return { state: 'steady' };
  const remaining = cur - goal;
  if (Math.abs(remaining) < 0.1) return { state: 'at' };
  const needLoss = remaining > 0;
  const losing = wk < 0;
  if (needLoss !== losing) return { state: 'wrong' };
  const weeks = Math.abs(remaining) / Math.abs(wk);
  const days = weeks * 7;
  let label;
  if (days < 30) label = `${Math.round(days)}d`;
  else if (weeks < 10) label = `${weeks.toFixed(1)}w`;
  else label = `${(weeks / (52 / 12)).toFixed(1)}mo`;
  return { state: 'ok', label };
});

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  if (store.settings) {
    const s = store.settings;
    sex.value = s.sex || 'male';
    age.value = s.age || '';
    heightFeet.value = s.heightInches ? Math.floor(s.heightInches / 12) : 5;
    heightInches.value = s.heightInches ? s.heightInches % 12 : 10;
    currentWeightLbs.value = s.currentWeightLbs ?? 180;
    goalWeightLbs.value = s.goalWeightLbs || '';
    bmr.value = s.bmr || '';
    tdee.value = s.tdee || '';
    activityLevel.value = s.activityLevel || '';
    goalRateLbsPerWeek.value = s.goalRateLbsPerWeek != null ? s.goalRateLbsPerWeek : null;
    calories.value = s.targets?.calories ?? 2000;
    proteinGrams.value = s.targets?.proteinGrams ?? 150;
    fatGrams.value = s.targets?.fatGrams ?? 65;
    carbsGrams.value = s.targets?.carbsGrams ?? 200;
  }
  hydrated.value = true;
});

async function persist() {
  error.value = '';
  try {
    await store.patchSettings({
      sex: sex.value,
      age: age.value ? Number(age.value) : null,
      heightInches: totalHeightInches.value,
      currentWeightLbs: Number(currentWeightLbs.value),
      goalWeightLbs: goalWeightLbs.value ? Number(goalWeightLbs.value) : null,
      bmr: bmrComputed.value || null,
      tdee: tdee.value ? Number(tdee.value) : null,
      activityLevel: activityLevel.value || null,
      goalRateLbsPerWeek: goalRateLbsPerWeek.value,
      targets: {
        calories: Number(calories.value),
        proteinGrams: Number(proteinGrams.value),
        fatGrams: Number(fatGrams.value),
        carbsGrams: Number(carbsGrams.value),
      },
    });
  } catch (err) {
    error.value = err.message;
  }
}

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 600);
}

watch(
  [sex, age, heightFeet, heightInches, currentWeightLbs, goalWeightLbs,
   tdee, activityLevel, goalRateLbsPerWeek,
   calories, proteinGrams, fatGrams, carbsGrams],
  scheduleSave,
);
</script>

<template>
  <div class="profile-page">
    <form @submit.prevent>
      <div class="card">
        <h3>Profile</h3>

        <div class="stat-grid">
          <label class="stat-cell">
            <span class="stat-label">Current</span>
            <span class="stat-value-wrap">
              <input
                type="number"
                v-model.number="currentWeightLbs"
                step="0.1"
                required
                class="stat-input"
              />
              <span class="stat-unit">lbs</span>
            </span>
          </label>
          <label class="stat-cell">
            <span class="stat-label">Goal</span>
            <span class="stat-value-wrap">
              <input
                type="number"
                v-model.number="goalWeightLbs"
                step="0.1"
                class="stat-input"
                placeholder="—"
              />
              <span class="stat-unit">lbs</span>
            </span>
          </label>
          <label class="stat-cell">
            <span class="stat-label"
              >TDEE
              <span v-if="tdeeComputed && !tdee" class="stat-hint"
                >auto: {{ tdeeComputed }}</span
              >
            </span>
            <span class="stat-value-wrap">
              <input
                type="number"
                v-model.number="tdee"
                step="1"
                class="stat-input"
                :placeholder="tdeeComputed || '—'"
              />
              <span class="stat-unit">kcal/day</span>
            </span>
          </label>
        </div>

        <p v-if="bmrComputed" class="bmr-readout">
          BMR (resting): <strong>{{ bmrComputed }}</strong> kcal/day
          <span class="bmr-readout-sub">
            — auto-calculated from sex, age, height, and weight (Mifflin-St
            Jeor).
          </span>
        </p>

        <div class="bio-row">
          <div class="bio-group">
            <span class="bio-label">Sex</span>
            <div class="seg-control">
              <button
                type="button"
                class="seg-btn"
                :class="{ active: sex === 'male' }"
                @click="sex = 'male'"
              >
                Male
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ active: sex === 'female' }"
                @click="sex = 'female'"
              >
                Female
              </button>
            </div>
          </div>
          <div class="bio-group">
            <span class="bio-label">Age</span>
            <div class="bio-inline">
              <input
                type="number"
                v-model.number="age"
                min="13"
                max="120"
                class="bio-input"
                placeholder="—"
              />
              <span class="bio-unit">yrs</span>
            </div>
          </div>
          <div class="bio-group">
            <span class="bio-label">Height</span>
            <div class="bio-inline">
              <input
                type="number"
                v-model.number="heightFeet"
                min="3"
                max="8"
                class="bio-input"
              />
              <span class="bio-unit">ft</span>
              <input
                type="number"
                v-model.number="heightInches"
                min="0"
                max="11"
                class="bio-input"
              />
              <span class="bio-unit">in</span>
            </div>
          </div>
        </div>

        <div class="bio-row">
          <div class="bio-group bio-group-wide">
            <span class="bio-label">Activity level</span>
            <select v-model="activityLevel" class="bio-select">
              <option value="">—</option>
              <option
                v-for="lvl in ACTIVITY_LEVELS"
                :key="lvl.value"
                :value="lvl.value"
              >
                {{ lvl.label }} (×{{ lvl.multiplier }})
              </option>
            </select>
          </div>
          <div class="bio-group bio-group-wide">
            <span class="bio-label">Goal rate</span>
            <select v-model="goalRateLbsPerWeek" class="bio-select">
              <option :value="null">—</option>
              <option v-for="r in GOAL_RATES" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Daily Targets</h3>

        <div class="cal-hero">
          <label class="cal-hero-main">
            <span class="cal-hero-label">Calories / day</span>
            <input
              id="calories"
              type="number"
              v-model.number="calories"
              min="400"
              step="50"
              required
              class="cal-hero-input"
            />
          </label>
          <div v-if="calorieDelta != null" class="cal-hero-aside">
            <div class="cal-stat">
              <span class="cal-stat-label">vs TDEE</span>
              <span
                class="cal-stat-value"
                :class="calorieDelta < 0 ? 'neg' : 'pos'"
              >
                {{ signed(calorieDelta) }}
                <span class="cal-stat-unit">kcal</span>
              </span>
            </div>
            <div class="cal-stat">
              <span class="cal-stat-label">Projected</span>
              <span
                class="cal-stat-value"
                :class="weeklyLbs < 0 ? 'neg' : 'pos'"
              >
                {{ signed(weeklyLbs, 2) }}
                <span class="cal-stat-unit">lbs/wk</span>
              </span>
            </div>
            <div class="cal-stat">
              <span class="cal-stat-label">To goal</span>
              <span
                class="cal-stat-value"
                :class="{
                  pos: timeToGoal.state === 'ok' || timeToGoal.state === 'at',
                  muted: timeToGoal.state !== 'ok' && timeToGoal.state !== 'at',
                }"
              >
                <template
                  v-if="timeToGoal.state === 'ok'"
                  >{{ timeToGoal.label }}</template
                >
                <template v-else-if="timeToGoal.state === 'at'"
                  >At goal</template
                >
                <template v-else-if="timeToGoal.state === 'wrong'"
                  >Wrong way</template
                >
                <template v-else-if="timeToGoal.state === 'steady'"
                  >Steady</template
                >
                <template v-else>Set goal</template>
              </span>
            </div>
          </div>
          <p v-else class="cal-hero-hint">
            Set TDEE above (or fill in age + activity level) to see deficit +
            projected weekly change.
          </p>
        </div>

        <MacroAllocator
          :calories="calories || 0"
          :protein-grams="proteinGrams || 0"
          :fat-grams="fatGrams || 0"
          @update:protein-grams="proteinGrams = $event"
          @update:fat-grams="fatGrams = $event"
          @update:carbs-grams="carbsGrams = $event"
        />
      </div>

      <p v-if="error" class="error">{{ error }}</p>
    </form>

    <h3 class="section-header">Biology</h3>
    <router-link to="/profile/settings/bloodwork" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Bloodwork</span>
        <span class="settings-link-sub">Lab values that personalize the simulation engine</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/conditions" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Conditions</span>
        <span class="settings-link-sub">ADHD, POTS, MCAS, PCOS, depression, anxiety…</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/genetics" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Genetics</span>
        <span class="settings-link-sub">Pharmacogenomics, methylation, lipid + fitness markers</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/menstruation" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Menstrual cycle</span>
        <span class="settings-link-sub">Cycle tracking, predictions + reminders</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>

    <h3 class="section-header">Tracking</h3>
    <router-link to="/profile/settings/metrics" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Measurements</span>
        <span class="settings-link-sub">Body measurements + unit system</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/compounds" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Compounds</span>
        <span class="settings-link-sub">Your regimen + dose schedules</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/exercise" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Exercise</span>
        <span class="settings-link-sub">Tracking, energy mode, activity catalog</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/fasting" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Fasting</span>
        <span class="settings-link-sub">Intermittent fasting schedule + banner</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/journal" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Journal</span>
        <span class="settings-link-sub">Daily notes textarea on the Log page</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/water" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Hydration</span>
        <span class="settings-link-sub">Daily water tracker + dashboard</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/photos" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Photos</span>
        <span class="settings-link-sub">Progress photo categories + visibility</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/tracking" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Tracked days</span>
        <span class="settings-link-sub">How missing days affect rolling-window math</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>

    <h3 class="section-header">App</h3>
    <router-link
      to="/profile/settings/notifications"
      class="card settings-link"
    >
      <span class="settings-link-text">
        <span class="settings-link-label">Notifications</span>
        <span class="settings-link-sub">Push reminders + daily tracking</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/insights" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Insights</span>
        <span class="settings-link-sub">Auto-detected patterns + confidence floor</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/appearance" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Appearance</span>
        <span class="settings-link-sub">Theme</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
    <router-link to="/profile/settings/account" class="card settings-link">
      <span class="settings-link-text">
        <span class="settings-link-label">Account</span>
        <span class="settings-link-sub">Email, sign out, subscription</span>
      </span>
      <span class="settings-link-chevron">›</span>
    </router-link>
  </div>
</template>

<style scoped>
.profile-page { max-width: 720px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.card h3 {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin-bottom: var(--space-4);
}
.section-header {
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  margin: var(--space-6) 0 var(--space-2);
  padding: 0 var(--space-1);
}
.section-header:first-of-type { margin-top: var(--space-4); }

/* Each link is a .card so it picks up the global mobile full-bleed +
   2px-vertical-margin treatment that adjacent cards use. */
.settings-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  text-decoration: none;
  color: var(--text);
  margin-bottom: 2px;
  transition: border-color var(--transition-fast);
}
.settings-link:last-child { margin-bottom: 0; }
.settings-link:hover { border-color: var(--primary); }
.settings-link-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.settings-link-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.settings-link-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.settings-link-chevron {
  font-size: var(--font-size-l);
  color: var(--text-tertiary);
  flex: none;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.stat-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  cursor: text;
  transition: border-color var(--transition-fast);
}
.stat-cell:focus-within { border-color: var(--primary); }
.stat-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.stat-value-wrap {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}
.stat-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
.stat-input::placeholder { color: var(--text-disabled); font-weight: var(--font-weight-light); }
.stat-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-medium);
}

.bio-row {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: var(--space-4);
  align-items: center;
  margin-top: var(--space-3);
}
.bio-row + .bio-row { grid-template-columns: 1fr 1fr; }
.bio-group { display: flex; align-items: center; gap: var(--space-2); }
.bio-group-wide { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1); }

@media (max-width: 720px) {
  .bio-row,
  .bio-row + .bio-row {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .bio-group {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-1);
  }
  .seg-control { align-self: flex-start; }
}
.bio-select {
  padding: 0.4rem 0.55rem;
  font-size: var(--font-size-s);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  width: 100%;
}
.bmr-readout {
  margin: var(--space-2) 0 0;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.bmr-readout strong { color: var(--text); font-variant-numeric: tabular-nums; }
.bmr-readout-sub { color: var(--text-tertiary); }
.stat-hint {
  display: block;
  font-size: 0.65rem;
  color: var(--text-tertiary);
  text-transform: none;
  letter-spacing: 0;
  font-weight: var(--font-weight-regular);
  margin-top: 2px;
}
.bio-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.seg-control {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 2px;
  gap: 2px;
}
.seg-btn {
  padding: 0.25rem 0.65rem;
  background: none;
  border: none;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.seg-btn:hover { color: var(--text); }
.seg-btn.active {
  background: var(--surface-raised);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
.bio-inline { display: inline-flex; align-items: baseline; gap: var(--space-1); }
.bio-input {
  width: 48px;
  padding: 0.25rem 0.35rem;
  text-align: right;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}
.bio-unit { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-right: var(--space-1); }

.cal-hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-4);
  align-items: end;
  padding: var(--space-4);
  background: var(--bg);
  border: 1px solid var(--border);
  margin-bottom: var(--space-5);
}
.cal-hero-main { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.cal-hero-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.cal-hero-input {
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  width: 100%;
}
.cal-hero-aside {
  display: flex;
  gap: var(--space-3) var(--space-4);
  align-items: stretch;
  flex-wrap: wrap;
  padding-left: var(--space-4);
  border-left: 1px solid var(--border);
}
@media (max-width: 540px) {
  .cal-hero {
    grid-template-columns: 1fr;
  }
  .cal-hero-aside {
    border-left: none;
    border-top: 1px solid var(--border);
    padding-left: 0;
    padding-top: var(--space-3);
  }
}
.cal-stat { display: flex; flex-direction: column; gap: var(--space-1); }
.cal-stat-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.cal-stat-value {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.cal-stat-value.neg { color: var(--danger); }
.cal-stat-value.pos { color: var(--success); }
.cal-stat-value.muted { color: var(--text-tertiary); }
.cal-stat-unit { font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: var(--font-weight-medium); margin-left: 2px; }
.cal-hero-hint {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.error { color: var(--danger); font-size: var(--font-size-s); margin-bottom: 0.5rem; }
</style>
