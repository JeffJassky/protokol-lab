<script setup>
// Quick-log popover anchored to the Log nav button. Tap on Log:
//   1. navigates to /log?date=today (so picking an action lands on the page
//      the modals + scroll targets live on)
//   2. opens this popover with the quick-log items.
// Items deep-link back to /log with action/focus query params that LogPage
// inspects on mount to open the right modal or scroll to the right section.
//
// Submenus (Food / Dosage / Measurement) are rendered inline by swapping the
// popover view — nested popovers misbehave on mobile and clutter the surface.
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCompoundsStore } from '../stores/compounds.js';
import { useMetricsStore } from '../stores/metrics.js';
import { useSettingsStore } from '../stores/settings.js';
import { localYmd } from '../utils/date.js';

const router = useRouter();
const route = useRoute();
const compoundsStore = useCompoundsStore();
const metricsStore = useMetricsStore();
const settingsStore = useSettingsStore();

const open = ref(false);
const view = ref('root'); // 'root' | 'food' | 'compounds' | 'metrics'
let fetched = false;

const enabledCompounds = computed(() => compoundsStore.enabled);
const enabledMetrics = computed(() =>
  metricsStore.metrics
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order),
);
const exerciseEnabled = computed(() => {
  const ex = settingsStore.settings?.exercise;
  return Boolean(ex?.enabled) && ex?.showOnLog !== false;
});
const journalEnabled = computed(
  () => settingsStore.settings?.journal?.enabled !== false,
);
const waterEnabled = computed(
  () => Boolean(settingsStore.settings?.water?.enabled),
);
const photosEnabled = computed(() => {
  const p = settingsStore.settings?.photos;
  return Boolean(p?.enabled) && p?.showOnLog !== false;
});

function compoundKey(c) {
  if (!c) return null;
  return c.source === 'core' ? `core:${c.coreInterventionKey}` : c._id;
}

const isLogActive = computed(() => route.path === '/log');

async function ensureLoaded() {
  if (fetched) return;
  fetched = true;
  await Promise.all([
    compoundsStore.fetchAll().catch(() => {}),
    metricsStore.fetchMetrics().catch(() => {}),
    settingsStore.loaded
      ? Promise.resolve()
      : settingsStore.fetchSettings().catch(() => {}),
  ]);
}

function today() {
  return localYmd();
}

function close() {
  open.value = false;
  view.value = 'root';
}

async function onLogClick() {
  // Always navigate to /log (per user spec) AND show the flyout.
  view.value = 'root';
  await ensureLoaded();
  if (route.path !== '/log') {
    router.push({ path: '/log', query: { date: today() } });
  }
  open.value = true;
}

function pickFood(meal) {
  close();
  router.push({
    path: '/food/search',
    query: { meal, date: today() },
  });
}
function pickExercise() {
  close();
  router.push({
    path: '/log',
    query: { date: today(), action: 'add-exercise' },
  });
}
function pickDose(compound) {
  close();
  router.push({
    path: '/log',
    query: {
      date: today(),
      action: 'add-dose',
      compoundKey: compoundKey(compound),
    },
  });
}
function pickDosage() {
  if (enabledCompounds.value.length === 1) {
    pickDose(enabledCompounds.value[0]);
  } else {
    view.value = 'compounds';
  }
}
function pickMetric(metric) {
  close();
  router.push({
    path: '/log',
    query: { date: today(), action: 'add-metric', metricId: metric._id },
  });
}
function pickMeasurement() {
  if (enabledMetrics.value.length === 1) {
    pickMetric(enabledMetrics.value[0]);
  } else {
    view.value = 'metrics';
  }
}
// Hash-based jumps for in-page sections — the router's scrollBehavior
// already resolves `to.hash` to the section element on both window
// (mobile) and main.content (desktop), so we don't have to scroll
// manually. LogPage watches route.hash to focus the relevant input.
function pickSymptoms() {
  close();
  router.push({ path: '/log', query: { date: today() }, hash: '#symptoms' });
}
function pickJournal() {
  close();
  router.push({ path: '/log', query: { date: today() }, hash: '#notes' });
}
function pickHydration() {
  close();
  router.push({ path: '/log', query: { date: today() }, hash: '#water' });
}
function pickPhotos() {
  close();
  router.push({ path: '/log', query: { date: today() }, hash: '#photos' });
}

// Single-item labels surface the actual compound/metric name instead of
// the generic category — the user knows exactly what tapping does.
const dosageLabel = computed(() =>
  enabledCompounds.value.length === 1
    ? enabledCompounds.value[0].name
    : 'Dosage',
);
const measurementLabel = computed(() =>
  enabledMetrics.value.length === 1
    ? enabledMetrics.value[0].name
    : 'Measurement',
);
</script>

