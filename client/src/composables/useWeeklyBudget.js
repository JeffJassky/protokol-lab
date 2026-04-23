import { computed, onMounted, watch } from 'vue';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useSettingsStore } from '../stores/settings.js';

// Rolling 7-day budget ending on "today". Math is intentionally unclamped —
// adjustedToday can go negative when past overage exceeds the week target.
//
// Frame:
//   past6      = sum of the 6 days before today (already locked in)
//   today      = what's been logged today so far
//   consumed   = past6 + today
//   weekTarget = daily * 7
//   delta          = weekTarget - consumed        (+ = room, − = over)
//   adjustedToday  = weekTarget - past6           (what today *should* be to
//                                                  land exactly on weekly)
export function useWeeklyBudget() {
  const foodlogStore = useFoodLogStore();
  const settingsStore = useSettingsStore();

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
    await foodlogStore.fetchDailyNutrition(from, to);
  }

  onMounted(refresh);

  // Refetch when any day's entries mutate. fetchDailyNutrition doesn't touch
  // `entries`, so there's no re-entry loop.
  watch(() => foodlogStore.entries, refresh, { deep: true });

  const targets = computed(() => settingsStore.settings?.targets || null);

  const weekTarget = computed(() => {
    const t = targets.value;
    if (!t) return null;
    return {
      calories: t.calories * 7,
      protein: t.proteinGrams * 7,
      fat: t.fatGrams * 7,
      carbs: t.carbsGrams * 7,
    };
  });

  const windowDates = computed(() => {
    const to = todayStr();
    const arr = [];
    for (let i = 6; i >= 0; i--) arr.push(shiftDate(to, -i));
    return arr;
  });

  const byDay = computed(() => {
    const m = new Map();
    for (const d of foodlogStore.dailyNutrition || []) m.set(d.date, d);
    return m;
  });

  const perDay = computed(() => {
    const today = todayStr();
    return windowDates.value.map((date) => {
      const n = byDay.value.get(date) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
      return {
        date,
        isToday: date === today,
        calories: n.calories || 0,
        protein: n.protein || 0,
        fat: n.fat || 0,
        carbs: n.carbs || 0,
      };
    });
  });

  const past6 = computed(() => {
    const acc = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const d of perDay.value.slice(0, 6)) {
      acc.calories += d.calories;
      acc.protein += d.protein;
      acc.fat += d.fat;
      acc.carbs += d.carbs;
    }
    return acc;
  });

  const today = computed(() => perDay.value[6] || { calories: 0, protein: 0, fat: 0, carbs: 0 });

  const consumed = computed(() => {
    const a = past6.value;
    const t = today.value;
    return {
      calories: a.calories + t.calories,
      protein: a.protein + t.protein,
      fat: a.fat + t.fat,
      carbs: a.carbs + t.carbs,
    };
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

  return {
    targets,
    weekTarget,
    perDay,
    consumed,
    delta,
    adjustedToday,
    refresh,
  };
}
