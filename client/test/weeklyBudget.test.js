// useWeeklyBudget — gap-aware rolling-7 math + energy-mode integration.
// Locks in the contract documented in:
//   docs/tracked-untracked-days.md
//   docs/exercise-energy-modes.md
//
// Strategy: mock the `api` module so the composable can be instantiated
// without HTTP, seed each underlying store directly, then read the
// composable's computed outputs. This bypasses the onMounted refresh()
// (which tries to fetch — onMounted is a no-op outside a component
// setup context anyway).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the api module before any store imports it. Every store fetch
// becomes a no-op so we can directly seed state.
vi.mock('../src/api/index.js', () => ({
  api: {
    get: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
    put: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  },
  registerPlanLimitHandler: vi.fn(),
}));

import { useWeeklyBudget } from '../src/composables/useWeeklyBudget.js';
import { useFoodLogStore } from '../src/stores/foodlog.js';
import { useSettingsStore } from '../src/stores/settings.js';
import { useDayStatusStore } from '../src/stores/dayStatus.js';
import { useExerciseLogStore } from '../src/stores/exerciselog.js';

// Helpers — produce date strings relative to "today" so the rolling-7
// window always lines up regardless of when the suite runs.
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seedSettings({
  calories = 1800,
  proteinGrams = 150,
  fatGrams = 65,
  carbsGrams = 200,
  energyMode = 'baseline',
  confirmationMode = 'passive',
} = {}) {
  const settings = useSettingsStore();
  settings.settings = {
    targets: { calories, proteinGrams, fatGrams, carbsGrams },
    exercise: { enabled: true, energyMode },
    tracking: { confirmationMode },
  };
  settings.loaded = true;
}

function seedNutrition(rows) {
  // rows: [{ date, calories, protein, fat, carbs }]
  const food = useFoodLogStore();
  food.dailyNutrition = rows.map((r) => ({
    protein: 0, fat: 0, carbs: 0,
    ...r,
  }));
}

function seedBurn(rows) {
  // rows: [{ date, caloriesBurned, durationMin? }]
  const ex = useExerciseLogStore();
  ex.dailyBurn = rows.map((r) => ({ durationMin: 0, ...r }));
}

function seedDayStatus(rows) {
  // rows: [{ date, status, reason? }]
  const ds = useDayStatusStore();
  const map = new Map();
  for (const r of rows) map.set(r.date, { reason: 'other', ...r });
  ds.byDate = map;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useWeeklyBudget — base (no gaps, no exercise)', () => {
  it('counts all 7 days when each day has food logged', () => {
    seedSettings({ calories: 2000 });
    seedNutrition(Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i),
      calories: 1500,
    })));
    const b = useWeeklyBudget();
    expect(b.countedDays.value).toBe(7);
    expect(b.weekTarget.value.calories).toBe(14000);
    expect(b.consumed.value.calories).toBe(7 * 1500);
    expect(b.delta.value.calories).toBe(14000 - 10500);
    expect(b.windowLabel.value).toBe('7-day budget');
  });

  it('emits null targets when settings are missing', () => {
    const b = useWeeklyBudget();
    expect(b.weekTarget.value).toBeNull();
    expect(b.delta.value).toBeNull();
  });
});