<template>
  <VDropdown
    :shown="open"
    :triggers="[]"
    :auto-hide="true"
    placement="top"
    :distance="8"
    popper-class="quick-log-popper-wrap"
    @apply-hide="close"
  >
    <button
      type="button"
      class="nav-link nav-link-log"
      :class="{ 'is-active': isLogActive }"
      @click="onLogClick"
    >
      <svg
        class="nav-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="m15 5 4 4" />
      </svg>
      <span class="nav-label">Log</span>
    </button>
    <template #popper>
      <div class="quick-log-popper" @click.stop>
        <template v-if="view === 'root'">
          <button class="ql-item" type="button" @click="view = 'food'">
            <span class="ql-label">Food</span>
            <span class="ql-arrow" aria-hidden="true">›</span>
          </button>
          <button
            v-if="waterEnabled"
            class="ql-item"
            type="button"
            @click="pickHydration"
          >
            <span class="ql-label">Hydration</span>
          </button>
          <button
            v-if="exerciseEnabled"
            class="ql-item"
            type="button"
            @click="pickExercise"
          >
            <span class="ql-label">Exercise</span>
          </button>
          <button
            v-if="enabledCompounds.length"
            class="ql-item"
            type="button"
            @click="pickDosage"
          >
            <span class="ql-label">{{ dosageLabel }}</span>
            <span
              v-if="enabledCompounds.length > 1"
              class="ql-arrow"
              aria-hidden="true"
              >›</span
            >
          </button>
          <button class="ql-item" type="button" @click="pickSymptoms">
            <span class="ql-label">Symptoms</span>
          </button>
          <button
            v-if="enabledMetrics.length"
            class="ql-item"
            type="button"
            @click="pickMeasurement"
          >
            <span class="ql-label">{{ measurementLabel }}</span>
            <span
              v-if="enabledMetrics.length > 1"
              class="ql-arrow"
              aria-hidden="true"
              >›</span
            >
          </button>
          <button
            v-if="journalEnabled"
            class="ql-item"
            type="button"
            @click="pickJournal"
          >
            <span class="ql-label">Journal</span>
          </button>
          <button
            v-if="photosEnabled"
            class="ql-item"
            type="button"
            @click="pickPhotos"
          >
            <span class="ql-label">Photos</span>
          </button>
        </template>

        <template v-else-if="view === 'food'">
          <button class="ql-back" type="button" @click="view = 'root'">
            ‹ Back
          </button>
          <button class="ql-item" type="button" @click="pickFood('breakfast')">
            <span class="ql-label">Breakfast</span>
          </button>
          <button class="ql-item" type="button" @click="pickFood('lunch')">
            <span class="ql-label">Lunch</span>
          </button>
          <button class="ql-item" type="button" @click="pickFood('dinner')">
            <span class="ql-label">Dinner</span>
          </button>
          <button class="ql-item" type="button" @click="pickFood('snack')">
            <span class="ql-label">Snack</span>
          </button>
        </template>

        <template v-else-if="view === 'compounds'">
          <button class="ql-back" type="button" @click="view = 'root'">
            ‹ Back
          </button>
          <button
            v-for="c in enabledCompounds"
            :key="compoundKey(c)"
            class="ql-item"
            type="button"
            @click="pickDose(c)"
          >
            <span class="ql-label">{{ c.name }}</span>
          </button>
        </template>

        <template v-else-if="view === 'metrics'">
          <button class="ql-back" type="button" @click="view = 'root'">
            ‹ Back
          </button>
          <button
            v-for="m in enabledMetrics"
            :key="m._id"
            class="ql-item"
            type="button"
            @click="pickMetric(m)"
          >
            <span class="ql-label">{{ m.name }}</span>
          </button>
        </template>
      </div>
    </template>
  </VDropdown>
</template>

<style scoped>
.nav-link-log {
  background: transparent;
  border: none;
  cursor: pointer;
  font: inherit;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--font-size-s);
  padding: var(--space-1) var(--space-3);
  transition: background var(--transition-base), color var(--transition-base);
}
.nav-link-log:hover {
  background: var(--bg);
  color: var(--text);
}
.nav-link-log.is-active {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: var(--font-weight-medium);
}
/* Desktop hides stacked icon (matches sibling nav-link rule). */
.nav-link-log .nav-icon {
  display: none;
}

@media (max-width: 768px) {
  .nav-link-log {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    border-radius: 0;
    font-size: 10px;
    letter-spacing: 0.03em;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .nav-link-log .nav-icon {
    display: block;
    width: 22px;
    height: 22px;
  }
  .nav-link-log .nav-label {
    display: block;
    line-height: 1;
  }
  .nav-link-log.is-active {
    background: var(--surface);
    color: var(--primary);
    box-shadow: inset 0 2px 0 var(--primary);
  }
}
</style>

<style>
/* Popper content is teleported outside .top-nav, so scoped styles can't
   reach it. Prefix with .quick-log-popper to scope these globals. */

/* FloatingVue paints its own background + border + padding + 6px radius
   on .v-popper__inner; flatten all of it under our custom popper-class
   so .quick-log-popper drives the look (square corners, theme bg). */
.quick-log-popper-wrap .v-popper__inner,
.quick-log-popper-wrap .v-popper__wrapper {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  border-radius: 0;
}
.quick-log-popper-wrap .v-popper__arrow-container {
  display: none;
}

.quick-log-popper {
  min-width: 200px;
  padding: var(--space-1);
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--bg);
  box-shadow: var(--shadow-m);
  color: var(--text);
}
/* Mobile bottom-nav: popover sits above the Log button. Reversing the
   stack puts the first item closest to the trigger (thumb) and pushes
   later items higher up — matches iOS / Android quick-action menus. */
@media (max-width: 768px) {
  .quick-log-popper {
    flex-direction: column-reverse;
  }
}
.quick-log-popper .ql-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: none;
  color: var(--text);
  font: inherit;
  font-size: var(--font-size-s);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-base), color var(--transition-base);
}
.quick-log-popper .ql-item:hover,
.quick-log-popper .ql-item:focus-visible {
  background: var(--primary-soft);
  color: var(--primary);
  outline: none;
}
.quick-log-popper .ql-item:active {
  background: var(--primary-soft-strong);
}
.quick-log-popper .ql-label {
  flex: 1;
}
.quick-log-popper .ql-arrow {
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1;
}
/* Back button: same hit target as a menu item so the row feels
   consistent, but transparent ground so it reads as secondary nav
   instead of a selectable action. */
.quick-log-popper .ql-back {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--font-size-s);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-base), color var(--transition-base);
}
.quick-log-popper .ql-back:hover,
.quick-log-popper .ql-back:focus-visible {
  color: var(--text);
  background: var(--surface);
  outline: none;
}
</style>
