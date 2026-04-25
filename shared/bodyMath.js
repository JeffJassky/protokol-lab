// Pure body-composition + targets math. Used by the onboarding wizard, the
// settings page, and (future) the dashboard "what would happen if…" preview.
// No imports — safe for both client and server.

export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary',       blurb: 'Desk job, little exercise',                multiplier: 1.2 },
  { value: 'light',     label: 'Lightly active',  blurb: 'Light exercise 1–3 days/week',             multiplier: 1.375 },
  { value: 'moderate',  label: 'Moderately active', blurb: 'Moderate exercise 3–5 days/week',         multiplier: 1.55 },
  { value: 'very',      label: 'Very active',     blurb: 'Hard exercise 6–7 days/week',              multiplier: 1.725 },
  { value: 'athlete',   label: 'Athlete',         blurb: 'Twice-a-day training or physical job',     multiplier: 1.9 },
];

export const GOAL_RATES = [
  { value: -2,   label: 'Lose 2 lb / week',   note: 'Aggressive — best with GLP-1 support' },
  { value: -1.5, label: 'Lose 1.5 lb / week', note: 'Aggressive' },
  { value: -1,   label: 'Lose 1 lb / week',   note: 'Steady cut' },
  { value: -0.5, label: 'Lose 0.5 lb / week', note: 'Slow + sustainable' },
  { value: 0,    label: 'Maintain',           note: 'Stay where you are' },
  { value: 0.5,  label: 'Gain 0.5 lb / week', note: 'Lean bulk' },
  { value: 1,    label: 'Gain 1 lb / week',   note: 'Bulk' },
];

export function activityMultiplier(level) {
  return ACTIVITY_LEVELS.find((l) => l.value === level)?.multiplier ?? 1.2;
}

// Mifflin-St Jeor. Inputs in imperial; converts internally.
// Returns null if any required field is missing/invalid.
export function bmrMifflin({ sex, age, heightInches, weightLbs }) {
  const a = Number(age);
  const h = Number(heightInches);
  const w = Number(weightLbs);
  if (!sex || !a || !h || !w) return null;
  const kg = w * 0.45359237;
  const cm = h * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * a;
  const bmr = sex === 'female' ? base - 161 : base + 5;
  return Math.round(bmr);
}

export function tdee(bmr, activityLevel) {
  if (!bmr) return null;
  return Math.round(bmr * activityMultiplier(activityLevel));
}

// 1 lb body weight ≈ 3500 kcal → 500 kcal/day per 1 lb/week.
export function calorieTargetForRate(tdeeKcal, rateLbsPerWeek) {
  if (!tdeeKcal) return null;
  const delta = (Number(rateLbsPerWeek) || 0) * 500;
  return Math.max(1000, Math.round(tdeeKcal + delta));
}

// Default macro split:
//   protein ≈ 0.9 g/lb bodyweight (clamped so it never exceeds 40% of calories)
//   fat ≈ 0.35 g/lb bodyweight (clamped to remaining after protein)
//   carbs fills the rest
export function defaultMacros({ calories, weightLbs }) {
  if (!calories || !weightLbs) {
    return { proteinGrams: 0, fatGrams: 0, carbsGrams: 0 };
  }
  const proteinTarget = Math.round(weightLbs * 0.9);
  const proteinCap = Math.floor((calories * 0.4) / 4);
  const proteinGrams = Math.min(proteinTarget, proteinCap);
  const proteinKcal = proteinGrams * 4;

  const remaining = Math.max(0, calories - proteinKcal);
  const fatTarget = Math.round(weightLbs * 0.35);
  const fatCap = Math.floor(remaining / 9);
  const fatGrams = Math.min(fatTarget, fatCap);
  const fatKcal = fatGrams * 9;

  const carbsGrams = Math.max(0, Math.round((remaining - fatKcal) / 4));
  return { proteinGrams, fatGrams, carbsGrams };
}

// Project ETA to goal given current weight, goal weight, and weekly rate.
// Returns { weeks, days } or null if not solvable in the right direction.
export function etaToGoal({ currentWeightLbs, goalWeightLbs, rateLbsPerWeek }) {
  const cur = Number(currentWeightLbs);
  const goal = Number(goalWeightLbs);
  const rate = Number(rateLbsPerWeek);
  if (!cur || !goal || !rate) return null;
  const remaining = cur - goal;
  if (Math.abs(remaining) < 0.1) return { weeks: 0, days: 0 };
  const losing = rate < 0;
  const needLoss = remaining > 0;
  if (losing !== needLoss) return null; // wrong direction
  const weeks = Math.abs(remaining) / Math.abs(rate);
  return { weeks, days: weeks * 7 };
}

export const ONBOARDING_STEPS = [
  'basics',
  'activity',
  'goal',
  'targets',
  'compounds',
  'install',
  'notifications',
  'done',
];