describe('useWeeklyBudget — passive mode (auto gap detection)', () => {
  it('auto-untracks past days with zero food entries', () => {
    seedSettings({ calories: 2000 });
    // Today + 3 days ago have food; the other 5 past days have none.
    seedNutrition([
      { date: todayStr(), calories: 1200 },
      { date: daysAgo(3), calories: 1800 },
    ]);
    const b = useWeeklyBudget();
    // counted = today (pending) + day -3 = 2
    expect(b.countedDays.value).toBe(2);
    expect(b.weekTarget.value.calories).toBe(4000);
    expect(b.consumed.value.calories).toBe(1200 + 1800);
    expect(b.windowLabel.value).toBe('2-day rolling budget');
  });

  it('today is always counted as tracked-pending even with zero entries', () => {
    seedSettings({ calories: 2000 });
    // No food anywhere — but today should still count.
    const b = useWeeklyBudget();
    const today = b.perDay.value.find((d) => d.isToday);
    expect(today.disposition).toBe('tracked-pending');
    expect(today.isCounted).toBe(true);
    // 6 past days zero-logged → all auto-untracked. Only today counts.
    expect(b.countedDays.value).toBe(1);
    expect(b.windowLabel.value).toBe('1-day rolling budget');
  });

  it('explicit DayStatus row overrides auto-classification', () => {
    seedSettings({ calories: 2000 });
    seedNutrition([{ date: daysAgo(2), calories: 1500 }]);
    // Mark a zero-log day as intentionally fasted → counts toward week.
    seedDayStatus([{ date: daysAgo(4), status: 'tracked', reason: 'fasted' }]);

    const b = useWeeklyBudget();
    // counted = today + day -2 (auto) + day -4 (explicit fasted) = 3
    expect(b.countedDays.value).toBe(3);
    expect(b.weekTarget.value.calories).toBe(6000);
    expect(b.consumed.value.calories).toBe(1500); // -4 contributes 0 (fasted)
  });

  it('explicit untracked overrides auto-tracked food day', () => {
    seedSettings({ calories: 2000 });
    seedNutrition([
      { date: daysAgo(1), calories: 2500 }, // partial / unreliable
      { date: daysAgo(2), calories: 1800 },
    ]);
    seedDayStatus([
      { date: daysAgo(1), status: 'untracked', reason: 'partial' },
    ]);

    const b = useWeeklyBudget();
    // -1 has food but explicitly untracked → excluded.
    // -2 auto-tracked → counted.
    // today counted (pending).
    expect(b.countedDays.value).toBe(2);
    expect(b.consumed.value.calories).toBe(1800);
  });
});

describe('useWeeklyBudget — affirmative mode', () => {
  it('past days with food but no explicit row stay untracked', () => {
    seedSettings({ calories: 2000, confirmationMode: 'affirmative' });
    seedNutrition([
      { date: daysAgo(1), calories: 1500 },
      { date: daysAgo(2), calories: 1800 },
      { date: todayStr(), calories: 1200 },
    ]);
    const b = useWeeklyBudget();
    // Affirmative: past days require explicit tracked row. Only today
    // (pending) counts.
    expect(b.countedDays.value).toBe(1);
    expect(b.consumed.value.calories).toBe(1200);
  });

  it('explicit tracked rows count past days in affirmative mode', () => {
    seedSettings({ calories: 2000, confirmationMode: 'affirmative' });
    seedNutrition([
      { date: daysAgo(1), calories: 1500 },
      { date: daysAgo(2), calories: 1800 },
      { date: todayStr(), calories: 1200 },
    ]);
    seedDayStatus([
      { date: daysAgo(1), status: 'tracked', reason: 'other' },
    ]);
    const b = useWeeklyBudget();
    expect(b.countedDays.value).toBe(2); // today + -1
    expect(b.consumed.value.calories).toBe(1500 + 1200);
  });
});

