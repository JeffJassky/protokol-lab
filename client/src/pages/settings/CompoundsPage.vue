<script setup>
import { ref, onMounted, computed, reactive } from 'vue';
import { useCompoundsStore } from '../../stores/compounds.js';
import { useDosesStore } from '../../stores/doses.js';
import { usePlanLimits } from '../../composables/usePlanLimits.js';
import { useUpgradeModalStore } from '../../stores/upgradeModal.js';
import UpgradeBadge from '../../components/UpgradeBadge.vue';

const compoundsStore = useCompoundsStore();
const dosesStore = useDosesStore();
const planLimits = usePlanLimits();
const upgradeModal = useUpgradeModalStore();

// System (built-in) compounds are universal and don't count toward the cap.
const customCompoundCount = computed(() =>
  compoundsStore.compounds.filter((c) => !c.isSystem).length,
);
const customCompoundCap = computed(() => planLimits.storageCap('customCompounds'));
const compoundsAtCap = computed(
  () => !planLimits.canAddStorage('customCompounds', customCompoundCount.value),
);
const compoundsUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ storageKey: 'customCompounds' });
  return target?.id || null;
});

const KINETICS_SHAPES = [
  { value: 'bolus', label: 'Bolus', blurb: 'Instant peak, then exponential decay. IV-like or anything that hits peak almost immediately.' },
  { value: 'subq', label: 'Sub-Q', blurb: 'Rises over a few hours, then decays. Default for self-injected peptides.' },
  { value: 'depot', label: 'Depot', blurb: 'Slow release: lower peak, much longer tail. Long-acting weeklies and oil-based formulations.' },
];

