// Asymmetric adherence score (0-100) for a day's nutrition. Calories
// and carbs penalize on either side of target (under or over);
// protein only penalizes when under-target (eating extra protein
// isn't a problem); fat only penalizes when over-target (under-target
// fat is fine). Weights bias toward calories + protein since those
// are the two macros users most often anchor their day on.
//
// Returns null when both actual and targets are absent so a blank
// profile doesn't display as "0/100".

const WEIGHTS = { calories: 0.4, protein: 0.3, fat: 0.2, carbs: 0.1 };

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * @param {{ calories: number, protein: number, fat: number, carbs: number }} actual
 * @param {{ calories?: number, proteinGrams?: number, fatGrams?: number, carbsGrams?: number }} targets
 * @returns {number|null}
 */
export function computeNutritionScore(actual, targets) {
  if (!actual || !targets) return null;

  const calRatio = targets.calories ? actual.calories / targets.calories : 0;
  const proRatio = targets.proteinGrams ? actual.protein / targets.proteinGrams : 0;
  const fatRatio = targets.fatGrams ? actual.fat / targets.fatGrams : 0;
  const carbRatio = targets.carbsGrams ? actual.carbs / targets.carbsGrams : 0;

  const penalties = {
    calories: clamp01(Math.abs(1 - calRatio)),
    protein: clamp01(Math.max(0, 1 - proRatio)),
    fat: clamp01(Math.max(0, fatRatio - 1)),
    carbs: clamp01(Math.abs(1 - carbRatio)),
  };

  const deduction =
    penalties.calories * WEIGHTS.calories +
    penalties.protein * WEIGHTS.protein +
    penalties.fat * WEIGHTS.fat +
    penalties.carbs * WEIGHTS.carbs;

  return Math.round(100 * (1 - deduction));
}
