<script setup>
import { ref, onMounted, computed, watch, reactive } from 'vue';
import { useSettingsStore } from '../stores/settings.js';
import { useCompoundsStore } from '../stores/compounds.js';
import { usePushStore } from '../stores/push.js';
import { usePwa } from '../composables/usePwa.js';
import { useTheme } from '../composables/useTheme.js';
import InstallInstructions from '../components/InstallInstructions.vue';

const store = useSettingsStore();
const compoundsStore = useCompoundsStore();
const pushStore = usePushStore();
const pwa = usePwa();
const theme = useTheme();

// ---- Notifications ------------------------------------------------------
const trackReminderEnabled = ref(false);
const trackReminderTime = ref('20:00');
const notificationError = ref('');
const notificationSaving = ref(false);
const testSending = ref(false);
const testStatus = ref(''); // 'ok' | 'err' | ''

const WEEKDAYS = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

const notificationsBlockedByIos = computed(
  () => pwa.platform.value === 'ios' && !pwa.installed.value,
);

async function toggleNotifications() {
  notificationError.value = '';
  if (pushStore.enabled) {
    await pushStore.disable();
  } else {
    const ok = await pushStore.enable();
    if (!ok) notificationError.value = pushStore.error;
  }
}

async function saveTrackReminder() {
  notificationSaving.value = true;
  notificationError.value = '';
  try {
    await store.updateNotifications({
      trackReminder: {
        enabled: trackReminderEnabled.value,
        time: trackReminderTime.value,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (err) {
    notificationError.value = err.message;
  } finally {
    notificationSaving.value = false;
  }
}

async function toggleCategory(category) {
  if (!pushStore.subscriptionDoc) return;
  const current = pushStore.subscriptionDoc.categories?.[category];
  await pushStore.setCategories({ [category]: !current });
}

async function sendTest() {
  testSending.value = true;
  testStatus.value = '';
  try {
    await pushStore.sendTest();
    testStatus.value = 'ok';
  } catch {
    testStatus.value = 'err';
  } finally {
    testSending.value = false;
    setTimeout(() => { testStatus.value = ''; }, 2500);
  }
}

const sex = ref('male');
const heightFeet = ref(5);
const heightInches = ref(10);
const currentWeightLbs = ref(180);
const goalWeightLbs = ref(170);
const bmr = ref('');
const calories = ref(2000);
const proteinGrams = ref(150);
const fatGrams = ref(65);
const carbsGrams = ref(200);

const saving = ref(false);
const saved = ref(false);
const error = ref('');

const totalHeightInches = computed(() => heightFeet.value * 12 + heightInches.value);

// Daily calorie delta vs BMR and the resulting est. weekly weight change.
const calorieDelta = computed(() => {
  const b = Number(bmr.value);
  const c = Number(calories.value);
  if (!b || !c) return null;
  return c - b;
});
const weeklyLbs = computed(() => {
  if (calorieDelta.value == null) return null;
  return calorieDelta.value / 500;
});
function signed(n, digits = 0) {
  const fixed = n.toFixed(digits);
  return n > 0 ? `+${fixed}` : fixed;
}

// ---- Macro allocation sliders -------------------------------------------
// Protein (4 kcal/g) is allocated first; then the remaining calories are
// split between fat (9 kcal/g) and carbs (4 kcal/g) via a second slider.
// Carbs always fills the gap so the three macros always sum to total calories.

const proteinKcal = computed(() => proteinGrams.value * 4);
const remainingAfterProtein = computed(() => Math.max(0, calories.value - proteinKcal.value));
const fatKcal = computed(() => fatGrams.value * 9);
const carbsKcal = computed(() => Math.max(0, remainingAfterProtein.value - fatKcal.value));

// Auto-derived carbs — user never controls this directly.
const carbsComputed = computed(() => Math.round(carbsKcal.value / 4));

// Max slider values.
const maxProteinGrams = computed(() => Math.floor(calories.value / 4));
const maxFatGrams = computed(() => Math.floor(remainingAfterProtein.value / 9));

// Percentage of total calories each macro occupies (for the visual bar).
const pctProtein = computed(() => (calories.value ? (proteinKcal.value / calories.value) * 100 : 0));
const pctFat = computed(() => (calories.value ? (fatKcal.value / calories.value) * 100 : 0));
const pctCarbs = computed(() => Math.max(0, 100 - pctProtein.value - pctFat.value));

// Keep carbs ref in sync (for save) and clamp protein/fat when calories shrinks.
watch(carbsComputed, (v) => { carbsGrams.value = v; });
watch(calories, () => {
  if (proteinGrams.value > maxProteinGrams.value) proteinGrams.value = maxProteinGrams.value;
  if (fatGrams.value > maxFatGrams.value) fatGrams.value = maxFatGrams.value;
});
watch(proteinGrams, () => {
  if (fatGrams.value > maxFatGrams.value) fatGrams.value = maxFatGrams.value;
});

// ---- Single-bar allocation drag handling --------------------------------
const allocBarRef = ref(null);
let activeHandle = null;

function pxToKcal(clientX) {
  const rect = allocBarRef.value.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return pct * calories.value;
}

function onAllocDown(e) {
  const target = e.target.closest('.handle');
  if (!target) return;
  activeHandle = target.dataset.handle;
  const onMove = (ev) => {
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const kcalPos = pxToKcal(clientX);

    if (activeHandle === '1') {
      // Handle 1 controls protein|fat boundary.
      // Can't go past handle 2 (protein + fat boundary).
      const maxKcal = calories.value - fatKcal.value;
      const clamped = Math.max(0, Math.min(maxKcal, kcalPos));
      proteinGrams.value = Math.round(clamped / 4);
    } else {
      // Handle 2 controls fat|carbs boundary.
      // Must stay to the right of handle 1.
      const minKcal = proteinKcal.value;
      const clamped = Math.max(minKcal, Math.min(calories.value, kcalPos));
      const fatKcalNew = clamped - proteinKcal.value;
      fatGrams.value = Math.round(fatKcalNew / 9);
    }
  };
  const onUp = () => {
    activeHandle = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onUp);
}

// ---- Compounds ----------------------------------------------------------

const compoundDrafts = reactive({}); // id → { halfLifeDays, intervalDays, color }
const compoundSaveState = reactive({}); // id → 'saving' | 'saved' | 'error'
const newCompound = reactive({
  name: '',
  halfLifeDays: 6,
  intervalDays: 7,
  doseUnit: 'mg',
  color: '',
});
const compoundsError = ref('');

const compoundRemindersExpanded = reactive({}); // id → bool

function startCompoundDraft(c) {
  compoundDrafts[c._id] = {
    halfLifeDays: c.halfLifeDays,
    intervalDays: c.intervalDays,
    color: c.color || '',
    reminderEnabled: Boolean(c.reminderEnabled),
    reminderTimes: Array.isArray(c.reminderTimes) ? [...c.reminderTimes] : [],
    reminderWeekdays: Array.isArray(c.reminderWeekdays) ? [...c.reminderWeekdays] : [],
  };
}

function toggleCompoundReminderWeekday(compoundId, weekday) {
  const draft = compoundDrafts[compoundId];
  if (!draft) return;
  const idx = draft.reminderWeekdays.indexOf(weekday);
  if (idx >= 0) draft.reminderWeekdays.splice(idx, 1);
  else draft.reminderWeekdays.push(weekday);
}

function addCompoundReminderTime(compoundId) {
  const draft = compoundDrafts[compoundId];
  if (!draft) return;
  draft.reminderTimes.push('09:00');
}

function removeCompoundReminderTime(compoundId, idx) {
  const draft = compoundDrafts[compoundId];
  if (!draft) return;
  draft.reminderTimes.splice(idx, 1);
}

async function saveCompoundReminder(compound) {
  const draft = compoundDrafts[compound._id];
  if (!draft) return;
  compoundSaveState[compound._id] = 'saving';
  try {
    await compoundsStore.update(compound._id, {
      reminderEnabled: draft.reminderEnabled,
      reminderTimes: draft.reminderTimes.filter((t) => /^\d{2}:\d{2}$/.test(t)),
      reminderWeekdays: draft.reminderWeekdays,
    });
    compoundSaveState[compound._id] = 'saved';
    setTimeout(() => { compoundSaveState[compound._id] = null; }, 1200);
  } catch (err) {
    compoundSaveState[compound._id] = 'error';
    compoundsError.value = err.message;
  }
}

function draftFor(id) {
  return compoundDrafts[id];
}

async function toggleCompoundEnabled(compound) {
  compoundsError.value = '';
  try {
    await compoundsStore.update(compound._id, { enabled: !compound.enabled });
  } catch (err) {
    compoundsError.value = err.message;
  }
}

async function saveCompoundDraft(compound) {
  const draft = compoundDrafts[compound._id];
  if (!draft) return;
  compoundSaveState[compound._id] = 'saving';
  try {
    await compoundsStore.update(compound._id, {
      halfLifeDays: Number(draft.halfLifeDays),
      intervalDays: Number(draft.intervalDays),
      color: draft.color,
    });
    compoundSaveState[compound._id] = 'saved';
    setTimeout(() => { compoundSaveState[compound._id] = null; }, 1200);
  } catch (err) {
    compoundSaveState[compound._id] = 'error';
    compoundsError.value = err.message;
  }
}

async function handleDeleteCompound(compound) {
  compoundsError.value = '';
  if (!confirm(`Delete "${compound.name}"? All dose entries for this compound will be removed.`)) return;
  try {
    await compoundsStore.remove(compound._id);
    delete compoundDrafts[compound._id];
  } catch (err) {
    compoundsError.value = err.message;
  }
}

async function handleAddCompound() {
  compoundsError.value = '';
  if (!newCompound.name.trim()) return;
  try {
    const created = await compoundsStore.create({
      name: newCompound.name.trim(),
      halfLifeDays: Number(newCompound.halfLifeDays),
      intervalDays: Number(newCompound.intervalDays),
      doseUnit: newCompound.doseUnit,
      color: newCompound.color,
    });
    startCompoundDraft(created);
    newCompound.name = '';
    newCompound.halfLifeDays = 6;
    newCompound.intervalDays = 7;
    newCompound.doseUnit = 'mg';
    newCompound.color = '';
  } catch (err) {
    compoundsError.value = err.message;
  }
}

onMounted(async () => {
  if (!store.loaded) {
    await store.fetchSettings();
  }
  if (!compoundsStore.loaded) {
    await compoundsStore.fetchAll();
  }
  for (const c of compoundsStore.compounds) startCompoundDraft(c);
  if (store.settings) {
    const s = store.settings;
    sex.value = s.sex;
    heightFeet.value = Math.floor(s.heightInches / 12);
    heightInches.value = s.heightInches % 12;
    currentWeightLbs.value = s.currentWeightLbs;
    goalWeightLbs.value = s.goalWeightLbs || '';
    bmr.value = s.bmr || '';
    calories.value = s.targets.calories;
    proteinGrams.value = s.targets.proteinGrams;
    fatGrams.value = s.targets.fatGrams;
    carbsGrams.value = s.targets.carbsGrams;
    trackReminderEnabled.value = Boolean(s.trackReminder?.enabled);
    trackReminderTime.value = s.trackReminder?.time || '20:00';
  }

  // Push subscription state — safe to call unconditionally; store guards
  // for unsupported browsers.
  pushStore.refreshPermission();
  if (pushStore.supported) {
    await pushStore.fetchVapidKey().catch(() => {});
    await pushStore.loadExistingSubscription();
    if (pushStore.enabled) await pushStore.fetchSubscriptions();
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
      bmr: bmr.value ? Number(bmr.value) : null,
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
        <div class="field">
          <label for="bmr">BMR (kcal/day)</label>
          <input id="bmr" type="number" v-model.number="bmr" step="1" placeholder="Optional" />
          <p class="field-hint">Basal metabolic rate — calories burned at rest. Leave blank if unknown.</p>
        </div>
      </div>

      <div class="card">
        <h3>Daily Targets</h3>

        <div class="field">
          <label for="calories">Calories</label>
          <input id="calories" type="number" v-model.number="calories" min="400" step="50" required />
          <p v-if="calorieDelta != null" class="field-hint calc">
            <span :class="calorieDelta < 0 ? 'neg' : 'pos'">
              {{ signed(calorieDelta) }} kcal/day
            </span>
            vs BMR ·
            <span :class="weeklyLbs < 0 ? 'neg' : 'pos'">
              {{ signed(weeklyLbs, 2) }} lbs/week
            </span>
          </p>
          <p v-else class="field-hint">Set BMR above to see estimated weekly change.</p>
        </div>

        <!-- Single allocation bar with two drag handles:
             handle 1 = protein|fat boundary, handle 2 = fat|carbs boundary -->
        <div
          class="alloc-bar"
          ref="allocBarRef"
          @mousedown="onAllocDown"
          @touchstart.prevent="onAllocDown"
        >
          <div class="seg seg-p" :style="{ width: pctProtein + '%' }" />
          <div class="seg seg-f" :style="{ width: pctFat + '%' }" />
          <div class="seg seg-c" :style="{ width: pctCarbs + '%' }" />
          <div class="handle handle-1" :style="{ left: pctProtein + '%' }" data-handle="1" />
          <div class="handle handle-2" :style="{ left: (pctProtein + pctFat) + '%' }" data-handle="2" />
        </div>

        <div class="alloc-legend">
          <div class="alloc-legend-item">
            <span class="legend-dot dot-p"></span>
            <span class="alloc-label label-p">Protein</span>
            <span class="alloc-spacer"></span>
            <input type="number" class="alloc-input" :value="proteinGrams" min="0" :max="maxProteinGrams" step="5" @change="proteinGrams = Math.min(Number($event.target.value), maxProteinGrams)" /><span class="alloc-unit">g</span>
            <span class="alloc-detail">{{ proteinKcal }} kcal · {{ Math.round(pctProtein) }}%</span>
          </div>
          <div class="alloc-legend-item">
            <span class="legend-dot dot-f"></span>
            <span class="alloc-label label-f">Fat</span>
            <span class="alloc-spacer"></span>
            <input type="number" class="alloc-input" :value="fatGrams" min="0" :max="maxFatGrams" step="1" @change="fatGrams = Math.min(Number($event.target.value), maxFatGrams)" /><span class="alloc-unit">g</span>
            <span class="alloc-detail">{{ fatKcal }} kcal · {{ Math.round(pctFat) }}%</span>
          </div>
          <div class="alloc-legend-item">
            <span class="legend-dot dot-c"></span>
            <span class="alloc-label label-c">Carbs</span>
            <span class="alloc-spacer"></span>
            <span class="alloc-computed">{{ carbsComputed }}</span><span class="alloc-unit">g</span>
            <span class="alloc-detail">{{ carbsKcal }} kcal · {{ Math.round(pctCarbs) }}%</span>
          </div>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="saved" class="success">Settings saved.</p>
      <button type="submit" class="btn-primary" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save Settings' }}
      </button>
    </form>

    <div class="card">
      <h3>Compounds</h3>
      <p class="field-hint" style="margin-bottom: 0.75rem">
        Compounds you dose on a schedule. System entries can be enabled or disabled; custom ones are fully editable.
      </p>
      <ul class="compound-list">
        <li
          v-for="c in compoundsStore.compounds"
          :key="c._id"
          class="compound-row"
          :class="{ disabled: !c.enabled }"
        >
          <div class="compound-row-top">
            <label class="compound-toggle">
              <input
                type="checkbox"
                :checked="c.enabled"
                @change.stop="toggleCompoundEnabled(c)"
                @click.stop
              />
              <span class="compound-name">
                {{ c.name }}
                <span v-if="c.isSystem" class="compound-tag">system</span>
              </span>
            </label>
            <button
              v-if="!c.isSystem"
              type="button"
              class="compound-del"
              @click.stop="handleDeleteCompound(c)"
            >Delete</button>
          </div>
          <div v-if="draftFor(c._id)" class="compound-row-bot">
            <label class="compound-field">
              <span>Half-life (days)</span>
              <input
                type="number"
                step="0.25"
                min="0.1"
                v-model.number="draftFor(c._id).halfLifeDays"
                @change="saveCompoundDraft(c)"
              />
            </label>
            <label class="compound-field">
              <span>Interval (days)</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                v-model.number="draftFor(c._id).intervalDays"
                @change="saveCompoundDraft(c)"
              />
            </label>
            <label class="compound-field small">
              <span>Unit</span>
              <span class="compound-static">{{ c.doseUnit }}</span>
            </label>
            <label class="compound-field small">
              <span>Color</span>
              <input
                type="color"
                v-model="draftFor(c._id).color"
                @change="saveCompoundDraft(c)"
              />
            </label>
            <span
              v-if="compoundSaveState[c._id] === 'saved'"
              class="compound-status ok"
            >saved</span>
            <span
              v-else-if="compoundSaveState[c._id] === 'saving'"
              class="compound-status"
            >saving...</span>
          </div>

          <!-- Dose reminders (per-compound) -->
          <div v-if="draftFor(c._id) && c.enabled" class="compound-reminder">
            <button
              type="button"
              class="reminder-toggle"
              @click="compoundRemindersExpanded[c._id] = !compoundRemindersExpanded[c._id]"
            >
              <span class="reminder-ind" :class="{ on: draftFor(c._id).reminderEnabled }" />
              Dose reminders
              <span class="reminder-sub">
                <template v-if="draftFor(c._id).reminderEnabled && draftFor(c._id).reminderTimes.length">
                  {{ draftFor(c._id).reminderTimes.join(', ') }}
                  <template v-if="draftFor(c._id).reminderWeekdays.length">
                    · {{ draftFor(c._id).reminderWeekdays.map((d) => WEEKDAYS[d].label).join('') }}
                  </template>
                </template>
                <template v-else-if="draftFor(c._id).reminderEnabled">No times set</template>
                <template v-else>Off</template>
              </span>
              <span class="reminder-chev" :class="{ open: compoundRemindersExpanded[c._id] }">▾</span>
            </button>

            <div v-if="compoundRemindersExpanded[c._id]" class="reminder-body">
              <label class="notif-inline small">
                <input
                  type="checkbox"
                  v-model="draftFor(c._id).reminderEnabled"
                  @change="saveCompoundReminder(c)"
                />
                Remind me for {{ c.name }}
              </label>

              <div
                class="reminder-field"
                :class="{ disabled: !draftFor(c._id).reminderEnabled }"
              >
                <span class="reminder-label">Days</span>
                <div class="weekday-row">
                  <button
                    v-for="wd in WEEKDAYS"
                    :key="wd.value"
                    type="button"
                    class="weekday-btn"
                    :class="{ active: draftFor(c._id).reminderWeekdays.includes(wd.value) }"
                    :disabled="!draftFor(c._id).reminderEnabled"
                    @click="toggleCompoundReminderWeekday(c._id, wd.value); saveCompoundReminder(c)"
                  >{{ wd.label }}</button>
                </div>
                <span class="reminder-hint">
                  Empty = every day.
                </span>
              </div>

              <div
                class="reminder-field"
                :class="{ disabled: !draftFor(c._id).reminderEnabled }"
              >
                <span class="reminder-label">Times</span>
                <div class="time-list">
                  <div
                    v-for="(t, idx) in draftFor(c._id).reminderTimes"
                    :key="idx"
                    class="time-row"
                  >
                    <input
                      type="time"
                      :value="t"
                      :disabled="!draftFor(c._id).reminderEnabled"
                      @change="draftFor(c._id).reminderTimes[idx] = $event.target.value; saveCompoundReminder(c)"
                    />
                    <button
                      type="button"
                      class="time-remove"
                      :disabled="!draftFor(c._id).reminderEnabled"
                      @click="removeCompoundReminderTime(c._id, idx); saveCompoundReminder(c)"
                    >×</button>
                  </div>
                  <button
                    type="button"
                    class="time-add"
                    :disabled="!draftFor(c._id).reminderEnabled"
                    @click="addCompoundReminderTime(c._id); saveCompoundReminder(c)"
                  >+ Add time</button>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>

      <div class="compound-add">
        <h4>Add custom compound</h4>
        <div class="compound-add-grid">
          <label class="compound-field">
            <span>Name</span>
            <input type="text" v-model="newCompound.name" placeholder="e.g. Ipamorelin" />
          </label>
          <label class="compound-field">
            <span>Half-life (days)</span>
            <input type="number" step="0.25" min="0.1" v-model.number="newCompound.halfLifeDays" />
          </label>
          <label class="compound-field">
            <span>Interval (days)</span>
            <input type="number" step="0.5" min="0.5" v-model.number="newCompound.intervalDays" />
          </label>
          <label class="compound-field">
            <span>Unit</span>
            <select v-model="newCompound.doseUnit">
              <option value="mg">mg</option>
              <option value="mcg">mcg</option>
              <option value="iu">iu</option>
              <option value="ml">ml</option>
            </select>
          </label>
          <label class="compound-field small">
            <span>Color</span>
            <input type="color" v-model="newCompound.color" />
          </label>
        </div>
        <button type="button" class="btn-secondary" @click="handleAddCompound">Add compound</button>
      </div>
      <p v-if="compoundsError" class="error">{{ compoundsError }}</p>
    </div>

    <!-- Notifications --------------------------------------------------- -->
    <div class="card">
      <h3>Notifications</h3>

      <div v-if="!pushStore.supported" class="notif-note">
        Push notifications aren't supported in this browser.
      </div>
      <div v-else-if="!pushStore.serverEnabled" class="notif-note warn">
        Server push is not configured. Run
        <code>node src/scripts/generate-vapid.js</code> and add the keys to
        <code>server/.env</code>, then restart the server.
      </div>
      <template v-else>
        <div v-if="!pwa.installed.value" class="notif-install">
          <p class="notif-lead">
            <template v-if="notificationsBlockedByIos">
              On iPhone and iPad, push notifications only work when the app is
              installed to your home screen.
            </template>
            <template v-else>
              Install the app for the most reliable delivery.
            </template>
          </p>
          <InstallInstructions />
        </div>

        <!-- Master toggle -->
        <div class="notif-toggle-row">
          <div>
            <div class="notif-title">Notifications on this device</div>
            <div class="notif-sub">
              <template v-if="pushStore.enabled">Enabled.</template>
              <template v-else-if="pushStore.permission === 'denied'">
                Blocked by the browser — re-enable in your device settings.
              </template>
              <template v-else>Off.</template>
            </div>
          </div>
          <button
            type="button"
            class="notif-toggle-btn"
            :class="{ on: pushStore.enabled }"
            :disabled="pushStore.loading || notificationsBlockedByIos"
            @click="toggleNotifications"
          >
            {{ pushStore.enabled ? 'Turn off' : 'Enable' }}
          </button>
        </div>

        <!-- Per-category opt-outs + tracking reminder -->
        <div v-if="pushStore.enabled" class="notif-categories">
          <label class="notif-cat">
            <input
              type="checkbox"
              :checked="pushStore.subscriptionDoc?.categories?.doseReminder !== false"
              @change="toggleCategory('doseReminder')"
            />
            <span>Dose reminders</span>
            <span class="notif-cat-sub">Triggered by each compound's schedule below.</span>
          </label>
          <label class="notif-cat">
            <input
              type="checkbox"
              :checked="pushStore.subscriptionDoc?.categories?.trackReminder !== false"
              @change="toggleCategory('trackReminder')"
            />
            <span>Daily tracking reminder</span>
            <span class="notif-cat-sub">Evening nudge if you haven't logged yet.</span>
          </label>
        </div>

        <div v-if="pushStore.enabled" class="notif-track-time">
          <div class="notif-track-row">
            <label class="notif-inline">
              <input type="checkbox" v-model="trackReminderEnabled" />
              Send tracking reminder at
            </label>
            <input
              type="time"
              v-model="trackReminderTime"
              :disabled="!trackReminderEnabled"
              class="notif-time"
            />
            <button
              type="button"
              class="btn-secondary sm"
              :disabled="notificationSaving"
              @click="saveTrackReminder"
            >
              {{ notificationSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <p class="notif-sub">Won't fire if you've already logged weight, meals, symptoms, or a dose that day.</p>
        </div>

        <div v-if="pushStore.enabled" class="notif-test-row">
          <button
            type="button"
            class="btn-secondary"
            :disabled="testSending"
            @click="sendTest"
          >
            {{ testSending ? 'Sending…' : 'Send test notification' }}
          </button>
          <span v-if="testStatus === 'ok'" class="notif-success">Sent — check your device.</span>
          <span v-else-if="testStatus === 'err'" class="notif-err">Failed. Check logs.</span>
        </div>

        <p v-if="notificationError || pushStore.error" class="error">
          {{ notificationError || pushStore.error }}
        </p>
      </template>
    </div>

    <div class="card">
      <h3>Appearance</h3>
      <div class="field">
        <label>Theme</label>
        <div class="theme-toggle">
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'light' }"
            @click="theme = 'light'"
          >Light</button>
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'dark' }"
            @click="theme = 'dark'"
          >Dark</button>
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'auto' }"
            @click="theme = 'auto'"
          >System</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 480px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.card h3 {
  font-size: var(--font-size-m);
  margin-bottom: var(--space-4);
  color: var(--text);
}
.field {
  margin-bottom: var(--space-3);
}
.field > label {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}
.field-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.field-hint.calc { font-size: var(--font-size-s); font-variant-numeric: tabular-nums; }
.field-hint.calc .neg { color: var(--danger); font-weight: var(--font-weight-bold); }
.field-hint.calc .pos { color: var(--success); font-weight: var(--font-weight-bold); }
.field input[type="number"] {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-m);
  width: 100%;
}
.field input.sm { width: 64px; }
.inline-fields {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-s);
}
.radio-group {
  display: flex;
  gap: var(--space-5);
}
.radio {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
/* Macro allocation bar — single bar, two draggable handles */
.alloc-bar {
  position: relative;
  display: flex;
  height: 32px;
  border-radius: var(--radius-small);
  overflow: visible;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  cursor: default;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.seg {
  height: 100%;
  min-width: 0;
  transition: width 0.05s;
}
.seg-p { background: var(--color-protein); }
.seg-f { background: var(--color-fat); }
.seg-c { background: var(--color-carbs); }

.handle {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 40px;
  margin-left: -3px;
  margin-top: -20px;
  background: var(--surface);
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-small);
  cursor: ew-resize;
  z-index: 2;
  box-shadow: var(--shadow-s);
  transition: border-color var(--transition-fast);
}
.handle:hover { border-color: var(--text-secondary); }

.alloc-legend { margin-bottom: 0.5rem; }
.alloc-legend-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  top: -1px;
}
.dot-p { background: var(--color-protein); }
.dot-f { background: var(--color-fat); }
.dot-c { background: var(--color-carbs); }
.alloc-label { font-size: var(--font-size-s); font-weight: var(--font-weight-bold); }
.label-p { color: var(--color-protein); }
.label-f { color: var(--color-fat); }
.label-c { color: var(--color-carbs); }
.alloc-spacer { flex: 1; }
.alloc-input {
  width: 52px;
  padding: 0.2rem 0.35rem;
  font-size: var(--font-size-s);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.alloc-unit {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.alloc-computed {
  display: inline-block;
  width: 52px;
  text-align: right;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.alloc-detail {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.error { color: var(--danger); font-size: var(--font-size-s); margin-bottom: 0.5rem; }
.success { color: var(--success); font-size: var(--font-size-s); margin-bottom: 0.5rem; }

/* Compounds */
.compound-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.compound-row {
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: 0.6rem 0.75rem;
  background: var(--bg);
}
.compound-row.disabled { opacity: 0.55; }
.compound-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.compound-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-m);
  color: var(--text);
}
.compound-name { font-weight: var(--font-weight-medium); }
.compound-tag {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 0.35rem;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  vertical-align: middle;
}
.compound-del {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 0.2rem 0.5rem;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  cursor: pointer;
}
.compound-del:hover { color: var(--danger); border-color: var(--danger); }
.compound-row-bot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  margin-top: 0.5rem;
  align-items: flex-end;
}
.compound-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.compound-field input[type="number"],
.compound-field input[type="text"],
.compound-field select {
  padding: 0.3rem 0.5rem;
  background: var(--surface);
  font-size: var(--font-size-s);
  width: 110px;
}
.compound-field.small input,
.compound-field.small select { width: 56px; }
.compound-field input[type="color"] {
  width: 40px;
  height: 28px;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.compound-static {
  padding: 0.3rem 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-align: center;
  width: 56px;
}
.compound-status { font-size: var(--font-size-xs); color: var(--text-secondary); }
.compound-status.ok { color: var(--success); }
.compound-add {
  border-top: 1px dashed var(--border);
  padding-top: 0.75rem;
  margin-top: 0.5rem;
}
.compound-add h4 {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  margin: 0 0 0.5rem;
}
.compound-add-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: flex-end;
  margin-bottom: 0.5rem;
}

/* Notifications */
.notif-note {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  padding: 0.5rem 0;
}
.notif-note.warn { color: var(--warning, var(--text-secondary)); }
.notif-note code {
  background: var(--bg);
  padding: 0.05rem 0.25rem;
  font-size: var(--font-size-s);
}

.notif-install {
  margin-bottom: 0.85rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px dashed var(--border);
}
.notif-lead { margin: 0 0 0.5rem; font-size: var(--font-size-s); color: var(--text); }

.notif-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}
.notif-title { font-size: var(--font-size-s); font-weight: var(--font-weight-medium); color: var(--text); }
.notif-sub { font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 0.15rem; }
.notif-toggle-btn {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: var(--font-size-s);
  cursor: pointer;
  font-weight: var(--font-weight-medium);
}
.notif-toggle-btn.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-on-primary);
}
.notif-toggle-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.notif-categories {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}
.notif-cat {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: baseline;
  gap: 0.15rem 0.5rem;
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.notif-cat input[type="checkbox"] { grid-row: 1 / span 2; align-self: start; margin-top: 3px; }
.notif-cat-sub { grid-column: 2; font-size: var(--font-size-xs); color: var(--text-secondary); }

.notif-track-time {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}
.notif-track-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.notif-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.notif-inline.small { font-size: var(--font-size-s); }
.notif-time {
  padding: 0.3rem 0.5rem;
  font-size: var(--font-size-s);
}
.notif-time:disabled { opacity: 0.5; }

.notif-test-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0 0.25rem;
  flex-wrap: wrap;
}
.notif-success { color: var(--success); font-size: var(--font-size-s); }
.notif-err { color: var(--danger); font-size: var(--font-size-s); }

/* Per-compound reminder block */
.compound-reminder {
  margin-top: 0.5rem;
  border-top: 1px dashed var(--border);
  padding-top: 0.5rem;
}
.reminder-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  background: none;
  border: none;
  padding: var(--space-1) 0;
  cursor: pointer;
  text-align: left;
  font-size: var(--font-size-s);
  color: var(--text);
}
.reminder-ind {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex: none;
}
.reminder-ind.on { background: var(--success, var(--primary)); }
.reminder-sub {
  flex: 1;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
.reminder-chev {
  color: var(--text-secondary);
  transition: transform var(--transition-base);
}
.reminder-chev.open { transform: rotate(180deg); }

.reminder-body {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.5rem 0.1rem 0.2rem;
}
.reminder-field { display: flex; flex-direction: column; gap: 0.3rem; }
.reminder-field.disabled { opacity: 0.55; }
.reminder-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}
.reminder-hint { font-size: var(--font-size-xs); color: var(--text-secondary); }

.weekday-row { display: flex; gap: 0.25rem; }
.weekday-btn {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  font-weight: var(--font-weight-medium);
}
.weekday-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-on-primary);
}
.weekday-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.time-list { display: flex; flex-direction: column; gap: 0.35rem; }
.time-row { display: flex; align-items: center; gap: 0.35rem; }
.time-row input[type="time"] {
  padding: 0.3rem 0.45rem;
  font-size: var(--font-size-s);
}
.time-remove {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: var(--font-size-m);
  line-height: 1;
}
.time-remove:hover { color: var(--danger); border-color: var(--danger); }
.time-add {
  background: none;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  align-self: flex-start;
}
.time-add:hover { color: var(--text); border-color: var(--text-secondary); }
.time-add:disabled { opacity: 0.5; cursor: not-allowed; }

/* Theme toggle — segmented control */
.theme-toggle {
  display: inline-flex;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 2px;
  gap: 2px;
}
.theme-option {
  padding: 0.35rem 0.8rem;
  background: none;
  border: none;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.theme-option:hover { color: var(--text); }
.theme-option.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
</style>
