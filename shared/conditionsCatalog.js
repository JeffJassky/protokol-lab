// Whitelist of condition keys recognized by the simulation engine.
// Mirrors @kyneticbio/core's `ConditionKey` union — kept here as plain
// data so the server can sanitize input without pulling the core
// package in. If core ever adds a new condition, add it here too.

export const CONDITION_KEYS = [
  'adhd',
  'autism',
  'depression',
  'anxiety',
  'pots',
  'mcas',
  'insomnia',
  'pcos',
  'comt',
  'mthfr',
];

export const CONDITION_KEY_SET = new Set(CONDITION_KEYS);

// Sanitize a `{ [conditionKey]: { enabled, params: {...} } }` map.
// Drops unknown condition keys and unknown param keys. Non-finite param
// values fall through to their schema defaults (handled client-side by
// the engine's buildConditionAdjustments).
export function sanitizeConditionsState(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!CONDITION_KEY_SET.has(key)) continue;
    const enabled = Boolean(raw?.enabled);
    const params = {};
    if (raw?.params && typeof raw.params === 'object') {
      for (const [pk, pv] of Object.entries(raw.params)) {
        const n = Number(pv);
        if (Number.isFinite(n)) params[pk] = n;
      }
    }
    out[key] = { enabled, params };
  }
  return out;
}
