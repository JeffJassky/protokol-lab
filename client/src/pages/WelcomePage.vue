<script setup>
import { computed, markRaw, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useSettingsStore } from '../stores/settings.js';
import { usePwa } from '../composables/usePwa.js';
import { bmrMifflin } from '../../../shared/bodyMath.js';

import StepBasics from '../components/welcome/StepBasics.vue';
import StepActivity from '../components/welcome/StepActivity.vue';
import StepGoal from '../components/welcome/StepGoal.vue';
import StepTargets from '../components/welcome/StepTargets.vue';
import StepCompounds from '../components/welcome/StepCompounds.vue';
import StepInstall from '../components/welcome/StepInstall.vue';
import StepNotifications from '../components/welcome/StepNotifications.vue';

const auth = useAuthStore();
const settings = useSettingsStore();
const pwa = usePwa();
const router = useRouter();

// Step config — order matches ONBOARDING_STEPS minus the trailing 'done'.
// `skippable` shows the Skip button on that step. `fields` is the patch sent
// to /api/settings on Next.
const STEPS = [
  {
    id: 'basics',
    title: 'About you',
    component: markRaw(StepBasics),
    skippable: false,
    fields: () => ({
      sex: draft.sex,
      age: draft.age,
      heightInches: draft.heightInches,
      currentWeightLbs: draft.currentWeightLbs,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  },
  {
    id: 'activity',
    title: 'Activity',
    component: markRaw(StepActivity),
    skippable: false,
    fields: () => ({
      activityLevel: draft.activityLevel,
      bmr: draft.bmr,
      tdee: draft.tdee,
    }),
  },
  {
    id: 'goal',
    title: 'Goal',
    component: markRaw(StepGoal),
    skippable: false,
    fields: () => ({
      goalWeightLbs: draft.goalWeightLbs,
      goalRateLbsPerWeek: draft.goalRateLbsPerWeek,
    }),
  },
  {
    id: 'targets',
    title: 'Targets',
    component: markRaw(StepTargets),
    skippable: false,
    fields: () => ({
      targets: {
        calories: draft.targets?.calories,
        proteinGrams: draft.targets?.proteinGrams,
        fatGrams: draft.targets?.fatGrams,
        carbsGrams: draft.targets?.carbsGrams,
      },
    }),
  },
  {
    id: 'compounds',
    title: 'Compounds',
    component: markRaw(StepCompounds),
    skippable: true,
    // Compound toggles are saved by the step itself via the compounds store.
    fields: () => ({}),
  },
  {
    id: 'install',
    title: 'Install',
    component: markRaw(StepInstall),
    skippable: true,
    fields: () => ({}),
  },
  {
    id: 'notifications',
    title: 'Notifications',
    component: markRaw(StepNotifications),
    skippable: true,
    fields: () => ({}),
  },
];

// On iOS, hide the notifications step until install is done — pre-install
// permission grants are wasted (iOS won't deliver) and a denial here sticks.
const visibleSteps = computed(() => {
  if (pwa.platform.value === 'ios' && !pwa.installed.value) {
    return STEPS.filter((s) => s.id !== 'notifications');
  }
  return STEPS;
});

const stepIndex = ref(0);
const currentStep = computed(() => visibleSteps.value[stepIndex.value]);
const isLast = computed(() => stepIndex.value === visibleSteps.value.length - 1);

const draft = reactive({
  sex: null,
  age: null,
  heightInches: null,
  currentWeightLbs: null,
  goalWeightLbs: null,
  bmr: null,
  tdee: null,
  activityLevel: null,
  goalRateLbsPerWeek: null,
  targets: null,
});

const stepValid = ref(false);
const saving = ref(false);
const error = ref('');

onMounted(async () => {
  // Load any partial settings from a prior session so the wizard resumes.
  await settings.fetchSettings();
  if (settings.settings) {
    Object.assign(draft, {
      sex: settings.settings.sex || null,
      age: settings.settings.age || null,
      heightInches: settings.settings.heightInches || null,
      currentWeightLbs: settings.settings.currentWeightLbs || null,
      goalWeightLbs: settings.settings.goalWeightLbs || null,
      bmr: settings.settings.bmr || null,
      tdee: settings.settings.tdee || null,
      activityLevel: settings.settings.activityLevel || null,
      goalRateLbsPerWeek:
        settings.settings.goalRateLbsPerWeek != null
          ? settings.settings.goalRateLbsPerWeek
          : null,
      targets: settings.settings.targets ? { ...settings.settings.targets } : null,
    });
  }

  // Resume on the user's last-touched step if it's still in the visible list.
  const resumeAt = visibleSteps.value.findIndex((s) => s.id === auth.user?.onboardingStep);
  if (resumeAt > 0) stepIndex.value = resumeAt;
});

// Recompute auto-derived fields any time their inputs change. Keeps draft.bmr
// fresh so the activity step's preview + downstream targets always agree.
watch(
  () => [draft.sex, draft.age, draft.heightInches, draft.currentWeightLbs],
  () => {
    const v = bmrMifflin({
      sex: draft.sex,
      age: draft.age,
      heightInches: draft.heightInches,
      weightLbs: draft.currentWeightLbs,
    });
    if (v) draft.bmr = v;
  },
);

async function persistStep() {
  const fields = currentStep.value.fields();
  if (Object.keys(fields).length) {
    await settings.patchSettings(fields);
  }
  // Pointer for resume — set to the *next* step's id.
  const nextStep = visibleSteps.value[stepIndex.value + 1];
  if (nextStep) {
    await auth.setOnboardingStep(nextStep.id);
  }
}

async function next() {
  if (!stepValid.value && !currentStep.value.skippable) return;
  saving.value = true;
  error.value = '';
  try {
    await persistStep();
    if (isLast.value) {
      await auth.completeOnboarding();
      router.push('/log');
      return;
    }
    stepIndex.value += 1;
  } catch (err) {
    error.value = err.message || 'Could not save. Try again.';
  } finally {
    saving.value = false;
  }
}

async function skip() {
  if (!currentStep.value.skippable) return;
  saving.value = true;
  error.value = '';
  try {
    if (isLast.value) {
      await auth.completeOnboarding();
      router.push('/log');
      return;
    }
    const nextStep = visibleSteps.value[stepIndex.value + 1];
    if (nextStep) await auth.setOnboardingStep(nextStep.id);
    stepIndex.value += 1;
  } catch (err) {
    error.value = err.message || 'Could not advance. Try again.';
  } finally {
    saving.value = false;
  }
}

function back() {
  if (stepIndex.value > 0) stepIndex.value -= 1;
}

// Reset validity when changing steps — the new step will emit its own state
// on mount via update:valid.
watch(stepIndex, () => { stepValid.value = false; });
</script>

<template>
  <div class="welcome">
    <header class="head">
      <span class="brand">Protokol Lab</span>
    </header>

    <div class="dots" role="progressbar" :aria-valuenow="stepIndex + 1" :aria-valuemax="visibleSteps.length">
      <span
        v-for="(s, i) in visibleSteps"
        :key="s.id"
        class="dot"
        :class="{ done: i < stepIndex, active: i === stepIndex }"
        :title="s.title"
      />
    </div>

    <main class="panel">
      <component
        :is="currentStep.component"
        :draft="draft"
        @update:valid="stepValid = $event"
      />

      <p v-if="error" class="error">{{ error }}</p>
    </main>

    <footer class="actions">
      <button
        type="button"
        class="btn-secondary"
        :disabled="stepIndex === 0 || saving"
        @click="back"
      >
        Back
      </button>

      <span class="spacer" />

      <button
        v-if="currentStep.skippable"
        type="button"
        class="btn-text"
        :disabled="saving"
        @click="skip"
      >
        Skip
      </button>

      <button
        type="button"
        class="btn-primary"
        :disabled="(!stepValid && !currentStep.skippable) || saving"
        @click="next"
      >
        <template v-if="saving">Saving…</template>
        <template v-else-if="isLast">Finish</template>
        <template v-else>Next</template>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.welcome {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  padding: var(--space-3);
  max-width: 540px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.head {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-2) 0 var(--space-4);
}
.brand {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-m);
  letter-spacing: var(--tracking-tight);
  color: var(--text);
}

.dots {
  display: flex;
  gap: 6px;
  margin-bottom: var(--space-4);
  justify-content: center;
}
.dot {
  width: 24px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--border);
  transition: background var(--transition-fast);
}
.dot.done { background: var(--primary); }
.dot.active { background: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft, transparent); }

.panel { flex: 1; }

.error {
  margin: var(--space-3) 0 0;
  font-size: var(--font-size-s);
  color: var(--danger, var(--text-secondary));
}

.actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-3) 0 var(--space-2);
  border-top: 1px solid var(--border);
  margin-top: var(--space-4);
}
.spacer { flex: 1; }
.btn-text {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-s);
  padding: var(--space-2);
}
.btn-text:hover:not(:disabled) { color: var(--text); }
.btn-text:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