// Mini sparkline path for the profile popover. Single dose, normalized to
// each shape's own peak so the silhouette differences read clearly at small size.
function profileSparkline(shape) {
  const W = 96, H = 28, PAD = 2;
  const N = 64, tMax = 6;
  const halfLife = 1;
  const ke = Math.LN2 / halfLife;
  const ABS = { subq: 0.25, depot: 1 };
  const ka = shape === 'bolus' ? null : Math.LN2 / ABS[shape];
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * tMax;
    let y;
    if (shape === 'bolus') y = Math.exp(-ke * t);
    else if (Math.abs(ka - ke) < 1e-6) y = ke * t * Math.exp(-ke * t);
    else y = (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
    pts.push({ t, y });
  }
  const maxY = Math.max(...pts.map((p) => p.y)) || 1;
  return pts.map((p, i) => {
    const x = PAD + (p.t / tMax) * (W - 2 * PAD);
    const y = H - PAD - (p.y / maxY) * (H - 2 * PAD);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

const compoundDrafts = reactive({});
const compoundSaveState = reactive({});
const newCompound = reactive({
  name: '',
  halfLifeDays: 6,
  intervalDays: 7,
  doseUnit: 'mg',
  color: '',
  kineticsShape: 'subq',
});
const compoundsError = ref('');

function startCompoundDraft(c) {
  compoundDrafts[c._id] = {
    halfLifeDays: c.halfLifeDays,
    intervalDays: c.intervalDays,
    color: c.color || '',
    kineticsShape: c.kineticsShape || 'subq',
    reminderEnabled: Boolean(c.reminderEnabled),
    reminderTime: c.reminderTime || '09:00',
  };
}

async function saveCompoundReminder(compound) {
  const draft = compoundDrafts[compound._id];
  if (!draft) return;
  compoundSaveState[compound._id] = 'saving';
  try {
    await compoundsStore.update(compound._id, {
      reminderEnabled: draft.reminderEnabled,
      reminderTime: /^\d{2}:\d{2}$/.test(draft.reminderTime) ? draft.reminderTime : '',
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

// Brand names + generic name shown together as a dot-separated synonym list,
// brands first. Generic is appended only if it isn't already in brandNames.
function displayCompoundNames(c) {
  const brands = c.brandNames || [];
  if (!brands.length) return c.name;
  const lower = brands.map((b) => b.toLowerCase());
  if (c.name && !lower.includes(c.name.toLowerCase())) {
    return [...brands, c.name].join(' · ');
  }
  return brands.join(' · ');
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
      kineticsShape: draft.kineticsShape,
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

  // Pre-flight cap check. Server still enforces (auth boundary), but blocking
  // here avoids a round-trip and gives a faster, prettier upsell.
  if (compoundsAtCap.value) {
    upgradeModal.openForGate({
      limitKey: 'customCompounds',
      used: customCompoundCount.value,
    });
    return;
  }

  try {
    const created = await compoundsStore.create({
      name: newCompound.name.trim(),
      halfLifeDays: Number(newCompound.halfLifeDays),
      intervalDays: Number(newCompound.intervalDays),
      doseUnit: newCompound.doseUnit,
      color: newCompound.color,
      kineticsShape: newCompound.kineticsShape,
    });
    startCompoundDraft(created);
    newCompound.name = '';
    newCompound.halfLifeDays = 6;
    newCompound.intervalDays = 7;
    newCompound.doseUnit = 'mg';
    newCompound.color = '';
    newCompound.kineticsShape = 'subq';
  } catch (err) {
    compoundsError.value = err.message;
  }
}

function nextDoseInfo(compound) {
  const last = dosesStore.latestDoseFor(compound._id);
  if (!last) return { label: 'No doses logged', status: 'none' };
  const interval = Number(compound.intervalDays) || 0;
  if (!interval) return { label: '—', status: 'none' };
  const lastDate = new Date(String(last.date).slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(lastDate);
  next.setDate(next.getDate() + interval);
  const days = Math.round((next - today) / 86400000);
  if (days < 0) return { label: `${-days}d overdue`, status: 'overdue' };
  if (days === 0) return { label: 'Due today', status: 'today' };
  if (days === 1) return { label: 'Due tomorrow', status: 'upcoming' };
  return { label: `In ${days}d`, status: 'upcoming' };
}

onMounted(async () => {
  if (!compoundsStore.loaded) await compoundsStore.fetchAll();
  dosesStore.fetchEntries().catch(() => {});
  for (const c of compoundsStore.compounds) startCompoundDraft(c);
});
</script>

<template>
  <div class="compounds-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">‹ Profile</router-link>
      <h2 class="page-title">Compounds</h2>
    </div>

    <div class="card">
      <p class="lead">
        Compounds you dose on a schedule. System entries can be enabled or disabled; custom ones are fully editable.
      </p>

      <ul class="compound-list">
        <li
          v-for="c in compoundsStore.compounds"
          :key="c._id"
          class="compound-row"
          :class="{ disabled: !c.enabled }"
          :style="c.enabled && c.color ? { borderLeftColor: c.color, borderLeftWidth: '3px' } : null"
        >
          <label class="switch compound-toggle" :title="c.enabled ? 'Disable' : 'Enable'" @click.stop>
            <input
              type="checkbox"
              :checked="c.enabled"
              @change.stop="toggleCompoundEnabled(c)"
            />
            <span class="switch-track"><span class="switch-thumb" /></span>
          </label>
          <div class="compound-body">
            <div class="compound-lead">
              <div class="compound-identity">
                <div class="compound-name-row">
                  <span class="compound-name">{{ displayCompoundNames(c) }}</span>
                  <svg
                    v-if="c.isSystem"
                    class="compound-lock"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-label="System compound"
                  >
                    <rect x="4" y="11" width="16" height="9" rx="0" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </div>
                <span
                  v-if="c.enabled"
                  class="compound-next"
                  :class="`status-${nextDoseInfo(c).status}`"
                >{{ nextDoseInfo(c).label }}</span>
              </div>
              <button
                v-if="!c.isSystem"
                type="button"
                class="compound-del"
                @click.stop="handleDeleteCompound(c)"
                title="Delete compound"
              >×</button>
            </div>
            <div v-if="draftFor(c._id) && c.enabled" class="compound-params">
              <label class="param-chip">
                <span class="param-label">Half-life</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.1"
                  v-model.number="draftFor(c._id).halfLifeDays"
                  @change="saveCompoundDraft(c)"
                />
                <span class="param-unit">d</span>
              </label>
              <label class="param-chip">
                <span class="param-label">Interval</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  v-model.number="draftFor(c._id).intervalDays"
                  @change="saveCompoundDraft(c)"
                />
                <span class="param-unit">d</span>
              </label>
              <VDropdown
                :triggers="['hover', 'focus']"
                :popper-triggers="['hover']"
                :delay="{ show: 200, hide: 100 }"
                placement="bottom-start"
                :distance="6"
              >
                <div class="param-chip shape-chip">
                  <span class="param-label">Profile</span>
                  <select
                    v-model="draftFor(c._id).kineticsShape"
                    @change="saveCompoundDraft(c)"
                  >
                    <option v-for="s in KINETICS_SHAPES" :key="s.value" :value="s.value">{{ s.label }}</option>
                  </select>
                </div>
                <template #popper>
                  <div class="popover profile-pop">
                    <h4 class="profile-pop-title">PK profile</h4>
                    <p class="profile-pop-lede">
                      Half-life sets how fast the dose clears. The profile sets how
                      it gets there — instant peak vs. gradual rise from absorption.
                    </p>
                    <ul class="profile-pop-list">
                      <li v-for="s in KINETICS_SHAPES" :key="s.value">
                        <svg class="profile-spark" viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true">
                          <path :d="profileSparkline(s.value)" fill="none" stroke="currentColor" stroke-width="1.5" />
                        </svg>
                        <div class="profile-pop-name">{{ s.label }}</div>
                        <div class="profile-pop-blurb">{{ s.blurb }}</div>
                      </li>
                    </ul>
                    <p class="profile-pop-hint">
                      Not sure which fits {{ c.name }}? Ask the chat assistant —
                      it has your full compound + dose context.
                    </p>
                  </div>
                </template>
              </VDropdown>
              <div class="param-chip static">
                <span class="param-label">Unit</span>
                <span class="param-static-val">{{ c.doseUnit }}</span>
              </div>
              <label class="param-chip color-chip">
                <span class="param-label">Color</span>
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

            <div v-if="draftFor(c._id) && c.enabled" class="compound-reminder">
              <label class="switch" :title="draftFor(c._id).reminderEnabled ? 'Reminder on' : 'Reminder off'">
                <input
                  type="checkbox"
                  v-model="draftFor(c._id).reminderEnabled"
                  @change="saveCompoundReminder(c)"
                />
                <span class="switch-track"><span class="switch-thumb" /></span>
              </label>
              <span class="reminder-inline-label">Remind on dose days at</span>
              <input
                type="time"
                class="reminder-time"
                v-model="draftFor(c._id).reminderTime"
                :disabled="!draftFor(c._id).reminderEnabled"
                @change="saveCompoundReminder(c)"
              />
            </div>
          </div>
        </li>
      </ul>

      <div class="compound-add">
        <h4>
          Add custom compound
          <UpgradeBadge
            v-if="compoundsAtCap && compoundsUpgradeTier"
            :tier="compoundsUpgradeTier"
            limit-key="customCompounds"
            clickable
          />
        </h4>
        <p
          v-if="compoundsAtCap"
          class="field-hint"
        >
          <template v-if="customCompoundCap === 0">
            Custom compounds aren't included on your plan.
          </template>
          <template v-else>
            You've used {{ customCompoundCount }} of {{ customCompoundCap }} custom compounds on your plan.
          </template>
        </p>
        <div class="compound-add-grid">
          <label class="compound-field">
            <span>Name</span>
            <input type="text" v-model="newCompound.name" placeholder="Compound name" />
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
          <label class="compound-field">
            <span>Shape</span>
            <select v-model="newCompound.kineticsShape">
              <option v-for="s in KINETICS_SHAPES" :key="s.value" :value="s.value">{{ s.label }}</option>
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
  </div>
</template>

<style scoped>
.compounds-page { max-width: 720px; }
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
.page-title { margin: 0; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
}
.lead {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.field-hint {
  margin: 0 0 0.75rem;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.compound-list {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.compound-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-4);
  align-items: start;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  background: var(--bg);
  padding: var(--space-3) var(--space-4);
  transition: border-color var(--transition-fast);
}
.compound-row.disabled { opacity: 0.6; }
.compound-toggle {
  align-self: start;
  margin-top: 2px;
}
.compound-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.compound-lead {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: center;
}
.compound-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.compound-name-row { display: inline-flex; align-items: center; gap: var(--space-1); flex-wrap: wrap; }
.compound-name {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.compound-lock {
  width: 11px;
  height: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.compound-next {
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}
.compound-next.status-overdue { color: var(--danger); font-weight: var(--font-weight-bold); }
.compound-next.status-today { color: var(--warning); font-weight: var(--font-weight-bold); }
.compound-next.status-upcoming { color: var(--text-secondary); }
.compound-next.status-none { color: var(--text-tertiary); font-style: italic; }

.compound-del {
  width: 24px;
  height: 24px;
  background: none;
  border: 1px solid transparent;
  color: var(--text-tertiary);
  font-size: var(--font-size-l);
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.compound-del:hover { color: var(--danger); border-color: var(--danger); }

.compound-params {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border);
  align-items: center;
}
.param-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--font-size-xs);
}
.param-chip:focus-within { border-color: var(--primary); }
.param-label {
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: var(--font-weight-bold);
}
.param-chip input[type="number"] {
  width: 48px;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.param-unit { color: var(--text-tertiary); font-size: var(--font-size-xs); }
.param-static-val {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
}
.color-chip { padding: 2px 6px; }
.color-chip input[type="color"] {
  width: 22px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}
.shape-chip select {
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  cursor: pointer;
}

.profile-pop {
  width: 340px;
  padding: var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--font-size-s);
  line-height: 1.5;
  box-shadow: var(--shadow-m);
}
.profile-pop-title {
  font-family: var(--font-display);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-2);
}
.profile-pop-lede {
  margin: 0 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-s);
}
.profile-pop-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.profile-pop-list li {
  display: grid;
  grid-template-columns: 56px 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--space-3);
  row-gap: 2px;
  align-items: center;
}
.profile-spark {
  grid-row: 1 / span 2;
  width: 56px;
  height: 28px;
  color: var(--primary);
  display: block;
}
.profile-pop-name {
  font-family: var(--font-display);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-s);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.profile-pop-blurb {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.45;
}
.profile-pop-hint {
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.5;
}

.compound-status { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-left: auto; }
.compound-status.ok { color: var(--success); }

.compound-reminder {
  margin-top: 0.5rem;
  border-top: 1px dashed var(--border);
  padding-top: 0.6rem;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.reminder-inline-label {
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.reminder-time {
  padding: 0.3rem 0.45rem;
  font-size: var(--font-size-s);
}
.reminder-time:disabled { opacity: 0.5; }

/* Toggle switch */
.switch {
  position: relative;
  display: inline-flex;
  width: 36px;
  height: 20px;
  flex: none;
  cursor: pointer;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}
.switch-track {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: var(--radius-pill);
  transition: background var(--transition-fast);
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--surface);
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.switch input:checked + .switch-track { background: var(--primary); }
.switch input:checked + .switch-track .switch-thumb { transform: translateX(16px); }

.compound-add {
  border-top: 1px dashed var(--border);
  padding-top: var(--space-3);
  margin-top: var(--space-2);
}
.compound-add h4 {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-2);
}
.compound-add-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  align-items: flex-end;
  margin-bottom: var(--space-2);
}
.compound-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.compound-field > span {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: var(--font-weight-bold);
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

.error { color: var(--danger); font-size: var(--font-size-s); margin-bottom: 0.5rem; }
</style>
