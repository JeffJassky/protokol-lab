// Pure helpers for the server-side endogenous sim runner. Ported from
// client/src/workers/endogenous.helpers.js — no DOM, no globals, callable
// from Node. The two implementations must stay structurally identical
// so server-rendered series matches what the worker would have produced.

import { DEFAULT_SUBJECT, CONDITION_LIBRARY } from '@kyneticbio/core';

// Build a Subject from a partial profile (see buildSubjectFromUser in
// inputs.js for how UserSettings → partial). Anything not supplied falls
// back to DEFAULT_SUBJECT.
export function buildSubject(partial = {}) {
  const out = { ...DEFAULT_SUBJECT };
  if (partial.sex === 'male' || partial.sex === 'female') out.sex = partial.sex;
  if (Number.isFinite(partial.ageYears)) out.age = partial.ageYears;
  if (Number.isFinite(partial.weightKg)) out.weight = partial.weightKg;
  if (Number.isFinite(partial.heightCm)) out.height = partial.heightCm;
  if (Number.isFinite(partial.cycleDay)) out.cycleDay = partial.cycleDay;
  if (Number.isFinite(partial.cycleLength)) out.cycleLength = partial.cycleLength;
  if (Number.isFinite(partial.lutealPhaseLength)) out.lutealPhaseLength = partial.lutealPhaseLength;
  if (partial.bloodwork && typeof partial.bloodwork === 'object') {
    const baseBw = (out.bloodwork && typeof out.bloodwork === 'object') ? out.bloodwork : {};
    const merged = { ...baseBw };
    for (const [panel, fields] of Object.entries(partial.bloodwork)) {
      if (!fields || typeof fields !== 'object') continue;
      merged[panel] = { ...(baseBw[panel] || {}), ...fields };
    }
    out.bloodwork = merged;
  }
  if (partial.genetics && typeof partial.genetics === 'object') {
    const baseG = (out.genetics && typeof out.genetics === 'object') ? out.genetics : {};
    const merged = { ...baseG };
    for (const [panel, fields] of Object.entries(partial.genetics)) {
      if (!fields || typeof fields !== 'object') continue;
      merged[panel] = { ...(baseG[panel] || {}), ...fields };
    }
    out.genetics = merged;
  }
  return out;
}

export function buildConditionState(partial = {}) {
  const out = {};
  for (const def of CONDITION_LIBRARY) {
    const userEntry = partial[def.key] || {};
    const params = {};
    for (const p of def.params) {
      const userVal = userEntry.params?.[p.key];
      params[p.key] = Number.isFinite(userVal) ? Number(userVal) : p.default;
    }
    out[def.key] = {
      enabled: Boolean(userEntry.enabled),
      params,
    };
  }
  return out;
}

export function foodParamsFromNutrients(n = {}) {
  const sugar = Number(n.sugar) || 0;
  const carbs = Number(n.carbs) || 0;
  const fiber = Number(n.fiber) || 0;
  const protein = Number(n.protein) || 0;
  const fat = Number(n.fat) || 0;
  const carbStarch = Math.max(0, carbs - sugar - fiber);
  return {
    carbSugar: sugar,
    carbStarch,
    protein,
    fat,
    fiber,
    glycemicIndex: 60,
    waterMl: 200,
    temperature: 'warm',
  };
}

export function utcDayKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

export function utcMidnight(isoDate) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, 0, 0);
}

export function minuteOfUtcDay(timestampMs) {
  const ms = timestampMs - utcMidnight(utcDayKey(timestampMs));
  return Math.max(0, Math.min(1439, Math.round(ms / 60_000)));
}
