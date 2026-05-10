// Pure reducer for the rolling-7 calorie budget. Energy-mode-aware
// and gap-aware — see docs/exercise-energy-modes.md and
// docs/tracked-untracked-days.md for the full contract.
//
// The Vue composable in client/src/composables/useWeeklyBudget.js
// wraps this with onMounted fetches + reactive watches. The agent and
// any server-side reasoning consume the reducer directly.

import { effectiveDailyCalTarget } from './exerciseEnergy.js';

// Build the per-day disposition + target + intake snapshot for a
// rolling window. All inputs are pure data:
//
//   windowDates          string[] (YYYY-MM-DD, inclusive, sorted)
//   nutritionByDay       Map<YYYY-MM-DD, { calories, protein, fat, carbs }>
//   burnByDay            Map<YYYY-MM-DD, { caloriesBurned, durationMin }>
//   dayStatusByDate      Map<YYYY-MM-DD, { status, reason } | undefined>
//   dailyTarget          number (base calorie target before energy-mode bump)
//   energyMode           'baseline' | 'earn' (legacy 'hidden' → 'baseline')
//   confirmationMode     'passive' | 'affirmative' (controls auto-detection)
//   today                YYYY-MM-DD (so the function is testable / agent-safe)
export function buildPerDay({
  windowDates,
  nutritionByDay,
  burnByDay,
  dayStatusByDate,
  dailyTarget,
  energyMode,
  confirmationMode = 'passive',
  today,
}) {
  return windowDates.map((date) => {
    const n = nutritionByDay.get(date) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    const burn = burnByDay.get(date) || { caloriesBurned: 0, durationMin: 0 };
    const disp = dispositionFor({
      date,
      today,
      explicit: dayStatusByDate.get(date),
      nutrition: n,
      confirmationMode,
    });
    const isCounted = disp.status === 'tracked' || disp.status === 'tracked-pending';
    const eff = effectiveDailyCalTarget({
      baseTarget: dailyTarget,
      burnedKcal: isCounted ? (burn.caloriesBurned || 0) : 0,
      energyMode,
    });
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
      effectiveDailyTarget: eff,
    };
  });
}

// Resolve effective disposition for a date. Today is special-cased to
// never auto-untrack regardless of confirmation mode — it's
// in-progress data, not gap data. Mirrors useWeeklyBudget's prior
// inline logic.
export function dispositionFor({ date, today, explicit, nutrition, confirmationMode }) {
  const hasFood = !!nutrition && (nutrition.calories || 0) > 0;

  if (date === today) {
    if (explicit?.status === 'untracked') {
      return { status: 'untracked', reason: explicit.reason || 'other', source: 'explicit' };
    }
    return {
      status: 'tracked-pending',
      reason: explicit?.reason || null,
      source: explicit ? 'explicit' : 'auto',
    };
  }

  if (explicit) {
    return { status: explicit.status, reason: explicit.reason, source: 'explicit' };
  }

  if (confirmationMode === 'affirmative') {
    // Affirmative mode: past days require an explicit `tracked` row to
    // count. Without one we treat them as gaps so the rolling window
    // doesn't credit days the user never confirmed.
    return { status: 'untracked', reason: 'forgot', source: 'auto' };
  }

  // Passive mode: any past day with food logged counts as tracked.
  return {
    status: hasFood ? 'tracked' : 'untracked',
    reason: hasFood ? null : 'forgot',
    source: 'auto',
  };
}

// Sum a perDay array into the rolling budget totals consumers actually
// render. delta > 0 means budget remaining; delta < 0 means over.
export function summarizeBudget(perDay, targets) {
  const counted = perDay.filter((d) => d.isCounted);
  let calTarget = 0, calConsumed = 0, burned = 0;
  let protein = 0, fat = 0, carbs = 0;
  let proteinT = 0, fatT = 0, carbsT = 0;
  for (const d of counted) {
    calTarget += d.effectiveDailyTarget;
    calConsumed += d.calories;
    burned += d.burned;
    protein += d.protein;
    fat += d.fat;
    carbs += d.carbs;
    proteinT += targets?.proteinGrams || 0;
    fatT += targets?.fatGrams || 0;
    carbsT += targets?.carbsGrams || 0;
  }
  return {
    countedDays: counted.length,
    weekTarget: { calories: calTarget, protein: proteinT, fat: fatT, carbs: carbsT },
    consumed: { calories: calConsumed, protein, fat, carbs, burned },
    delta: { calories: calTarget - calConsumed },
  };
}
