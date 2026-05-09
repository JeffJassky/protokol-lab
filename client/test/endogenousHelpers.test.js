// Pure helpers extracted from endogenous.worker.js. These run in node
// without a Worker context — see the worker file for the orchestration
// that ties these into the simulation engine.

import { describe, it, expect } from 'vitest';
import {
  buildSubject,
  buildConditionState,
  foodParamsFromNutrients,
  utcDayKey,
  utcMidnight,
  minuteOfUtcDay,
} from '../src/workers/endogenous.helpers.js';
import { DEFAULT_SUBJECT, CONDITION_LIBRARY } from '@kyneticbio/core';

describe('buildSubject', () => {
  it('returns DEFAULT_SUBJECT shape when no overrides', () => {
    const out = buildSubject();
    expect(out.sex).toBe(DEFAULT_SUBJECT.sex);
    expect(out.age).toBe(DEFAULT_SUBJECT.age);
    expect(out.weight).toBe(DEFAULT_SUBJECT.weight);
    expect(out.height).toBe(DEFAULT_SUBJECT.height);
  });

  it('applies finite numeric overrides', () => {
    const out = buildSubject({
      ageYears: 35,
      weightKg: 72.5,
      heightCm: 178,
    });
    expect(out.age).toBe(35);
    expect(out.weight).toBe(72.5);
    expect(out.height).toBe(178);
  });

  it('rejects non-finite numeric overrides', () => {
    const out = buildSubject({
      ageYears: NaN,
      weightKg: 'heavy',
      heightCm: undefined,
    });
    expect(out.age).toBe(DEFAULT_SUBJECT.age);
    expect(out.weight).toBe(DEFAULT_SUBJECT.weight);
    expect(out.height).toBe(DEFAULT_SUBJECT.height);
  });

  it('only accepts male/female for sex', () => {
    expect(buildSubject({ sex: 'male' }).sex).toBe('male');
    expect(buildSubject({ sex: 'female' }).sex).toBe('female');
    expect(buildSubject({ sex: 'other' }).sex).toBe(DEFAULT_SUBJECT.sex);
    expect(buildSubject({ sex: '' }).sex).toBe(DEFAULT_SUBJECT.sex);
  });

  it('shallow-merges bloodwork per panel, preserving unsupplied panels', () => {
    const out = buildSubject({
      bloodwork: {
        metabolic: { glucose_mg_dL: 110 },
      },
    });
    expect(out.bloodwork.metabolic.glucose_mg_dL).toBe(110);
    // Other metabolic fields from DEFAULT_SUBJECT survive the merge.
    const defaultMetabolicKeys = Object.keys(DEFAULT_SUBJECT.bloodwork?.metabolic || {});
    if (defaultMetabolicKeys.length > 1) {
      const otherKey = defaultMetabolicKeys.find((k) => k !== 'glucose_mg_dL');
      if (otherKey) {
        expect(out.bloodwork.metabolic[otherKey]).toBe(
          DEFAULT_SUBJECT.bloodwork.metabolic[otherKey],
        );
      }
    }
  });

  it('ignores non-object bloodwork panels', () => {
    const out = buildSubject({ bloodwork: { metabolic: null } });
    // Should not crash; metabolic stays at default if it was there.
    expect(out.bloodwork).toBeDefined();
  });

  it('shallow-merges genetics per panel', () => {
    const out = buildSubject({
      genetics: {
        pharmacogenomics: { cyp2d6_metabolizer: 'Poor' },
      },
    });
    expect(out.genetics.pharmacogenomics.cyp2d6_metabolizer).toBe('Poor');
  });
});

describe('buildConditionState', () => {
  it('hydrates every condition from the library, defaulted to disabled', () => {
    const out = buildConditionState();
    for (const def of CONDITION_LIBRARY) {
      expect(out[def.key]).toBeDefined();
      expect(out[def.key].enabled).toBe(false);
      for (const p of def.params) {
        expect(out[def.key].params[p.key]).toBe(p.default);
      }
    }
  });

  it('respects user enabled flag and param overrides', () => {
    const firstDef = CONDITION_LIBRARY[0];
    const partial = { [firstDef.key]: { enabled: true } };
    if (firstDef.params.length) {
      partial[firstDef.key].params = { [firstDef.params[0].key]: 0.42 };
    }
    const out = buildConditionState(partial);
    expect(out[firstDef.key].enabled).toBe(true);
    if (firstDef.params.length) {
      expect(out[firstDef.key].params[firstDef.params[0].key]).toBe(0.42);
    }
  });

  it('rejects non-finite param values, falling back to default', () => {
    const firstDef = CONDITION_LIBRARY[0];
    if (!firstDef.params.length) return;
    const out = buildConditionState({
      [firstDef.key]: { enabled: true, params: { [firstDef.params[0].key]: NaN } },
    });
    expect(out[firstDef.key].params[firstDef.params[0].key]).toBe(firstDef.params[0].default);
  });
});

describe('foodParamsFromNutrients', () => {
  it('derives starch as carbs minus sugar minus fiber', () => {
    const p = foodParamsFromNutrients({ carbs: 50, sugar: 10, fiber: 5 });
    expect(p.carbSugar).toBe(10);
    expect(p.carbStarch).toBe(35);
    expect(p.fiber).toBe(5);
  });

  it('clamps starch to zero when subtypes exceed total carbs', () => {
    const p = foodParamsFromNutrients({ carbs: 10, sugar: 8, fiber: 5 });
    expect(p.carbStarch).toBe(0);
  });

  it('coerces non-numeric inputs to zero', () => {
    const p = foodParamsFromNutrients({ carbs: 'lots', sugar: undefined, fat: null });
    expect(p.carbSugar).toBe(0);
    expect(p.carbStarch).toBe(0);
    expect(p.fat).toBe(0);
  });

  it('defaults missing nutrients to a neutral meal shape', () => {
    const p = foodParamsFromNutrients();
    expect(p.glycemicIndex).toBe(60);
    expect(p.waterMl).toBe(200);
    expect(p.temperature).toBe('warm');
  });
});

describe('utcDayKey / utcMidnight / minuteOfUtcDay', () => {
  it('utcDayKey returns YYYY-MM-DD for a UTC instant', () => {
    expect(utcDayKey(Date.UTC(2026, 4, 9, 12, 30))).toBe('2026-05-09');
  });

  it('utcMidnight inverts utcDayKey', () => {
    const ts = Date.UTC(2026, 4, 9, 12, 30);
    expect(utcMidnight(utcDayKey(ts))).toBe(Date.UTC(2026, 4, 9, 0, 0));
  });

  it('minuteOfUtcDay returns the minute offset from UTC midnight', () => {
    expect(minuteOfUtcDay(Date.UTC(2026, 4, 9, 0, 0))).toBe(0);
    expect(minuteOfUtcDay(Date.UTC(2026, 4, 9, 1, 30))).toBe(90);
    expect(minuteOfUtcDay(Date.UTC(2026, 4, 9, 23, 59))).toBe(1439);
  });

  it('minuteOfUtcDay clamps to [0, 1439]', () => {
    // Even with sub-minute precision, the result stays in range.
    expect(minuteOfUtcDay(Date.UTC(2026, 4, 9, 23, 59, 59, 999))).toBe(1439);
  });
});
