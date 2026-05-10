// Single source of truth for exercise burn math + energy-mode policy.
// Importable from server (route auto-derive on save), client (live
// preview in the modal, daily target adjustment), and the agent
// (when reasoning about today's effective calorie budget).
//
// All numbers are unit-agnostic on the inputs and operate on the
// canonical schema (lbs / minutes / MET). Conversion to display units
// happens at the rendering layer.

export const LB_PER_KG = 2.2046226218;

// Per-engine-class fallback MET. Used when the user picks "Quick" or
// types a free-form workout with no catalog activity to source a
// metValue. Numbers from Compendium of Physical Activities (Ainsworth
// 2011), rounded to one decimal.
export const ENGINE_CLASS_DEFAULT_MET = Object.freeze({
  exercise_cardio: 6.0,
  exercise_resistance: 5.0,
  exercise_hiit: 8.0,
  exercise_recovery: 2.5,
});

export const ENGINE_CLASSES = Object.freeze([
  'exercise_cardio',
  'exercise_resistance',
  'exercise_hiit',
  'exercise_recovery',
]);

export function defaultMetForClass(engineClass) {
  return ENGINE_CLASS_DEFAULT_MET[engineClass] || ENGINE_CLASS_DEFAULT_MET.exercise_cardio;
}

// Standard MET formula: kcal = MET × kg × hours × intensity.
// Intensity is clamped to [0.5, 1.5] to match the schema validator —
// outside that range a workout would imply an effort level the MET
// table can't honestly represent (5x intensity isn't 5x burn).
export function computeKcal({ metValue, weightLbs, durationMin, intensity = 1.0 }) {
  const kg = Number(weightLbs) > 0 ? Number(weightLbs) / LB_PER_KG : 70;
  const hours = Math.max(0, Number(durationMin) || 0) / 60;
  const met = Math.max(1, Number(metValue) || 1);
  const i = Math.max(0.5, Math.min(1.5, Number(intensity) || 1.0));
  return Math.round(met * kg * hours * i);
}

// Energy-mode policy. Returns the effective daily calorie target after
// applying the user's setting to a base target + that day's burn.
//
//   'baseline' — burn is informational only, target stays put. Default
//                when the user's TDEE multiplier already covers
//                typical workouts.
//   'earn'     — each workout adds calories to the day's target.
//                Pairs with a sedentary TDEE on the profile.
//   'hidden'   — legacy mode (no longer user-selectable). Treated as
//                'baseline' for new code paths.
export function effectiveDailyCalTarget({ baseTarget, burnedKcal, energyMode }) {
  const base = Number(baseTarget) || 0;
  const burn = Number(burnedKcal) || 0;
  if (energyMode === 'earn') return base + burn;
  return base;
}

export const VALID_ENERGY_MODES = Object.freeze(['baseline', 'earn']);