describe('useWeeklyBudget — energy modes', () => {
  it('baseline: target unchanged regardless of burn', () => {
    seedSettings({ calories: 2000, energyMode: 'baseline' });
    seedNutrition(Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i), calories: 1800,
    })));
    seedBurn([
      { date: todayStr(), caloriesBurned: 400 },
      { date: daysAgo(2), caloriesBurned: 300 },
    ]);
    const b = useWeeklyBudget();
    // Burn should NOT enter the target.
    expect(b.weekTarget.value.calories).toBe(7 * 2000);
  });

  it('earn: target bumps proportionally to burn on counted days', () => {
    seedSettings({ calories: 2000, energyMode: 'earn' });
    seedNutrition(Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i), calories: 1800,
    })));
    seedBurn([
      { date: todayStr(), caloriesBurned: 400 },
      { date: daysAgo(2), caloriesBurned: 300 },
    ]);
    const b = useWeeklyBudget();
    // 7 × 2000 base + 400 + 300 = 14700
    expect(b.weekTarget.value.calories).toBe(14000 + 700);
  });

  it('earn: workouts on untracked days are excluded (strict universal)', () => {
    seedSettings({ calories: 2000, energyMode: 'earn' });
    // Day -3 has no food (auto-untracked) but a logged workout.
    seedNutrition([
      { date: todayStr(), calories: 1500 },
      { date: daysAgo(1), calories: 1800 },
    ]);
    seedBurn([
      { date: todayStr(), caloriesBurned: 200 },
      { date: daysAgo(3), caloriesBurned: 500 }, // untracked day
    ]);
    const b = useWeeklyBudget();
    // counted = today + -1 = 2 days. Burn pool only includes today's 200.
    expect(b.countedDays.value).toBe(2);
    expect(b.weekTarget.value.calories).toBe(2000 + 2000 + 200);
  });

  it('hidden: same math as baseline (target flat); burn presence is a UI concern', () => {
    seedSettings({ calories: 2000, energyMode: 'hidden' });
    seedNutrition(Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i), calories: 1800,
    })));
    seedBurn([{ date: todayStr(), caloriesBurned: 500 }]);
    const b = useWeeklyBudget();
    expect(b.weekTarget.value.calories).toBe(14000);
  });
});

describe('useWeeklyBudget — empty / edge states', () => {
  it('zero counted days → windowLabel is null (UI uses empty state)', () => {
    seedSettings({ calories: 2000, confirmationMode: 'affirmative' });
    // Affirmative mode + no explicit rows + no food today → today still
    // pending counts as 1. Force fully empty by marking today untracked.
    seedDayStatus([
      { date: todayStr(), status: 'untracked', reason: 'forgot' },
    ]);
    const b = useWeeklyBudget();
    expect(b.countedDays.value).toBe(0);
    expect(b.windowLabel.value).toBeNull();
  });

  it('windowLabel switches to N-day framing when N < 5', () => {
    seedSettings({ calories: 2000 });
    // Only today + day -1 logged.
    seedNutrition([
      { date: todayStr(), calories: 1500 },
      { date: daysAgo(1), calories: 1800 },
    ]);
    const b = useWeeklyBudget();
    expect(b.countedDays.value).toBe(2);
    expect(b.windowLabel.value).toBe('2-day rolling budget');
  });

  it('windowLabel reads "7-day budget" once N ≥ 5', () => {
    seedSettings({ calories: 2000 });
    seedNutrition(Array.from({ length: 5 }, (_, i) => ({
      date: daysAgo(i), calories: 1800,
    })));
    const b = useWeeklyBudget();
    expect(b.countedDays.value).toBe(5);
    expect(b.windowLabel.value).toBe('7-day budget');
  });

  it('adjustedToday = weekTarget − past6Counted (lets today carry the slack)', () => {
    seedSettings({ calories: 2000 });
    // 6 past days logged at 1500 each (300 under target each → 1800 banked).
    seedNutrition([
      ...Array.from({ length: 6 }, (_, i) => ({
        date: daysAgo(i + 1), calories: 1500,
      })),
      { date: todayStr(), calories: 0 },
    ]);
    const b = useWeeklyBudget();
    // weekTarget = 7 × 2000 = 14000
    // past6Counted = 6 × 1500 = 9000
    // adjustedToday = 14000 - 9000 = 5000
    expect(b.adjustedToday.value.calories).toBe(5000);
  });
});

describe('useWeeklyBudget — dispositionSource flag', () => {
  it('marks explicit overrides distinctly from auto-classification', () => {
    seedSettings({ calories: 2000 });
    seedNutrition([
      { date: daysAgo(1), calories: 1500 }, // auto-tracked
    ]);
    seedDayStatus([
      { date: daysAgo(2), status: 'untracked', reason: 'vacation' }, // explicit
    ]);
    const b = useWeeklyBudget();
    const d1 = b.perDay.value.find((d) => d.date === daysAgo(1));
    const d2 = b.perDay.value.find((d) => d.date === daysAgo(2));
    expect(d1.dispositionSource).toBe('auto');
    expect(d2.dispositionSource).toBe('explicit');
  });
});
