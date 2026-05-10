// Re-exports the canonical bloodwork catalog from @kyneticbio/core
// alongside the input-validation helpers the server + client need.
// The catalog itself (panel labels, reference ranges, defaults, etc.)
// lives in core so we never have to keep two copies in sync.
//
// We reach into core's built `dist/` directly via relative path because
// log/shared/ has no node_modules of its own — Node's resolution walks
// up from the importer file's location, and neither log/ nor / hold the
// `@kyneticbio/core` package. Going through a relative path is uglier
// than the package alias but keeps the shared module dep-free.

import {
  BLOODWORK_PANELS,
  BLOODWORK_FIELD_INDEX,
} from '../../../core/dist/index.js';

export { BLOODWORK_PANELS, BLOODWORK_FIELD_INDEX };

// Coerce + validate a single bloodwork entry. Returns the cleaned numeric
// value (clamped to slider bounds) or null when the field is unknown
// or the value can't be parsed. Categorical fields fall through with
// the raw string if it matches one of the field's options.
export function sanitizeBloodworkValue(dotPath, raw) {
  const field = BLOODWORK_FIELD_INDEX.get(dotPath);
  if (!field) return null;
  if (raw === null || raw === undefined || raw === '') return null;
  if (field.isCategorical) {
    const s = String(raw);
    return field.options.includes(s) ? s : null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const min = Number.isFinite(field.sliderMin) ? field.sliderMin : -Infinity;
  const max = Number.isFinite(field.sliderMax) ? field.sliderMax : Infinity;
  return Math.max(min, Math.min(max, n));
}

// Convert flat `{ 'metabolic.glucose_mg_dL': 95 }` → nested
// `{ metabolic: { glucose_mg_dL: 95 } }` (the engine's Subject.bloodwork
// shape).
export function expandBloodworkFlat(flat = {}) {
  const out = {};
  for (const [dotPath, value] of Object.entries(flat)) {
    if (value === null || value === undefined) continue;
    const [panel, field] = dotPath.split('.');
    if (!panel || !field) continue;
    if (!out[panel]) out[panel] = {};
    out[panel][field] = value;
  }
  return out;
}

// Inverse: nested → flat, used when the client reads from settings.
export function flattenBloodworkNested(nested = {}) {
  const out = {};
  if (!nested || typeof nested !== 'object') return out;
  for (const [panel, fields] of Object.entries(nested)) {
    if (!fields || typeof fields !== 'object') continue;
    for (const [field, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      out[`${panel}.${field}`] = value;
    }
  }
  return out;
}
