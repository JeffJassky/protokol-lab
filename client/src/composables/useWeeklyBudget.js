import { computed, onMounted, watch } from 'vue';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useSettingsStore } from '../stores/settings.js';
import { useDayStatusStore } from '../stores/dayStatus.js';
import { useExerciseLogStore } from '../stores/exerciselog.js';

// Rolling 7-day budget. Gap-aware (skips untracked days from both
// numerator and denominator) and energy-mode-aware (in `earn` mode
// each day's target bumps by that day's burn). See
// docs/tracked-untracked-days.md and docs/exercise-energy-modes.md
// for the full math contract.
//
// Frame:
//   counted   = days where effective disposition is tracked / pending
//   N         = counted.length
//   weekTarget = sum effectiveDailyTarget(d) over counted
//   consumed   = sum consumed(d)             over counted
//   delta      = weekTarget - consumed       (+ = room, − = over)
//   adjustedToday = weekTarget - sum consumed over past6Counted
export function useWeeklyBudget() {
  const foodlogStore = useFoodLogStore();
  const settingsStore = useSettingsStore();
  const dayStatusStore = useDayStatusStore();
  const exerciseLogStore = useExerciseLogStore();

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function shiftDate(iso, deltaDays) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  async function refresh() {
    const to = todayStr();
    const from = shiftDate(to, -6);
    await Promise.all([
      foodlogStore.fetchDailyNutrition(from, to),
      dayStatusStore.fetchRange(from, to),
      exerciseLogStore.fetchRangeBurn(from, to),
    ]);
  }

  onMounted(refresh);

  // Refetch when any day's entries mutate. fetchDailyNutrition doesn't
  // touch `entries`, so there's no re-entry loop.
  watch(() => foodlogStore.entries, refresh, { deep: true });

  const targets = computed(() => settingsStore.settings?.targets || null);
  const dailyTarget = computed(() => targets.value?.calories || 0);

  const exerciseSettings = computed(() => settingsStore.settings?.exercise || {});
  const energyMode = computed(() => exerciseSettings.value.energyMode || 'baseline');
  const trackingSettings = computed(() => settingsStore.settings?.tracking || {});
  const confirmationMode = computed(() => trackingSettings.value.confirmationMode || 'passive');

  const windowDates = computed(() => {
    const to = todayStr();
    const arr = [];
    for (let i = 6; i >= 0; i--) arr.push(shiftDate(to, -i));
    return arr;
  });

  const nutritionByDay = computed(() => {
    const m = new Map();
    for (const d of foodlogStore.dailyNutrition || []) m.set(d.date, d);
    return m;
  });

  const burnByDay = computed(() => {
    const m = new Map();
    for (const d of exerciseLogStore.dailyBurn || []) m.set(d.date, d);
    return m;
  });

  // Resolve the effective disposition for each day. Today is special-
  // cased to never auto-untrack (regardless of mode) since it's
  // in-progress data, not gap data.
  function dispositionFor(date) {
    const today = todayStr();
    const explicit = dayStatusStore.getStatus(date);
    const nutrition = nutritionByDay.value.get(date);
    const hasFood = !!nutrition && nutrition.calories > 0;

    if (date === today) {
      if (explicit?.status === 'untracked') {
        return { status: 'untracked', reason: explicit.reason || 'other', source: 'explicit' };
      }
      return { status: 'tracked-pending', reason: explicit?.reason || null, source: explicit ? 'explicit' : 'auto' };
    }

    if (explicit) {
      return { status: explicit.status, reason: explicit.reason, source: 'explicit' };
    }

    if (confirmationMode.value === 'affirmative') {
      // Past days require an explicit `tracked` row to count.
      return { status: 'untracked', reason: 'forgot', source: 'auto' };
    }

    // Passive mode: any food logged → tracked; zero entries → untracked.
    return {
      status: hasFood ? 'tracked' : 'untracked',
      reason: hasFood ? null : 'forgot',
      source: 'auto',
    };
  }

  const perDay = computed(() => {
    const today = todayStr();
    return windowDates.value.map((date) => {
      const n = nutritionByDay.value.get(date) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
      const burn = burnByDay.value.get(date) || { caloriesBurned: 0, durationMin: 0 };
      const disp = dispositionFor(date);
      const isCounted = disp.status === 'tracked' || disp.status === 'tracked-pending';
      const dailyT = dailyTarget.value;
      // Per-day target: in `earn` mode, today's burn extends today's
      // target. Other modes leave it flat.
      const effectiveDailyTarget = energyMode.value === 'earn'
        ? dailyT + (isCounted ? (burn.caloriesBurned || 0) : 0)
        : dailyT;
      return {
        date,
        isToday: date === today,
        calories: n.calories || 0,
        protein: n.protein || 0,
        fat: n.fat || 0,
        carbs: n.carbs || 0,
        burned: burn.caloriesBurned || 0,
        burnedDurationMin: burn.durationMin || 0,
        disposition: disp.status,
        reason: disp.reason,
        dispositionSource: disp.source,
        isCounted,
        effectiveDailyTarget,
      };
    });
  });

  const counted = computed(() => perDay.value.filter((d) => d.isCounted));

  const countedDays = computed(() => counted.value.length);

  const weekTarget = computed(() => {
    const t = targets.value;
    if (!t) return null;
    // Each counted day contributes its own target (which itself can be
    // mode-adjusted). Macros aren't burn-shifted — only calories.
    let calories = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;
    for (const d of counted.value) {
      calories += d.effectiveDailyTarget;
      protein += t.proteinGrams || 0;
      fat += t.fatGrams || 0;
      carbs += t.carbsGrams || 0;
    }
    return { calories, protein, fat, carbs };
  });

  const consumed = computed(() => {
    const acc = { calories: 0, protein: 0, fat: 0, carbs: 0, burned: 0 };
    for (const d of counted.value) {
      acc.calories += d.calories;
      acc.protein += d.protein;
      acc.fat += d.fat;
      acc.carbs += d.carbs;
      acc.burned += d.burned;
    }
    return acc;
  });

  const past6Counted = computed(() => counted.value.filter((d) => !d.isToday));

  const past6 = computed(() => {
    const acc = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const d of past6Counted.value) {
      acc.calories += d.calories;
      acc.protein += d.protein;
      acc.fat += d.fat;
      acc.carbs += d.carbs;
    }
    return acc;
  });

  const delta = computed(() => {
    const w = weekTarget.value;
    if (!w) return null;
    const c = consumed.value;
    return {
      calories: w.calories - c.calories,
      protein: w.protein - c.protein,
      fat: w.fat - c.fat,
      carbs: w.carbs - c.carbs,
    };
  });

  const adjustedToday = computed(() => {
    const w = weekTarget.value;
    if (!w) return null;
    const p = past6.value;
    return {
      calories: w.calories - p.calories,
      protein: w.protein - p.protein,
      fat: w.fat - p.fat,
      carbs: w.carbs - p.carbs,
    };
  });

  // Dynamic framing — "weekly" only feels honest when most days are
  // counted; below that threshold relabel to N-day so the user reads
  // the math correctly.
  const windowLabel = computed(() => {
    const n = countedDays.value;
    if (n === 0) return null;
    if (n < 5) return `${n}-day rolling budget`;
    return '7-day budget';
  });

  return {
    targets,
    dailyTarget,
    weekTarget,
    perDay,
    counted,
    countedDays,
    consumed,
    delta,
    adjustedToday,
    energyMode,
    confirmationMode,
    windowLabel,
    refresh,
  };
}
